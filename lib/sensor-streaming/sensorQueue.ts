import * as SQLite from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BatchStatus = 'pending' | 'sent' | 'acked' | 'failed';

export type SensorBatchRow = {
  id: number;
  batch_id: string;
  data: string;
  qos: number;
  status: BatchStatus;
  created_at: number; // epoch ms (integer for fast comparison)
  sent_at: number | null;
  acked_at: number | null;
  retry_count: number;
};

export type QueueStats = {
  pending: number;
  sent: number;
  acked: number;
  failed: number;
  total: number;
  oldestPendingAgeMs: number | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of pending+sent rows before oldest are evicted */
const MAX_QUEUE_DEPTH = 10_000;

/** How many rows to evict when we hit the cap (evict oldest pending first) */
const EVICTION_BATCH_SIZE = 500;

/** How many batches to insert in a single transaction */
const TRANSACTION_BATCH_SIZE = 100;

/** Default retention for acked batches (ms) */
const DEFAULT_ACKED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/** Default retention for failed batches (ms) */
const DEFAULT_FAILED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// SensorQueue
// ---------------------------------------------------------------------------

export class SensorQueue {
  private db?: SQLite.SQLiteDatabase;
  private initPromise?: Promise<void>;
  private initFailed = false;

  // Cached queue depth (updated on insert/delete, avoids COUNT(*) on every insert)
  private cachedPendingCount = 0;
  private lastCountRefreshAt = 0;
  private static readonly COUNT_REFRESH_INTERVAL_MS = 30_000;

  // Batch insert accumulator for high-throughput scenarios
  private pendingInserts: { batchId: string; data: string; qos: number }[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private isFlushing = false;

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initFailed) {
      console.warn('[SensorQueue] Database init previously failed, skipping');
      return;
    }
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync('sensor_queue.db');

      // ── Performance pragmas ──────────────────────────────────────────
      // WAL mode: ~5-10× faster for concurrent read/write workloads
      await this.db.execAsync(`PRAGMA journal_mode = WAL;`);
      // NORMAL sync is safe with WAL and much faster than FULL
      await this.db.execAsync(`PRAGMA synchronous = NORMAL;`);
      // Larger page cache: 4 MB (1024 pages × 4 KB)
      await this.db.execAsync(`PRAGMA cache_size = -4000;`);
      // Store temp tables in memory
      await this.db.execAsync(`PRAGMA temp_store = MEMORY;`);
      // Enable memory-mapped I/O (64 MB)
      await this.db.execAsync(`PRAGMA mmap_size = 67108864;`);

      // ── Schema ───────────────────────────────────────────────────────
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS sensor_batches (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id    TEXT    UNIQUE NOT NULL,
          data        TEXT    NOT NULL,
          qos         INTEGER DEFAULT 1,
          status      TEXT    DEFAULT 'pending',
          created_at  INTEGER NOT NULL,
          sent_at     INTEGER,
          acked_at    INTEGER,
          retry_count INTEGER DEFAULT 0
        );
      `);

      // ── Indexes (idempotent) ─────────────────────────────────────────
      // Composite index for the most frequent query pattern: list unacked
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_batches_status_created
        ON sensor_batches (status, created_at ASC)
        WHERE status IN ('pending', 'sent');
      `);
      // Index for cleanup queries
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_batches_acked_at
        ON sensor_batches (acked_at)
        WHERE status = 'acked';
      `);
      // Index for failed cleanup
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_batches_failed_created
        ON sensor_batches (created_at)
        WHERE status = 'failed';
      `);

      // ── Migrate legacy datetime columns to integer if needed ─────────
      await this._migrateIfNeeded();

      // ── Warm up the cached count ─────────────────────────────────────
      await this._refreshPendingCount();

      console.log(
        `[SensorQueue] Initialized (WAL mode, ${this.cachedPendingCount} pending)`,
      );
    } catch (error) {
      this.initFailed = true;
      this.db = undefined;
      console.error('[SensorQueue] Failed to initialize database:', error);
    }
  }

  /**
   * If the table was created with DATETIME (text) columns by a previous version,
   * migrate the data to integer epoch ms. This is a no-op if already migrated.
   */
  private async _migrateIfNeeded(): Promise<void> {
    if (!this.db) return;
    try {
      // Check column type by looking at a sample row's created_at
      const sample = await this.db.getFirstAsync<{ created_at: unknown }>(
        `SELECT created_at FROM sensor_batches LIMIT 1`,
      );
      if (sample && typeof sample.created_at === 'string') {
        console.log('[SensorQueue] Migrating datetime columns to integer...');
        await this.db.execAsync(`
          UPDATE sensor_batches
          SET created_at = CAST(strftime('%s', created_at) AS INTEGER) * 1000,
              sent_at    = CASE WHEN sent_at IS NOT NULL
                                THEN CAST(strftime('%s', sent_at) AS INTEGER) * 1000
                                ELSE NULL END,
              acked_at   = CASE WHEN acked_at IS NOT NULL
                                THEN CAST(strftime('%s', acked_at) AS INTEGER) * 1000
                                ELSE NULL END;
        `);
        console.log('[SensorQueue] Migration complete');
      }
    } catch {
      // Not critical – old data will still work, just slower comparisons
    }
  }

  private isReady(): boolean {
    return this.db !== undefined && !this.initFailed;
  }

  // -----------------------------------------------------------------------
  // Insert (with transaction batching)
  // -----------------------------------------------------------------------

  /**
   * Queue a batch for insert. Inserts are automatically coalesced into
   * transactions for much higher throughput (~10-50× faster than individual
   * INSERTs on SQLite).
   */
  async insertPendingBatch(params: {
    batchId: string;
    data: string;
    qos?: number;
  }): Promise<void> {
    if (!this.isReady()) return;

    // Check queue depth cap
    await this._enforceQueueCap();

    this.pendingInserts.push({
      batchId: params.batchId,
      data: params.data,
      qos: params.qos ?? 1,
    });

    // If we've accumulated enough, flush immediately
    if (this.pendingInserts.length >= TRANSACTION_BATCH_SIZE) {
      await this._flushInserts();
    } else {
      // Otherwise schedule a micro-flush so we don't hold data too long
      this._scheduleFlush();
    }
  }

  /**
   * Insert a single batch immediately (bypasses batching).
   * Use for low-frequency inserts like background location.
   */
  async insertPendingBatchImmediate(params: {
    batchId: string;
    data: string;
    qos?: number;
  }): Promise<void> {
    if (!this.isReady()) return;

    try {
      const now = Date.now();
      await this.db!.runAsync(
        `INSERT OR IGNORE INTO sensor_batches (batch_id, data, qos, status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`,
        [params.batchId, params.data, params.qos ?? 1, now],
      );
      this.cachedPendingCount++;
    } catch (error) {
      console.warn('[SensorQueue] Failed to insert batch:', error);
    }
  }

  private _scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this._flushInserts();
    }, 50); // 50ms micro-batch window
  }

  private async _flushInserts(): Promise<void> {
    if (this.isFlushing || this.pendingInserts.length === 0) return;
    this.isFlushing = true;

    // Grab current batch and reset
    const batch = this.pendingInserts;
    this.pendingInserts = [];

    try {
      const now = Date.now();
      // Use a single transaction for all inserts (massive perf win on SQLite)
      await this.db!.withExclusiveTransactionAsync(async (txn) => {
        for (const item of batch) {
          await txn.runAsync(
            `INSERT OR IGNORE INTO sensor_batches (batch_id, data, qos, status, created_at)
             VALUES (?, ?, ?, 'pending', ?)`,
            [item.batchId, item.data, item.qos, now],
          );
        }
      });
      this.cachedPendingCount += batch.length;
    } catch (error) {
      console.warn(
        `[SensorQueue] Transaction insert failed for ${batch.length} batches:`,
        error,
      );
      // Fall back to individual inserts so we don't lose data
      const now = Date.now();
      for (const item of batch) {
        try {
          await this.db!.runAsync(
            `INSERT OR IGNORE INTO sensor_batches (batch_id, data, qos, status, created_at)
             VALUES (?, ?, ?, 'pending', ?)`,
            [item.batchId, item.data, item.qos, now],
          );
          this.cachedPendingCount++;
        } catch {
          // Individual insert failed – skip it
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  // -----------------------------------------------------------------------
  // Status transitions
  // -----------------------------------------------------------------------

  async markSent(batchId: string): Promise<void> {
    if (!this.isReady()) return;
    try {
      await this.db!.runAsync(
        `UPDATE sensor_batches
         SET status = 'sent', sent_at = ?
         WHERE batch_id = ? AND status IN ('pending', 'sent')`,
        [Date.now(), batchId],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to mark sent:', error);
    }
  }

  async markAcked(batchId: string): Promise<void> {
    if (!this.isReady()) return;
    try {
      const result = await this.db!.runAsync(
        `UPDATE sensor_batches
         SET status = 'acked', acked_at = ?
         WHERE batch_id = ? AND status IN ('pending', 'sent')`,
        [Date.now(), batchId],
      );
      if (result.changes > 0) {
        this.cachedPendingCount = Math.max(0, this.cachedPendingCount - 1);
      }
    } catch (error) {
      console.warn('[SensorQueue] Failed to mark acked:', error);
    }
  }

  /**
   * Acknowledge multiple batches in a single transaction.
   * Much faster than calling markAcked() in a loop.
   */
  async markAckedBulk(batchIds: string[]): Promise<number> {
    if (!this.isReady() || batchIds.length === 0) return 0;

    try {
      let totalChanges = 0;
      const now = Date.now();

      // Process in chunks to avoid SQLite variable limit (999)
      const chunkSize = 500;
      for (let i = 0; i < batchIds.length; i += chunkSize) {
        const chunk = batchIds.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');
        const result = await this.db!.runAsync(
          `UPDATE sensor_batches
           SET status = 'acked', acked_at = ?
           WHERE batch_id IN (${placeholders}) AND status IN ('pending', 'sent')`,
          [now, ...chunk],
        );
        totalChanges += result.changes;
      }

      this.cachedPendingCount = Math.max(
        0,
        this.cachedPendingCount - totalChanges,
      );
      return totalChanges;
    } catch (error) {
      console.warn('[SensorQueue] Failed to bulk ack:', error);
      return 0;
    }
  }

  async bumpRetry(batchId: string): Promise<void> {
    if (!this.isReady()) return;
    try {
      await this.db!.runAsync(
        `UPDATE sensor_batches
         SET retry_count = retry_count + 1
         WHERE batch_id = ? AND status IN ('pending', 'sent')`,
        [batchId],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to bump retry:', error);
    }
  }

  async markFailed(batchId: string): Promise<void> {
    if (!this.isReady()) return;
    try {
      const result = await this.db!.runAsync(
        `UPDATE sensor_batches
         SET status = 'failed'
         WHERE batch_id = ? AND status IN ('pending', 'sent')`,
        [batchId],
      );
      if (result.changes > 0) {
        this.cachedPendingCount = Math.max(0, this.cachedPendingCount - 1);
      }
    } catch (error) {
      console.warn('[SensorQueue] Failed to mark batch as failed:', error);
    }
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /**
   * Returns the approximate number of pending+sent (unacked) batches.
   * Uses a cached value that is periodically refreshed for speed.
   */
  async countPending(): Promise<number> {
    if (!this.isReady()) return 0;

    const now = Date.now();
    if (
      now - this.lastCountRefreshAt >
      SensorQueue.COUNT_REFRESH_INTERVAL_MS
    ) {
      await this._refreshPendingCount();
    }
    return this.cachedPendingCount;
  }

  /**
   * Force-refresh the pending count from the database.
   */
  private async _refreshPendingCount(): Promise<void> {
    if (!this.isReady()) return;
    try {
      const row = await this.db!.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM sensor_batches WHERE status IN ('pending', 'sent')`,
      );
      this.cachedPendingCount = row?.cnt ?? 0;
      this.lastCountRefreshAt = Date.now();
    } catch {
      // Keep using cached value
    }
  }

  /**
   * List unacked batches ordered by creation time (oldest first).
   * Uses the covering index for maximum speed.
   */
  async listUnackedBatches(limit = 500): Promise<SensorBatchRow[]> {
    if (!this.isReady()) return [];

    try {
      const rows = await this.db!.getAllAsync<SensorBatchRow>(
        `SELECT id, batch_id, data, qos, status, created_at, sent_at, acked_at, retry_count
         FROM sensor_batches
         WHERE status IN ('pending', 'sent')
         ORDER BY created_at ASC
         LIMIT ?`,
        [limit],
      );

      return rows.map((r) => ({
        ...r,
        data: typeof r.data === 'string' ? r.data : String(r.data),
      }));
    } catch (error) {
      console.warn('[SensorQueue] Failed to list unacked batches:', error);
      return [];
    }
  }

  /**
   * Get high-level queue statistics (for UX display).
   */
  async getStats(): Promise<QueueStats> {
    if (!this.isReady()) {
      return {
        pending: 0,
        sent: 0,
        acked: 0,
        failed: 0,
        total: 0,
        oldestPendingAgeMs: null,
      };
    }

    try {
      const counts = await this.db!.getFirstAsync<{
        pending: number;
        sent: number;
        acked: number;
        failed: number;
        total: number;
      }>(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'sent'    THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'acked'   THEN 1 ELSE 0 END) as acked,
          SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) as failed,
          COUNT(*)                                              as total
        FROM sensor_batches
      `);

      const oldest = await this.db!.getFirstAsync<{
        oldest_created: number | null;
      }>(`
        SELECT MIN(created_at) as oldest_created
        FROM sensor_batches
        WHERE status IN ('pending', 'sent')
      `);

      const oldestAge =
        oldest?.oldest_created != null
          ? Date.now() - oldest.oldest_created
          : null;

      return {
        pending: counts?.pending ?? 0,
        sent: counts?.sent ?? 0,
        acked: counts?.acked ?? 0,
        failed: counts?.failed ?? 0,
        total: counts?.total ?? 0,
        oldestPendingAgeMs: oldestAge,
      };
    } catch (error) {
      console.warn('[SensorQueue] Failed to get stats:', error);
      return {
        pending: 0,
        sent: 0,
        acked: 0,
        failed: 0,
        total: 0,
        oldestPendingAgeMs: null,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup & Maintenance
  // -----------------------------------------------------------------------

  /**
   * Delete acknowledged batches older than the given number of days.
   * Uses integer epoch comparison (much faster than datetime string parsing).
   */
  async deleteAckedOlderThan(days: number): Promise<number> {
    if (!this.isReady()) return 0;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    try {
      const result = await this.db!.runAsync(
        `DELETE FROM sensor_batches WHERE status = 'acked' AND acked_at < ?`,
        [cutoff],
      );
      if (result.changes > 0) {
        console.log(
          `[SensorQueue] Cleaned up ${result.changes} old acked batches`,
        );
      }
      return result.changes;
    } catch (error) {
      console.warn('[SensorQueue] Failed to delete old batches:', error);
      return 0;
    }
  }

  /**
   * Delete failed batches older than the retention period.
   */
  async deleteFailedOlderThan(ms: number = DEFAULT_FAILED_RETENTION_MS): Promise<number> {
    if (!this.isReady()) return 0;

    const cutoff = Date.now() - ms;
    try {
      const result = await this.db!.runAsync(
        `DELETE FROM sensor_batches WHERE status = 'failed' AND created_at < ?`,
        [cutoff],
      );
      if (result.changes > 0) {
        console.log(
          `[SensorQueue] Cleaned up ${result.changes} old failed batches`,
        );
      }
      return result.changes;
    } catch (error) {
      console.warn('[SensorQueue] Failed to delete failed batches:', error);
      return 0;
    }
  }

  /**
   * Comprehensive cleanup: acked retention + failed retention + VACUUM if needed.
   * Call periodically (e.g. every hour).
   */
  async performMaintenance(options?: {
    ackedRetentionMs?: number;
    failedRetentionMs?: number;
    vacuum?: boolean;
  }): Promise<void> {
    if (!this.isReady()) return;

    const ackedRet = options?.ackedRetentionMs ?? DEFAULT_ACKED_RETENTION_MS;
    const failedRet = options?.failedRetentionMs ?? DEFAULT_FAILED_RETENTION_MS;

    const ackedDeleted = await this.deleteAckedOlderThan(
      ackedRet / (24 * 60 * 60 * 1000),
    );
    const failedDeleted = await this.deleteFailedOlderThan(failedRet);

    // Only VACUUM if we deleted a significant number of rows (expensive operation)
    if (options?.vacuum || ackedDeleted + failedDeleted > 1000) {
      try {
        await this.db!.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
        console.log('[SensorQueue] WAL checkpoint completed');
      } catch (error) {
        console.warn('[SensorQueue] WAL checkpoint failed:', error);
      }
    }

    // Refresh the cached count after cleanup
    await this._refreshPendingCount();
  }

  // -----------------------------------------------------------------------
  // Queue depth cap (eviction)
  // -----------------------------------------------------------------------

  /**
   * If the queue exceeds MAX_QUEUE_DEPTH, evict the oldest pending batches.
   * This prevents the SQLite database from growing unbounded when the network
   * is down for extended periods.
   */
  private async _enforceQueueCap(): Promise<void> {
    if (this.cachedPendingCount < MAX_QUEUE_DEPTH) return;

    try {
      // Evict oldest pending batches (they're the least likely to be relevant)
      const result = await this.db!.runAsync(
        `DELETE FROM sensor_batches
         WHERE id IN (
           SELECT id FROM sensor_batches
           WHERE status = 'pending'
           ORDER BY created_at ASC
           LIMIT ?
         )`,
        [EVICTION_BATCH_SIZE],
      );

      if (result.changes > 0) {
        this.cachedPendingCount = Math.max(
          0,
          this.cachedPendingCount - result.changes,
        );
        console.warn(
          `[SensorQueue] Queue cap reached (${MAX_QUEUE_DEPTH}), evicted ${result.changes} oldest batches`,
        );
      }
    } catch (error) {
      console.warn('[SensorQueue] Failed to enforce queue cap:', error);
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Flush any pending inserts and close the database.
   */
  async close(): Promise<void> {
    // Flush any pending inserts
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.pendingInserts.length > 0) {
      await this._flushInserts();
    }

    if (this.db) {
      try {
        // Final WAL checkpoint before closing
        await this.db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {
        // Best effort
      }
      this.db = undefined;
    }
  }
}

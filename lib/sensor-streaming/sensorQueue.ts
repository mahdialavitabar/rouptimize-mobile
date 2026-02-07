import * as SQLite from 'expo-sqlite';

type SensorBatchRow = {
  id: number;
  batch_id: string;
  data: string;
  qos: number;
  status: 'pending' | 'sent' | 'acked' | 'failed';
  created_at: string;
  sent_at: string | null;
  acked_at: string | null;
  retry_count: number;
};

export class SensorQueue {
  private db?: SQLite.SQLiteDatabase;
  private initPromise?: Promise<void>;
  private initFailed = false;

  async init(): Promise<void> {
    // If already initialized successfully, return
    if (this.db) {
      return;
    }

    // If init previously failed, don't retry
    if (this.initFailed) {
      console.warn('[SensorQueue] Database init previously failed, skipping');
      return;
    }

    // If init is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync('sensor_queue.db');

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS sensor_batches (
          id INTEGER PRIMARY KEY,
          batch_id TEXT UNIQUE,
          data BLOB,
          qos INTEGER DEFAULT 1,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          sent_at DATETIME,
          acked_at DATETIME,
          retry_count INTEGER DEFAULT 0
        );
      `);
      console.log('[SensorQueue] Database initialized successfully');
    } catch (error) {
      this.initFailed = true;
      this.db = undefined;
      console.error('[SensorQueue] Failed to initialize database:', error);
      // Don't throw - allow app to continue without offline queue
    }
  }

  private isReady(): boolean {
    return this.db !== undefined && !this.initFailed;
  }

  async insertPendingBatch(params: {
    batchId: string;
    data: string;
    qos?: number;
  }): Promise<void> {
    if (!this.isReady()) {
      // Silently skip if database unavailable - data will be sent directly without offline queue
      return;
    }

    try {
      await this.db!.runAsync(
        `INSERT OR IGNORE INTO sensor_batches (batch_id, data, qos, status) VALUES (?, ?, ?, 'pending')`,
        [params.batchId, params.data, params.qos ?? 1],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to insert batch:', error);
    }
  }

  async markSent(batchId: string): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await this.db!.runAsync(
        `UPDATE sensor_batches SET status='sent', sent_at=CURRENT_TIMESTAMP WHERE batch_id=? AND status IN ('pending','sent')`,
        [batchId],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to mark sent:', error);
    }
  }

  async markAcked(batchId: string): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await this.db!.runAsync(
        `UPDATE sensor_batches SET status='acked', acked_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
        [batchId],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to mark acked:', error);
    }
  }

  async bumpRetry(batchId: string): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await this.db!.runAsync(
        `UPDATE sensor_batches SET retry_count = retry_count + 1 WHERE batch_id=? AND status IN ('pending','sent')`,
        [batchId],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to bump retry:', error);
    }
  }

  async markFailed(batchId: string): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await this.db!.runAsync(
        `UPDATE sensor_batches SET status='failed' WHERE batch_id=? AND status IN ('pending','sent')`,
        [batchId],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to mark batch as failed:', error);
    }
  }

  async countPending(): Promise<number> {
    if (!this.isReady()) {
      return 0;
    }

    try {
      const row = await this.db!.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM sensor_batches WHERE status IN ('pending','sent')`,
      );
      return row?.cnt ?? 0;
    } catch (error) {
      console.warn('[SensorQueue] Failed to count pending:', error);
      return 0;
    }
  }

  async listUnackedBatches(limit = 500): Promise<SensorBatchRow[]> {
    if (!this.isReady()) {
      return [];
    }

    try {
      const rows = await this.db!.getAllAsync<SensorBatchRow>(
        `SELECT id, batch_id, data as data, qos, status, created_at, sent_at, acked_at, retry_count
         FROM sensor_batches
         WHERE status IN ('pending','sent')
         ORDER BY datetime(created_at) ASC
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

  async deleteAckedOlderThan(days: number): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await this.db!.runAsync(
        `DELETE FROM sensor_batches WHERE status='acked' AND datetime(acked_at) < datetime('now', ?)`,
        [`-${days} days`],
      );
    } catch (error) {
      console.warn('[SensorQueue] Failed to delete old batches:', error);
    }
  }
}

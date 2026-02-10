import { SensorQueue } from './sensorQueue';
import { SensorBatch } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum retries per individual publish attempt */
const MAX_IMMEDIATE_RETRIES = 3;
/** Base delay between retries (doubles each attempt) */
const RETRY_BASE_DELAY_MS = 1_000;
/** Min interval for draining unacked batches from the local queue */
const QUEUE_DRAIN_MIN_INTERVAL_MS = 5_000;
/** Max interval (backs off to this when queue is empty) */
const QUEUE_DRAIN_MAX_INTERVAL_MS = 30_000;
/** Max batches to drain per cycle */
const QUEUE_DRAIN_BATCH_SIZE = 100;
/** Max retry count before a batch is marked permanently failed */
const MAX_QUEUE_RETRY_COUNT = 20;
/** Max batches to coalesce into a single HTTP request */
const MAX_COALESCE_SIZE = 50;
/** HTTP request timeout (ms) */
const HTTP_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

type CircuitState = 'closed' | 'open' | 'half-open';

/** Number of consecutive failures before opening the circuit */
const CIRCUIT_FAILURE_THRESHOLD = 5;
/** How long the circuit stays open before trying half-open (ms) */
const CIRCUIT_OPEN_DURATION_MS = 30_000;
/** Number of successes in half-open required to close the circuit */
const CIRCUIT_HALF_OPEN_SUCCESSES = 2;

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastOpenedAt = 0;

  get isOpen(): boolean {
    if (this.state === 'open') {
      // Check if cooldown has elapsed → transition to half-open
      if (Date.now() - this.lastOpenedAt >= CIRCUIT_OPEN_DURATION_MS) {
        this.state = 'half-open';
        this.successCount = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  get currentState(): CircuitState {
    // Trigger the time-based transition check
    if (this.state === 'open') {
      void this.isOpen;
    }
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= CIRCUIT_HALF_OPEN_SUCCESSES) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.state === 'half-open') {
      // Immediately re-open on any failure in half-open
      this.state = 'open';
      this.lastOpenedAt = Date.now();
    } else if (this.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      this.state = 'open';
      this.lastOpenedAt = Date.now();
      console.warn(
        `[ClickHouseSensorClient] Circuit OPEN after ${this.failureCount} consecutive failures. ` +
          `Will retry in ${CIRCUIT_OPEN_DURATION_MS / 1000}s`,
      );
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastOpenedAt = 0;
  }
}

// ---------------------------------------------------------------------------
// Config & Types
// ---------------------------------------------------------------------------

type ClickHouseSensorClientConfig = {
  url: string;
  user: string;
  password: string;
  deviceId: string;
  queue: SensorQueue;
  onSendSuccess?: () => void;
  onSendFailure?: () => void;
  /** Called with round-trip latency in ms after each successful HTTP call */
  onLatency?: (latencyMs: number) => void;
  /** Called with the number of pending batches in the local queue */
  onQueueDepth?: (depth: number) => void;
};

/** Shape of a single row in ClickHouse JSONEachRow format */
interface ClickHouseRow {
  batch_id: string;
  device_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  readings: string; // JSON-encoded array of SensorReading
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ClickHouseSensorClient {
  private readonly url: string;
  private readonly user: string;
  private readonly password: string;
  private readonly deviceId: string;
  private readonly queue: SensorQueue;
  private readonly onSendSuccess?: () => void;
  private readonly onSendFailure?: () => void;
  private readonly onLatency?: (latencyMs: number) => void;
  private readonly onQueueDepth?: (depth: number) => void;

  private drainTimer?: ReturnType<typeof setTimeout>;
  private isDraining = false;
  private currentDrainInterval = QUEUE_DRAIN_MIN_INTERVAL_MS;
  private readonly circuit = new CircuitBreaker();

  // Batch coalescing buffer: accumulate batches between drain cycles
  private coalesceBuffer: { batchId: string; row: ClickHouseRow }[] = [];
  private coalesceTimer?: ReturnType<typeof setTimeout>;
  private readonly coalesceWindowMs = 100; // 100ms coalesce window

  // Auth header cached (avoid re-encoding on every request)
  private readonly authHeader: string;

  constructor(config: ClickHouseSensorClientConfig) {
    this.url = config.url;
    this.user = config.user;
    this.password = config.password;
    this.deviceId = config.deviceId;
    this.queue = config.queue;
    this.onSendSuccess = config.onSendSuccess;
    this.onSendFailure = config.onSendFailure;
    this.onLatency = config.onLatency;
    this.onQueueDepth = config.onQueueDepth;

    this.authHeader = 'Basic ' + btoa(`${this.user}:${this.password}`);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(): void {
    this.circuit.reset();
    this.scheduleDrain();
    // Kick off an initial drain immediately
    void this.drainQueue();
  }

  stop(): void {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = undefined;
    }
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = undefined;
    }
    // Flush any remaining coalesced batches to the local queue
    // (they're already persisted via insertPendingBatch, so just clear the buffer)
    this.coalesceBuffer = [];
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Enqueue a sensor batch for persistence to ClickHouse.
   *
   * The batch is:
   * 1. Immediately persisted to the local SQLite queue (crash-safe)
   * 2. Added to a coalesce buffer
   * 3. Sent in a coalesced HTTP request (JSONEachRow format) for maximum throughput
   */
  async enqueueAndPublishBatch(batch: SensorBatch): Promise<void> {
    const row = this.batchToRow(batch);
    const jsonPayload = JSON.stringify(row);

    // Persist to local queue first (safety net)
    await this.queue.insertPendingBatch({
      batchId: batch.batchId,
      data: jsonPayload,
      qos: 1,
    });

    // Add to coalesce buffer
    this.coalesceBuffer.push({ batchId: batch.batchId, row });

    // Flush if buffer is full, otherwise schedule a micro-flush
    if (this.coalesceBuffer.length >= MAX_COALESCE_SIZE) {
      await this.flushCoalesceBuffer();
    } else {
      this.scheduleCoalesceFlush();
    }
  }

  // -----------------------------------------------------------------------
  // Coalesce Buffer
  // -----------------------------------------------------------------------

  private scheduleCoalesceFlush(): void {
    if (this.coalesceTimer) return;
    this.coalesceTimer = setTimeout(() => {
      this.coalesceTimer = undefined;
      void this.flushCoalesceBuffer();
    }, this.coalesceWindowMs);
  }

  private async flushCoalesceBuffer(): Promise<void> {
    if (this.coalesceBuffer.length === 0) return;

    // Grab current buffer and reset
    const entries = this.coalesceBuffer;
    this.coalesceBuffer = [];

    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = undefined;
    }

    // If circuit is open, don't attempt – the drain will retry later
    if (this.circuit.isOpen) {
      return;
    }

    const batchIds = entries.map((e) => e.batchId);
    const rows = entries.map((e) => e.row);

    const ok = await this.publishJsonRows(rows);
    if (ok) {
      // Bulk-ack all successfully sent batches
      await this.queue.markAckedBulk(batchIds);
      // Report per-batch success for UX status
      for (let i = 0; i < batchIds.length; i++) {
        this.onSendSuccess?.();
      }
    } else {
      // All failed – they remain in the queue for the drain cycle to retry
      for (let i = 0; i < batchIds.length; i++) {
        this.onSendFailure?.();
      }
    }
  }

  // -----------------------------------------------------------------------
  // HTTP Transport (JSONEachRow format)
  // -----------------------------------------------------------------------

  /**
   * Send one or more rows to ClickHouse using the JSONEachRow format via POST body.
   *
   * Benefits over the old VALUES-in-URL approach:
   * - No SQL injection (data is never interpolated into SQL)
   * - POST body is not URL-length-limited
   * - ClickHouse parses JSONEachRow ~2× faster than VALUES for complex types
   * - Proper escaping handled by JSON.stringify
   *
   * Returns true if ALL rows were acknowledged by ClickHouse.
   */
  private async publishJsonRows(rows: ClickHouseRow[]): Promise<boolean> {
    if (rows.length === 0) return true;

    // Build the NDJSON body (one JSON object per line)
    const body = rows.map((r) => JSON.stringify(r)).join('\n');

    // The query goes in the URL, the data goes in the POST body
    const query = `INSERT INTO rouptimize.sensor_queue FORMAT JSONEachRow`;
    const requestUrl = `${this.url}?query=${encodeURIComponent(query)}`;

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latency = Date.now() - startTime;
      this.onLatency?.(latency);

      if (response.ok) {
        this.circuit.recordSuccess();
        return true;
      }

      // Non-retryable errors (4xx except 429)
      const status = response.status;
      if (status >= 400 && status < 500 && status !== 429) {
        const responseText = await response.text().catch(() => '');
        console.error(
          `[ClickHouseSensorClient] Permanent error ${status}: ${responseText.slice(0, 200)}`,
        );
        this.circuit.recordFailure();
        return false;
      }

      // Retryable server errors (5xx, 429)
      console.error(
        `[ClickHouseSensorClient] Retryable error: ${status} ${response.statusText}`,
      );
      this.circuit.recordFailure();
      return false;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.onLatency?.(latency);

      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error(
          `[ClickHouseSensorClient] Request timed out after ${HTTP_TIMEOUT_MS}ms`,
        );
      } else {
        console.error('[ClickHouseSensorClient] Network error:', error);
      }
      this.circuit.recordFailure();
      return false;
    }
  }

  /**
   * Publish a single batch with exponential-backoff retry.
   * Used during queue drain for individual retry of failed batches.
   */
  private async publishWithRetry(
    batchId: string,
    jsonData: string,
  ): Promise<boolean> {
    // Parse the stored JSON row back
    let row: ClickHouseRow;
    try {
      row = JSON.parse(jsonData) as ClickHouseRow;
    } catch {
      // If the data is in the old VALUES format, attempt a legacy publish
      return this.publishLegacyPayload(batchId, jsonData);
    }

    for (let attempt = 0; attempt < MAX_IMMEDIATE_RETRIES; attempt++) {
      if (this.circuit.isOpen) {
        // Don't even try when circuit is open
        return false;
      }

      const ok = await this.publishJsonRows([row]);
      if (ok) {
        await this.queue.markAcked(batchId);
        this.onSendSuccess?.();
        return true;
      }

      // Exponential backoff: 1s, 2s, 4s …
      if (attempt < MAX_IMMEDIATE_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // All immediate retries exhausted
    await this.queue.bumpRetry(batchId);
    this.onSendFailure?.();
    return false;
  }

  /**
   * Backwards-compatible publisher for batches stored in the old
   * VALUES format (before migration to JSONEachRow).
   * This ensures no data loss during a rolling upgrade.
   */
  private async publishLegacyPayload(
    batchId: string,
    valuesPayload: string,
  ): Promise<boolean> {
    const query = `INSERT INTO rouptimize.sensor_queue VALUES ${valuesPayload}`;
    const requestUrl = `${this.url}?query=${encodeURIComponent(query)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/octet-stream',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        await this.queue.markAcked(batchId);
        this.circuit.recordSuccess();
        this.onSendSuccess?.();
        return true;
      }

      console.error(
        `[ClickHouseSensorClient] Legacy insert failed: ${response.status}`,
      );
      this.circuit.recordFailure();
      this.onSendFailure?.();
      return false;
    } catch (error) {
      console.error('[ClickHouseSensorClient] Legacy insert error:', error);
      this.circuit.recordFailure();
      this.onSendFailure?.();
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Queue Drain (adaptive interval)
  // -----------------------------------------------------------------------

  private scheduleDrain(): void {
    if (this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = undefined;
      void this.drainQueue().then(() => this.scheduleDrain());
    }, this.currentDrainInterval);
  }

  /**
   * Drain the local SQLite queue – retry any pending/sent but unacknowledged
   * batches. Handles network outages, app backgrounding, etc.
   *
   * The drain interval adapts:
   * - Queue has items → drain every 5s (fast recovery)
   * - Queue is empty  → drain every 30s (save battery)
   * - Circuit is open → skip and wait for cooldown
   */
  private async drainQueue(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;

    try {
      // Report queue depth for UX
      const pendingCount = await this.queue.countPending();
      this.onQueueDepth?.(pendingCount);

      // If circuit is open, skip this cycle entirely
      if (this.circuit.isOpen) {
        console.log(
          `[ClickHouseSensorClient] Circuit open, skipping drain (${pendingCount} pending)`,
        );
        this.currentDrainInterval = QUEUE_DRAIN_MAX_INTERVAL_MS;
        return;
      }

      const unacked = await this.queue.listUnackedBatches(
        QUEUE_DRAIN_BATCH_SIZE,
      );

      if (unacked.length === 0) {
        // Nothing to drain → back off
        this.currentDrainInterval = QUEUE_DRAIN_MAX_INTERVAL_MS;
        return;
      }

      // There's work to do → use fast interval
      this.currentDrainInterval = QUEUE_DRAIN_MIN_INTERVAL_MS;

      console.log(
        `[ClickHouseSensorClient] Draining queue: ${unacked.length} unacked batches ` +
          `(circuit: ${this.circuit.currentState})`,
      );

      // ── Coalesce drain batches for bulk send ─────────────────────────
      const sendable: { batchId: string; row: ClickHouseRow }[] = [];
      const tooManyRetries: string[] = [];

      for (const entry of unacked) {
        if (entry.retry_count >= MAX_QUEUE_RETRY_COUNT) {
          tooManyRetries.push(entry.batch_id);
          continue;
        }

        // Try to parse as JSON row
        try {
          const row = JSON.parse(entry.data) as ClickHouseRow;
          sendable.push({ batchId: entry.batch_id, row });
        } catch {
          // Legacy format – send individually
          const ok = await this.publishLegacyPayload(
            entry.batch_id,
            entry.data,
          );
          if (!ok) {
            await this.queue.bumpRetry(entry.batch_id);
            // If a send fails, stop draining – network is likely down
            break;
          }
        }

        // Stop accumulating if circuit opened during iteration
        if (this.circuit.isOpen) break;
      }

      // Mark permanently failed batches
      for (const batchId of tooManyRetries) {
        await this.queue.markFailed(batchId);
        console.warn(
          `[ClickHouseSensorClient] Batch ${batchId} exceeded ${MAX_QUEUE_RETRY_COUNT} retries, marking failed`,
        );
      }

      // ── Send coalesced batches in chunks ─────────────────────────────
      if (sendable.length > 0 && !this.circuit.isOpen) {
        // Send in chunks of MAX_COALESCE_SIZE
        for (let i = 0; i < sendable.length; i += MAX_COALESCE_SIZE) {
          if (this.circuit.isOpen) break;

          const chunk = sendable.slice(i, i + MAX_COALESCE_SIZE);
          const rows = chunk.map((c) => c.row);
          const batchIds = chunk.map((c) => c.batchId);

          const ok = await this.publishJsonRows(rows);
          if (ok) {
            await this.queue.markAckedBulk(batchIds);
            for (let j = 0; j < batchIds.length; j++) {
              this.onSendSuccess?.();
            }
          } else {
            // Bump retry for all failed batches in this chunk
            for (const id of batchIds) {
              await this.queue.bumpRetry(id);
            }
            // Stop draining – network is likely down
            break;
          }
        }
      }
    } catch (error) {
      console.error('[ClickHouseSensorClient] Queue drain error:', error);
    } finally {
      this.isDraining = false;
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Convert a SensorBatch to a ClickHouse JSONEachRow object.
   * This is the canonical serialization format — no SQL interpolation.
   */
  private batchToRow(batch: SensorBatch): ClickHouseRow {
    return {
      batch_id: batch.batchId,
      device_id: batch.deviceId,
      driver_id: batch.driverId ?? null,
      vehicle_id: batch.vehicleId ?? null,
      readings: JSON.stringify(batch.readings),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

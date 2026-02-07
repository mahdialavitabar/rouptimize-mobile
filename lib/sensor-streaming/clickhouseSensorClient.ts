import { SensorQueue } from './sensorQueue';
import { SensorBatch } from './types';

/** Maximum retries per individual batch publish attempt */
const MAX_IMMEDIATE_RETRIES = 3;
/** Base delay between retries (doubles each attempt) */
const RETRY_BASE_DELAY_MS = 1_000;
/** Interval for draining unacked batches from the local queue */
const QUEUE_DRAIN_INTERVAL_MS = 15_000;
/** Max batches to drain per cycle */
const QUEUE_DRAIN_BATCH_SIZE = 50;
/** Max retry count before a batch is marked permanently failed */
const MAX_QUEUE_RETRY_COUNT = 20;

type ClickHouseSensorClientConfig = {
  url: string;
  user: string;
  password: string;
  deviceId: string;
  queue: SensorQueue;
  onSendSuccess?: () => void;
  onSendFailure?: () => void;
};

export class ClickHouseSensorClient {
  private readonly url: string;
  private readonly user: string;
  private readonly password: string;
  private readonly deviceId: string;
  private readonly queue: SensorQueue;
  private readonly onSendSuccess?: () => void;
  private readonly onSendFailure?: () => void;
  private drainTimer?: ReturnType<typeof setInterval>;
  private isDraining = false;

  constructor(config: ClickHouseSensorClientConfig) {
    this.url = config.url;
    this.user = config.user;
    this.password = config.password;
    this.deviceId = config.deviceId;
    this.queue = config.queue;
    this.onSendSuccess = config.onSendSuccess;
    this.onSendFailure = config.onSendFailure;
  }

  start(): void {
    // Start periodic queue drain to retry failed batches
    this.drainTimer = setInterval(() => {
      void this.drainQueue();
    }, QUEUE_DRAIN_INTERVAL_MS);

    // Kick off an initial drain immediately
    void this.drainQueue();
  }

  stop(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = undefined;
    }
  }

  async enqueueAndPublishBatch(batch: SensorBatch): Promise<void> {
    const readingsJson = JSON.stringify(batch.readings);
    const payload = `('${batch.batchId}', '${batch.deviceId}', ${batch.driverId ? `'${batch.driverId}'` : 'NULL'}, ${batch.vehicleId ? `'${batch.vehicleId}'` : 'NULL'}, '${readingsJson.replace(/'/g, "\\'")}')`;

    await this.queue.insertPendingBatch({
      batchId: batch.batchId,
      data: payload,
      qos: 1,
    });

    await this.publishWithRetry(batch.batchId, payload);
  }

  /**
   * Publish a single batch to ClickHouse with exponential-backoff retry.
   * Returns true if the batch was acknowledged.
   */
  private async publishWithRetry(
    batchId: string,
    payload: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_IMMEDIATE_RETRIES; attempt++) {
      const ok = await this.publishRaw(batchId, payload);
      if (ok) {
        return true;
      }

      // Exponential backoff: 1s, 2s, 4s …
      if (attempt < MAX_IMMEDIATE_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // All immediate retries exhausted – bump retry counter so the queue drain
    // will pick it up later.
    await this.queue.bumpRetry(batchId);
    return false;
  }

  /**
   * Low-level HTTP call. Returns true on success, false on failure.
   */
  private async publishRaw(batchId: string, payload: string): Promise<boolean> {
    const query = `INSERT INTO rouptimize.sensor_queue VALUES ${payload}`;
    const url = `${this.url}?query=${encodeURIComponent(query)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${this.user}:${this.password}`),
          'Content-Type': 'application/octet-stream',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        await this.queue.markAcked(batchId);
        this.onSendSuccess?.();
        return true;
      }

      console.error(
        '[ClickHouseSensorClient] Failed to insert:',
        response.status,
        response.statusText,
      );
      this.onSendFailure?.();
      return false;
    } catch (error) {
      console.error('[ClickHouseSensorClient] Error inserting:', error);
      this.onSendFailure?.();
      return false;
    }
  }

  /**
   * Periodically drain the local SQLite queue – retry any pending/sent but
   * unacknowledged batches. This handles network outages, app backgrounding, etc.
   */
  private async drainQueue(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;

    try {
      const unacked = await this.queue.listUnackedBatches(
        QUEUE_DRAIN_BATCH_SIZE,
      );
      if (unacked.length === 0) return;

      console.log(
        `[ClickHouseSensorClient] Draining queue: ${unacked.length} unacked batches`,
      );

      for (const row of unacked) {
        if (row.retry_count >= MAX_QUEUE_RETRY_COUNT) {
          // Too many retries – mark as permanently failed to avoid infinite loop
          await this.queue.markFailed(row.batch_id);
          console.warn(
            `[ClickHouseSensorClient] Batch ${row.batch_id} exceeded max retries, marking failed`,
          );
          continue;
        }

        const ok = await this.publishRaw(row.batch_id, row.data);
        if (!ok) {
          await this.queue.bumpRetry(row.batch_id);
          // If a send fails, stop draining — network is likely down.
          // Next drain cycle will retry.
          break;
        }
      }
    } catch (error) {
      console.error('[ClickHouseSensorClient] Queue drain error:', error);
    } finally {
      this.isDraining = false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

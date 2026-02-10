import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { vehicleAssignmentService } from '../api/services/vehicle-assignment.service';
import { useAuth } from '../auth';
import {
    startBackgroundLocationTracking,
    stopBackgroundLocationTracking,
} from './backgroundLocationTask';
import { ClickHouseSensorClient } from './clickhouseSensorClient';
import { getOrCreateDeviceId } from './deviceId';
import { useSensorPermission } from './SensorPermissionContext';
import { SensorQueue } from './sensorQueue';
import { SensorReader } from './sensorReader';
import {
    useSensorStreamingStatus,
} from './SensorStreamingStatusContext';
import { SensorBatch, SensorReading } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Generate a compact, collision-resistant batch ID.
 * Uses device ID prefix + timestamp (base36) + random suffix (hex).
 */
function makeBatchId(deviceId: string, prefix = ''): string {
  return `${deviceId}_${prefix}${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum flush interval (ms) – never flush faster than this */
const MIN_FLUSH_INTERVAL_MS = 50;

/** Maximum flush interval (ms) – never wait longer than this */
const MAX_FLUSH_INTERVAL_MS = 1_000;

/** Flush immediately when the buffer exceeds this many readings */
const FLUSH_SIZE_THRESHOLD = 200;

/** Target batch size for optimal ClickHouse throughput */
const TARGET_BATCH_SIZE = 100;

/** How often to run SQLite maintenance (ms) – 1 hour */
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

/** Minimum time between successive adaptive interval adjustments (ms) */
const INTERVAL_ADJUST_COOLDOWN_MS = 2_000;

// ---------------------------------------------------------------------------
// Hook Options
// ---------------------------------------------------------------------------

interface UseAuthenticatedSensorStreamingOptions {
  /** Whether the user is actively navigating. Sensor streaming only runs when true. */
  isNavigating: boolean;
}

// ---------------------------------------------------------------------------
// Double Buffer
// ---------------------------------------------------------------------------

/**
 * A zero-copy double-buffer for sensor readings.
 *
 * Instead of splicing an array (which allocates a new array and copies elements
 * on every flush), we maintain two buffers and atomically swap them. The "write"
 * buffer accumulates incoming readings while the "read" buffer is being flushed.
 *
 * This eliminates per-flush allocation overhead at high sample rates (50-100 Hz
 * × 2 sensors = 100-200 readings/s).
 */
class DoubleBuffer {
  private bufA: SensorReading[] = [];
  private bufB: SensorReading[] = [];
  private writeIndex: 0 | 1 = 0;

  /** Push a reading into the current write buffer */
  push(reading: SensorReading): void {
    if (this.writeIndex === 0) {
      this.bufA.push(reading);
    } else {
      this.bufB.push(reading);
    }
  }

  /** Number of readings in the current write buffer */
  get length(): number {
    return this.writeIndex === 0 ? this.bufA.length : this.bufB.length;
  }

  /**
   * Swap buffers and return the previously-active buffer's contents.
   * The returned array is handed off to the caller; we clear and reuse it
   * on the *next* swap.
   */
  swap(): SensorReading[] {
    if (this.writeIndex === 0) {
      // Swap: write → B, return A
      this.writeIndex = 1;
      this.bufB.length = 0; // clear B for reuse
      return this.bufA;
    } else {
      // Swap: write → A, return B
      this.writeIndex = 0;
      this.bufA.length = 0; // clear A for reuse
      return this.bufB;
    }
  }

  /** Clear both buffers */
  clear(): void {
    this.bufA.length = 0;
    this.bufB.length = 0;
    this.writeIndex = 0;
  }
}

// ---------------------------------------------------------------------------
// Adaptive Flush Interval
// ---------------------------------------------------------------------------

/**
 * Compute the optimal flush interval based on the current data rate.
 *
 * Strategy:
 * - At low rates (< 10 readings/s):  flush less often → bigger batches, fewer HTTP calls
 * - At medium rates (10-100/s):      flush every ~200ms → ~20-50 readings/batch
 * - At high rates (> 100/s):         flush every ~100ms → keep batch size manageable
 * - Always clamp between MIN and MAX
 */
function computeAdaptiveInterval(
  readingsPerSecond: number,
  currentIntervalMs: number,
): number {
  if (readingsPerSecond <= 0) {
    // No data yet – use a conservative interval
    return MAX_FLUSH_INTERVAL_MS;
  }

  // Target: one batch should contain roughly TARGET_BATCH_SIZE readings
  const idealIntervalMs = (TARGET_BATCH_SIZE / readingsPerSecond) * 1000;

  // Smooth towards the ideal (exponential moving average to avoid jitter)
  const alpha = 0.3;
  const smoothed = currentIntervalMs * (1 - alpha) + idealIntervalMs * alpha;

  // Clamp
  return Math.max(MIN_FLUSH_INTERVAL_MS, Math.min(MAX_FLUSH_INTERVAL_MS, Math.round(smoothed)));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook to manage authenticated sensor streaming during navigation.
 *
 * Sensor streaming is only activated when:
 * 1. User is authenticated
 * 2. User has granted sensor permission
 * 3. isNavigating is true (driver is actively navigating a route)
 * 4. EXPO_PUBLIC_SENSOR_STREAMING_ENABLED is 'true'
 *
 * Enhancements over the previous implementation:
 * - **Double buffering**: Zero-copy buffer swap instead of Array.splice
 * - **Adaptive flush interval**: Automatically adjusts based on data rate
 * - **Size-based flush**: Flushes immediately when buffer exceeds threshold
 * - **Latency & queue depth reporting**: Feeds circuit breaker / UX indicators
 * - **Periodic maintenance**: SQLite cleanup + WAL checkpoint
 *
 * @param options.isNavigating - Whether navigation mode is active
 */
export function useAuthenticatedSensorStreaming(
  options: UseAuthenticatedSensorStreamingOptions,
): void {
  const { isNavigating } = options;
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isAllowed: hasPermission, requestPermission } = useSensorPermission();
  const {
    reportSuccess,
    reportFailure,
    reportReadings,
    reportBatchSent,
    reportBatchFailed,
    reportLatency,
    reportQueueDepth,
    setOff,
  } = useSensorStreamingStatus();
  const startedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const sensorClientRef = useRef<ClickHouseSensorClient | undefined>(undefined);
  const readerRef = useRef<SensorReader | undefined>(undefined);
  const permissionRecoveryAttemptedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Auto-recover location permission if it was revoked mid-session
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isNavigating || !isAuthenticated || isLoading) return;
    if (hasPermission) {
      permissionRecoveryAttemptedRef.current = false;
      return;
    }

    // Permission lost while navigating – try to re-request once
    if (!permissionRecoveryAttemptedRef.current) {
      permissionRecoveryAttemptedRef.current = true;
      console.log(
        '[SensorStreaming] Permission lost during navigation, attempting recovery',
      );
      void requestPermission();
    }
  }, [
    hasPermission,
    isNavigating,
    isAuthenticated,
    isLoading,
    requestPermission,
  ]);

  // ---------------------------------------------------------------------------
  // Re-check location permission when app comes back to foreground
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;

      // When returning to foreground, verify location permission is still valid
      if (isNavigating && isAuthenticated) {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted' && !permissionRecoveryAttemptedRef.current) {
            console.log(
              '[SensorStreaming] Foreground permission lost after resume, recovering',
            );
            permissionRecoveryAttemptedRef.current = true;
            void requestPermission();
          }
        } catch {
          // ignore – will be caught by the next sensor read error
        }
      }

      // When user returns from Google Maps / Waze / etc., foreground sensor
      // subscriptions (accel, gyro) may have been terminated by the OS. Restart
      // ALL sensor subscriptions to resume full data collection.
      if (readerRef.current && isNavigating && hasPermission) {
        console.log(
          '[SensorStreaming] App resumed – restarting all foreground sensors',
        );
        try {
          await readerRef.current.ensureAllSensors();
        } catch (e) {
          console.warn(
            '[SensorStreaming] Failed to restart sensors on resume',
            e,
          );
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isNavigating, isAuthenticated, hasPermission, requestPermission]);

  // ---------------------------------------------------------------------------
  // Main streaming lifecycle
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isLoading) {
      return;
    }

    // Stop sensors if user logged out, navigation stopped, or permission revoked
    if (!isAuthenticated || !isNavigating || !hasPermission) {
      if (cleanupRef.current) {
        const reason = !isAuthenticated
          ? 'User logged out'
          : !isNavigating
            ? 'Navigation stopped'
            : 'Permission revoked';
        console.log(`[SensorStreaming] ${reason}, stopping sensors`);
        cleanupRef.current();
        cleanupRef.current = null;
        startedRef.current = false;
        sensorClientRef.current = undefined;
        readerRef.current = undefined;
        setOff();

        // Stop background location tracking
        void stopBackgroundLocationTracking();
      }
      return;
    }

    if (startedRef.current) {
      return;
    }

    if (Platform.OS === 'web') {
      return;
    }

    const enabled =
      (process.env.EXPO_PUBLIC_SENSOR_STREAMING_ENABLED || '').toLowerCase() ===
      'true';

    if (!enabled) {
      console.log('[SensorStreaming] Disabled via environment variable');
      return;
    }

    startedRef.current = true;
    console.log('[SensorStreaming] Starting - navigation mode active');

    // ── Configuration ────────────────────────────────────────────────────
    const initialBatchIntervalMs = parseNumber(
      process.env.EXPO_PUBLIC_SENSOR_BATCH_MS,
      200,
    );
    const sampleRateHz = parseNumber(
      process.env.EXPO_PUBLIC_SENSOR_RATE_HZ,
      50,
    );
    const clickhouseUrl =
      process.env.EXPO_PUBLIC_CLICKHOUSE_URL || 'http://localhost:8123';
    const clickhouseUser = process.env.EXPO_PUBLIC_CLICKHOUSE_USER || 'default';
    const clickhousePassword =
      process.env.EXPO_PUBLIC_CLICKHOUSE_PASSWORD || '123456';
    const cleanupDays = parseNumber(
      process.env.EXPO_PUBLIC_SENSOR_SQLITE_RETENTION_DAYS,
      3,
    );

    // ── State ────────────────────────────────────────────────────────────
    const doubleBuffer = new DoubleBuffer();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let maintenanceTimer: ReturnType<typeof setInterval> | undefined;
    let currentFlushInterval = Math.max(MIN_FLUSH_INTERVAL_MS, initialBatchIntervalMs);
    let lastIntervalAdjust = 0;
    let readingsInLastSecond = 0;
    let rateWindowStart = Date.now();
    let stopped = false;

    const queue = new SensorQueue();
    let sensorClient: ClickHouseSensorClient | undefined;
    let reader: SensorReader | undefined;

    // ── Flush function ───────────────────────────────────────────────────
    const scheduleFlush = () => {
      if (stopped) return;
      flushTimer = setTimeout(flush, currentFlushInterval);
    };

    const flush = () => {
      if (stopped) return;

      const readings = doubleBuffer.swap();
      if (readings.length === 0) {
        scheduleFlush();
        return;
      }

      const locationCount = readings.filter(
        (r) => r.sensor === 'location',
      ).length;
      const accelCount = readings.filter(
        (r) => r.sensor === 'accel',
      ).length;
      const gyroCount = readings.filter((r) => r.sensor === 'gyro').length;

      if (readings.length > 10 || locationCount > 0) {
        console.log(
          `[SensorStreaming] Flushing batch: ${readings.length} readings ` +
            `(accel: ${accelCount}, gyro: ${gyroCount}, gps: ${locationCount}) ` +
            `[interval: ${currentFlushInterval}ms]`,
        );
      }

      const deviceId = currentDeviceId;
      const batch: SensorBatch = {
        batchId: makeBatchId(deviceId),
        deviceId,
        driverId: user?.driverId,
        vehicleId: currentVehicleId,
        readings,
      };

      sensorClient?.enqueueAndPublishBatch(batch).then(
        () => {
          reportBatchSent(readings.length);
        },
        () => {
          reportBatchFailed();
        },
      );

      // ── Adaptive interval adjustment ─────────────────────────────────
      const now = Date.now();
      if (now - lastIntervalAdjust > INTERVAL_ADJUST_COOLDOWN_MS) {
        const elapsed = (now - rateWindowStart) / 1000;
        if (elapsed > 0) {
          const rate = readingsInLastSecond / elapsed;
          currentFlushInterval = computeAdaptiveInterval(
            rate,
            currentFlushInterval,
          );
        }

        // Reset rate measurement window
        readingsInLastSecond = 0;
        rateWindowStart = now;
        lastIntervalAdjust = now;
      }

      scheduleFlush();
    };

    // ── Immediate flush on buffer size threshold ─────────────────────────
    const maybeSizeFlush = () => {
      if (doubleBuffer.length >= FLUSH_SIZE_THRESHOLD && flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
        flush();
      }
    };

    // ── Startup ──────────────────────────────────────────────────────────
    let currentDeviceId = '';
    let currentVehicleId: string | undefined;

    const start = async () => {
      currentDeviceId = await getOrCreateDeviceId();
      try {
        const assignment = await vehicleAssignmentService.getMyAssignment();
        currentVehicleId = assignment.vehicleId;
        console.log('[SensorStreaming] Found vehicle assignment:', currentVehicleId);
      } catch (e) {
        console.warn('[SensorStreaming] Failed to get vehicle assignment', e);
      }

      console.log(
        `[SensorStreaming] Starting with deviceId: ${currentDeviceId}, ` +
          `sampleRate: ${sampleRateHz}Hz, initialInterval: ${currentFlushInterval}ms`,
      );

      await queue.init();

      sensorClient = new ClickHouseSensorClient({
        url: clickhouseUrl,
        user: clickhouseUser,
        password: clickhousePassword,
        deviceId: currentDeviceId,
        queue,
        onSendSuccess: reportSuccess,
        onSendFailure: reportFailure,
        onLatency: reportLatency,
        onQueueDepth: reportQueueDepth,
      });
      sensorClient.start();
      sensorClientRef.current = sensorClient;

      // Start background location tracking for when app is minimized
      await startBackgroundLocationTracking({
        driverId: user?.driverId,
        vehicleId: currentVehicleId,
        clickhouseUrl,
        clickhouseUser,
        clickhousePassword,
      });

      reader = new SensorReader({
        sampleRateHz,
        onReading: (r) => {
          doubleBuffer.push(r);
          readingsInLastSecond++;
          // Report individual reading to throughput tracker
          reportReadings(1, r.sensor as 'accel' | 'gyro' | 'location');
          // Check if we need an immediate size-based flush
          maybeSizeFlush();
        },
        onLocationError: (error) => {
          console.warn('[SensorStreaming] Location error:', error);
          // Auto-recover: try to restart location tracking after a delay
          setTimeout(() => {
            console.log(
              '[SensorStreaming] Auto-recovering location tracking...',
            );
            void reader?.ensureLocationTracking();
          }, 5000);
        },
      });
      await reader.start();
      readerRef.current = reader;

      // Start the flush loop
      scheduleFlush();

      // ── Periodic maintenance ─────────────────────────────────────────
      // Runs SQLite cleanup (acked/failed retention) + WAL checkpoint
      maintenanceTimer = setInterval(() => {
        void queue.performMaintenance({
          ackedRetentionMs: cleanupDays * 24 * 60 * 60 * 1000,
          vacuum: false, // WAL checkpoint only, not full VACUUM
        });
      }, MAINTENANCE_INTERVAL_MS);

      // Run an initial maintenance pass after 30s (don't block startup)
      setTimeout(() => {
        void queue.performMaintenance({
          ackedRetentionMs: cleanupDays * 24 * 60 * 60 * 1000,
          vacuum: false,
        });
      }, 30_000);
    };

    void start();

    // ── Cleanup ──────────────────────────────────────────────────────────
    cleanupRef.current = () => {
      stopped = true;

      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      if (maintenanceTimer) {
        clearInterval(maintenanceTimer);
        maintenanceTimer = undefined;
      }

      // Perform a final flush of any remaining buffered readings
      const remaining = doubleBuffer.swap();
      if (remaining.length > 0 && sensorClient && currentDeviceId) {
        const finalBatch: SensorBatch = {
          batchId: makeBatchId(currentDeviceId, 'final_'),
          deviceId: currentDeviceId,
          driverId: user?.driverId,
          vehicleId: currentVehicleId,
          readings: remaining,
        };
        // Fire-and-forget: we're shutting down, but try to persist
        void sensorClient.enqueueAndPublishBatch(finalBatch).catch(() => {
          console.warn(
            `[SensorStreaming] Failed to flush ${remaining.length} final readings`,
          );
        });
      }

      doubleBuffer.clear();
      reader?.stop();
      sensorClient?.stop();

      // Close the queue gracefully (flushes pending inserts + WAL checkpoint)
      void queue.close();
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [
    isAuthenticated,
    isLoading,
    isNavigating,
    hasPermission,
    reportSuccess,
    reportFailure,
    reportReadings,
    reportBatchSent,
    reportBatchFailed,
    reportLatency,
    reportQueueDepth,
    setOff,
  ]);
}

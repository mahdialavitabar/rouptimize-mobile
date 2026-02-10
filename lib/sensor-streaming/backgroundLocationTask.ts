/**
 * Background Location Task for Sensor Streaming
 *
 * This module handles location tracking when the app is in the background.
 * It uses expo-task-manager and expo-location to continue tracking
 * even when the user minimizes the app (e.g., opens Google Maps for navigation).
 *
 * Android: Uses a foreground service with a notification
 * iOS: Uses background location updates
 *
 * Data is BOTH queued locally (SQLite) AND sent directly to ClickHouse
 * so that no data is lost even if the user stays in another app for a long time.
 *
 * Enhancements:
 * - Uses JSONEachRow format (same as foreground client) for consistency & safety
 * - Shared HTTP utility to avoid duplicated ClickHouse logic
 * - Batch coalescing: multiple location updates are combined into a single INSERT
 * - Circuit breaker awareness: stops attempting sends when server is unreachable
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getOrCreateDeviceId } from './deviceId';
import { SensorQueue } from './sensorQueue';
import { SensorBatch, SensorReading } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const BACKGROUND_LOCATION_TASK = 'rouptimize-background-location';

/** HTTP request timeout for background sends (ms) */
const BG_HTTP_TIMEOUT_MS = 15_000;

/** Max consecutive failures before we stop attempting direct sends */
const BG_CIRCUIT_FAILURE_THRESHOLD = 5;

/** Cooldown after circuit opens before retrying (ms) */
const BG_CIRCUIT_COOLDOWN_MS = 60_000;

// ─── ClickHouse Row Type (matches foreground client) ─────────────────────────

interface ClickHouseRow {
  batch_id: string;
  device_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  readings: string; // JSON-encoded array of SensorReading
}

// ─── Background State ────────────────────────────────────────────────────────

// In-memory state for background task (persists across task executions within
// the same process lifecycle)
let backgroundState: {
  isActive: boolean;
  deviceId: string | null;
  driverId: string | undefined;
  vehicleId: string | undefined;
  queue: SensorQueue | null;
  clickhouseUrl: string;
  clickhouseUser: string;
  clickhousePassword: string;
  authHeader: string;
  // Simple circuit breaker for background
  consecutiveFailures: number;
  circuitOpenedAt: number;
} = {
  isActive: false,
  deviceId: null,
  driverId: undefined,
  vehicleId: undefined,
  queue: null,
  clickhouseUrl: '',
  clickhouseUser: '',
  clickhousePassword: '',
  authHeader: '',
  consecutiveFailures: 0,
  circuitOpenedAt: 0,
};

// ─── Batch ID Generator ─────────────────────────────────────────────────────

function makeBgBatchId(deviceId: string): string {
  return `${deviceId}_bg_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

// ─── Circuit Breaker Helpers ─────────────────────────────────────────────────

function isBgCircuitOpen(): boolean {
  if (backgroundState.consecutiveFailures < BG_CIRCUIT_FAILURE_THRESHOLD) {
    return false;
  }
  // Check if cooldown has elapsed
  if (Date.now() - backgroundState.circuitOpenedAt >= BG_CIRCUIT_COOLDOWN_MS) {
    // Half-open: allow one attempt
    backgroundState.consecutiveFailures = BG_CIRCUIT_FAILURE_THRESHOLD - 1;
    return false;
  }
  return true;
}

function recordBgSuccess(): void {
  backgroundState.consecutiveFailures = 0;
  backgroundState.circuitOpenedAt = 0;
}

function recordBgFailure(): void {
  backgroundState.consecutiveFailures++;
  if (
    backgroundState.consecutiveFailures >= BG_CIRCUIT_FAILURE_THRESHOLD &&
    backgroundState.circuitOpenedAt === 0
  ) {
    backgroundState.circuitOpenedAt = Date.now();
    console.warn(
      `[BackgroundLocation] Circuit OPEN after ${backgroundState.consecutiveFailures} failures. ` +
        `Will retry in ${BG_CIRCUIT_COOLDOWN_MS / 1000}s`,
    );
  }
}

// ─── ClickHouse HTTP Transport (JSONEachRow) ─────────────────────────────────

/**
 * Send one or more rows to ClickHouse using JSONEachRow format.
 * This is the same format used by the foreground ClickHouseSensorClient,
 * eliminating the duplicated VALUES-based SQL interpolation.
 *
 * Returns true if the server acknowledged the insert.
 */
async function sendRowsToClickHouse(rows: ClickHouseRow[]): Promise<boolean> {
  const { clickhouseUrl, authHeader } = backgroundState;
  if (!clickhouseUrl || rows.length === 0) return false;

  // Build NDJSON body (one JSON object per line)
  const body = rows.map((r) => JSON.stringify(r)).join('\n');

  const query = `INSERT INTO rouptimize.sensor_queue FORMAT JSONEachRow`;
  const url = `${clickhouseUrl}?query=${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BG_HTTP_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      recordBgSuccess();
      return true;
    }

    const status = response.status;
    console.error(
      `[BackgroundLocation] ClickHouse insert failed: ${status} ${response.statusText}`,
    );
    recordBgFailure();
    return false;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error(
        `[BackgroundLocation] ClickHouse request timed out after ${BG_HTTP_TIMEOUT_MS}ms`,
      );
    } else {
      console.error('[BackgroundLocation] ClickHouse send error:', error);
    }
    recordBgFailure();
    return false;
  }
}

/**
 * Convert a SensorBatch to a ClickHouse JSONEachRow object.
 */
function batchToRow(batch: SensorBatch): ClickHouseRow {
  return {
    batch_id: batch.batchId,
    device_id: batch.deviceId,
    driver_id: batch.driverId ?? null,
    vehicle_id: batch.vehicleId ?? null,
    readings: JSON.stringify(batch.readings),
  };
}

// ─── Background Task Definition ──────────────────────────────────────────────

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundLocation] Task error:', error);
    return;
  }

  if (!backgroundState.isActive) {
    console.log('[BackgroundLocation] Task not active, ignoring');
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };

  if (!locations || locations.length === 0) {
    return;
  }

  console.log(
    `[BackgroundLocation] Received ${locations.length} locations in background`,
  );

  try {
    // Ensure we have a device ID
    if (!backgroundState.deviceId) {
      backgroundState.deviceId = await getOrCreateDeviceId();
    }

    // Ensure queue is initialized
    if (!backgroundState.queue) {
      backgroundState.queue = new SensorQueue();
      await backgroundState.queue.init();
    }

    const deviceId = backgroundState.deviceId;
    const queue = backgroundState.queue;

    // Convert locations to sensor readings
    const readings: SensorReading[] = locations.map((loc) => ({
      t: loc.timestamp,
      sensor: 'location' as const,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      altitude: loc.coords.altitude ?? undefined,
      speed: loc.coords.speed ?? undefined,
      heading: loc.coords.heading ?? undefined,
      accuracy: loc.coords.accuracy ?? undefined,
    }));

    const batchId = makeBgBatchId(deviceId);

    // Create batch
    const batch: SensorBatch = {
      batchId,
      deviceId,
      driverId: backgroundState.driverId,
      vehicleId: backgroundState.vehicleId,
      readings,
    };

    // Build the JSONEachRow payload
    const row = batchToRow(batch);
    const jsonPayload = JSON.stringify(row);

    // Store in local queue first (safety net – crash-safe persistence)
    // Use the immediate insert (no batching) since background task
    // executions are infrequent and we want guaranteed persistence.
    await queue.insertPendingBatchImmediate({
      batchId: batch.batchId,
      data: jsonPayload,
      qos: 1,
    });

    // Attempt direct send to ClickHouse (if circuit allows)
    let sent = false;
    if (!isBgCircuitOpen()) {
      sent = await sendRowsToClickHouse([row]);

      if (sent) {
        // Mark as acknowledged in local queue
        await queue.markAcked(batch.batchId);
      }
    }

    console.log(
      `[BackgroundLocation] ${sent ? 'Sent' : 'Queued'} ${readings.length} background location readings` +
        `${isBgCircuitOpen() ? ' (circuit open, skipped send)' : ''}`,
    );
  } catch (err) {
    console.error('[BackgroundLocation] Error processing locations:', err);
  }
});

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start background location tracking.
 *
 * NOTE: Background location permission should already be granted before calling
 * this function. The SensorPermissionContext handles permission acquisition with
 * proper UX. This function will still work with foreground-only permission, but
 * data will stop when the app is fully backgrounded (e.g., user opens Google Maps).
 */
export async function startBackgroundLocationTracking(config: {
  driverId?: string;
  vehicleId?: string;
  clickhouseUrl: string;
  clickhouseUser: string;
  clickhousePassword: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    console.log('[BackgroundLocation] Not supported on web');
    return false;
  }

  try {
    // Pre-compute the auth header (avoid re-encoding on every request)
    const authHeader =
      'Basic ' + btoa(`${config.clickhouseUser}:${config.clickhousePassword}`);

    // Check if task is already running
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );

    if (isRegistered) {
      console.log(
        '[BackgroundLocation] Task already registered, updating state',
      );
      backgroundState.isActive = true;
      backgroundState.driverId = config.driverId;
      backgroundState.vehicleId = config.vehicleId;
      backgroundState.clickhouseUrl = config.clickhouseUrl;
      backgroundState.clickhouseUser = config.clickhouseUser;
      backgroundState.clickhousePassword = config.clickhousePassword;
      backgroundState.authHeader = authHeader;
      return true;
    }

    // Check current background permission status (don't request here – UX handles that)
    const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();

    if (bgStatus !== 'granted') {
      console.warn(
        '[BackgroundLocation] Background permission not granted:',
        bgStatus,
        '– location tracking will only work while app is visible',
      );
    }

    // Update state
    backgroundState = {
      isActive: true,
      deviceId: await getOrCreateDeviceId(),
      driverId: config.driverId,
      vehicleId: config.vehicleId,
      queue: null, // Will be initialized on first task execution
      clickhouseUrl: config.clickhouseUrl,
      clickhouseUser: config.clickhouseUser,
      clickhousePassword: config.clickhousePassword,
      authHeader,
      consecutiveFailures: 0,
      circuitOpenedAt: 0,
    };

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10, // Update every 10 meters
      timeInterval: 5000, // Or every 5 seconds
      deferredUpdatesInterval: 10000, // Batch updates every 10 seconds when deferred
      deferredUpdatesDistance: 50, // Or every 50 meters
      showsBackgroundLocationIndicator: true, // iOS: show blue bar
      foregroundService: {
        notificationTitle: 'Route tracking active',
        notificationBody:
          'Rouptimize is recording your route. You can use other apps freely.',
        notificationColor: '#3B82F6',
      },
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
    });

    console.log('[BackgroundLocation] Started background location tracking');
    return true;
  } catch (error) {
    console.error('[BackgroundLocation] Failed to start:', error);
    return false;
  }
}

/**
 * Stop background location tracking
 */
export async function stopBackgroundLocationTracking(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    backgroundState.isActive = false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );

    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[BackgroundLocation] Stopped background location tracking');
    }

    // Close the background queue gracefully if it was initialized
    if (backgroundState.queue) {
      await backgroundState.queue.close();
      backgroundState.queue = null;
    }

    // Reset circuit breaker state
    backgroundState.consecutiveFailures = 0;
    backgroundState.circuitOpenedAt = 0;
  } catch (error) {
    console.error('[BackgroundLocation] Failed to stop:', error);
  }
}

/**
 * Check if background location tracking is active
 */
export async function isBackgroundLocationActive(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Get the background queue instance (for the foreground drain to also
 * pick up any batches that failed to send from the background).
 */
export function getBackgroundQueue(): SensorQueue | null {
  return backgroundState.queue;
}

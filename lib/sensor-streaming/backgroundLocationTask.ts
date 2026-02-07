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
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getOrCreateDeviceId } from './deviceId';
import { SensorQueue } from './sensorQueue';
import { SensorBatch, SensorReading } from './types';

// Task name for background location tracking
export const BACKGROUND_LOCATION_TASK = 'rouptimize-background-location';

// In-memory state for background task (persists across task executions)
let backgroundState: {
  isActive: boolean;
  deviceId: string | null;
  driverId: string | undefined;
  vehicleId: string | undefined;
  queue: SensorQueue | null;
  clickhouseUrl: string;
  clickhouseUser: string;
  clickhousePassword: string;
} = {
  isActive: false,
  deviceId: null,
  driverId: undefined,
  vehicleId: undefined,
  queue: null,
  clickhouseUrl: '',
  clickhouseUser: '',
  clickhousePassword: '',
};

/**
 * Send a batch directly to ClickHouse via HTTP.
 * Used in background to avoid data piling up in SQLite only.
 */
async function sendBatchToClickHouse(
  batchId: string,
  payload: string,
): Promise<boolean> {
  const { clickhouseUrl, clickhouseUser, clickhousePassword } = backgroundState;
  if (!clickhouseUrl) return false;

  const query = `INSERT INTO rouptimize.sensor_queue VALUES ${payload}`;
  const url = `${clickhouseUrl}?query=${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + btoa(`${clickhouseUser}:${clickhousePassword}`),
        'Content-Type': 'application/octet-stream',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      // Mark as acked in local queue
      if (backgroundState.queue) {
        await backgroundState.queue.markAcked(batchId);
      }
      return true;
    }

    console.error(
      '[BackgroundLocation] ClickHouse insert failed:',
      response.status,
    );
    return false;
  } catch (error) {
    console.error('[BackgroundLocation] ClickHouse send error:', error);
    return false;
  }
}

// Define the background task
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

    // Convert locations to sensor readings
    const readings: SensorReading[] = locations.map((loc) => ({
      t: loc.timestamp,
      sensor: 'location' as const,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      alt: loc.coords.altitude ?? undefined,
      speed: loc.coords.speed ?? undefined,
      heading: loc.coords.heading ?? undefined,
      accuracy: loc.coords.accuracy ?? undefined,
    }));

    const deviceId = backgroundState.deviceId;
    const batchId = `${deviceId}_bg_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;

    // Create batch
    const batch: SensorBatch = {
      batchId,
      deviceId,
      driverId: backgroundState.driverId,
      vehicleId: backgroundState.vehicleId,
      readings,
    };

    // Build ClickHouse payload
    const readingsJson = JSON.stringify(batch.readings);
    const payload = `('${batch.batchId}', '${batch.deviceId}', ${batch.driverId ? `'${batch.driverId}'` : 'NULL'}, ${batch.vehicleId ? `'${batch.vehicleId}'` : 'NULL'}, '${readingsJson.replace(/'/g, "\\'")}')`;

    // Store in local queue first (safety net)
    await backgroundState.queue.insertPendingBatch({
      batchId: batch.batchId,
      data: payload,
      qos: 1,
    });

    // Try to send immediately to ClickHouse
    const sent = await sendBatchToClickHouse(batch.batchId, payload);

    console.log(
      `[BackgroundLocation] ${sent ? 'Sent' : 'Queued'} ${readings.length} background location readings`,
    );
  } catch (err) {
    console.error('[BackgroundLocation] Error processing locations:', err);
  }
});

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
 * Get any pending background locations from the queue
 */
export function getBackgroundQueue(): SensorQueue | null {
  return backgroundState.queue;
}

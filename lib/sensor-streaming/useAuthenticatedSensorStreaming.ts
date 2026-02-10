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

function parseNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

interface UseAuthenticatedSensorStreamingOptions {
  /** Whether the user is actively navigating. Sensor streaming only runs when true. */
  isNavigating: boolean;
}

/**
 * Hook to manage authenticated sensor streaming during navigation.
 *
 * Sensor streaming is only activated when:
 * 1. User is authenticated
 * 2. User has granted sensor permission
 * 3. isNavigating is true (driver is actively navigating a route)
 * 4. EXPO_PUBLIC_SENSOR_STREAMING_ENABLED is 'true'
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

    const batchIntervalMs = parseNumber(
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

    const buffer: SensorReading[] = [];
    let flushTimer: ReturnType<typeof setInterval> | undefined;
    let cleanupTimer: ReturnType<typeof setInterval> | undefined;

    const queue = new SensorQueue();
    let sensorClient: ClickHouseSensorClient | undefined;
    let reader: SensorReader | undefined;

    const start = async () => {
      const deviceId = await getOrCreateDeviceId();
      let vehicleId: string | undefined;
      try {
        const assignment = await vehicleAssignmentService.getMyAssignment();
        vehicleId = assignment.vehicleId;
        console.log('[SensorStreaming] Found vehicle assignment:', vehicleId);
      } catch (e) {
        console.warn('[SensorStreaming] Failed to get vehicle assignment', e);
      }

      console.log(
        '[SensorStreaming] Starting with deviceId (authenticated):',
        deviceId,
      );
      await queue.init();

      sensorClient = new ClickHouseSensorClient({
        url: clickhouseUrl,
        user: clickhouseUser,
        password: clickhousePassword,
        deviceId,
        queue,
        onSendSuccess: reportSuccess,
        onSendFailure: reportFailure,
      });
      sensorClient.start();
      sensorClientRef.current = sensorClient;

      // Start background location tracking for when app is minimized
      await startBackgroundLocationTracking({
        driverId: user?.driverId,
        vehicleId,
        clickhouseUrl,
        clickhouseUser,
        clickhousePassword,
      });

      reader = new SensorReader({
        sampleRateHz,
        onReading: (r) => {
          buffer.push(r);
          // Report individual reading to throughput tracker
          reportReadings(1, r.sensor as 'accel' | 'gyro' | 'location');
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

      flushTimer = setInterval(
        () => {
          const readings = buffer.splice(0, buffer.length);
          if (readings.length === 0) {
            return;
          }

          const locationCount = readings.filter(
            (r) => r.sensor === 'location',
          ).length;
          const accelCount = readings.filter(
            (r) => r.sensor === 'accel',
          ).length;
          const gyroCount = readings.filter((r) => r.sensor === 'gyro').length;
          console.log(
            `[SensorStreaming] Sending batch: ${readings.length} readings (location: ${locationCount}, accel: ${accelCount}, gyro: ${gyroCount})`,
          );

          const batch: SensorBatch = {
            batchId: `${deviceId}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
            deviceId,
            driverId: user?.driverId,
            vehicleId,
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
        },
        Math.max(50, batchIntervalMs),
      );

      cleanupTimer = setInterval(
        () => {
          void queue.deleteAckedOlderThan(cleanupDays);
        },
        60 * 60 * 1000,
      );
    };

    void start();

    cleanupRef.current = () => {
      flushTimer && clearInterval(flushTimer);
      cleanupTimer && clearInterval(cleanupTimer);
      reader?.stop();
      sensorClient?.stop();
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
    setOff,
  ]);
}

import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { SensorReading } from './types';

type SensorReaderConfig = {
  sampleRateHz: number;
  locationIntervalMs?: number;
  onReading: (reading: SensorReading) => void;
  onLocationError?: (error: string) => void;
};

export class SensorReader {
  private accelSub?: { remove: () => void };
  private gyroSub?: { remove: () => void };
  private locationSub?: Location.LocationSubscription;
  private readonly sampleRateHz: number;
  private readonly locationIntervalMs: number;
  private readonly onReading: (reading: SensorReading) => void;
  private readonly onLocationError?: (error: string) => void;

  constructor(config: SensorReaderConfig) {
    this.sampleRateHz = config.sampleRateHz;
    this.locationIntervalMs = config.locationIntervalMs ?? 1000;
    this.onReading = config.onReading;
    this.onLocationError = config.onLocationError;
  }

  async start(): Promise<void> {
    const intervalMs = Math.max(10, Math.round(1000 / this.sampleRateHz));

    Accelerometer.setUpdateInterval(intervalMs);
    Gyroscope.setUpdateInterval(intervalMs);

    this.accelSub = Accelerometer.addListener((data) => {
      this.onReading({
        t: Date.now(),
        sensor: 'accel',
        x: data.x ?? 0,
        y: data.y ?? 0,
        z: data.z ?? 0,
      });
    });

    this.gyroSub = Gyroscope.addListener((data) => {
      this.onReading({
        t: Date.now(),
        sensor: 'gyro',
        x: data.x ?? 0,
        y: data.y ?? 0,
        z: data.z ?? 0,
      });
    });

    await this.startLocationTracking();
  }

  private async startLocationTracking(): Promise<void> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        const errorMsg = `Location permission denied: ${status}`;
        console.warn('[SensorReader]', errorMsg);
        this.onLocationError?.(errorMsg);
        return;
      }

      console.log(
        '[SensorReader] Location permission granted, starting tracking...',
      );

      this.locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: this.locationIntervalMs,
          distanceInterval: 0, // Changed from 1 to 0 to ensure we get updates even when stationary
        },
        (location) => {
          const reading: SensorReading = {
            t: Date.now(),
            sensor: 'location',
            lng: location.coords.longitude,
            lat: location.coords.latitude,
            accuracy: location.coords.accuracy ?? undefined,
            altitude: location.coords.altitude ?? undefined,
            speed: location.coords.speed ?? undefined,
            heading: location.coords.heading ?? undefined,
          };
          console.log('[SensorReader] Location reading:', {
            lng: reading.lng,
            lat: reading.lat,
            accuracy: reading.accuracy,
          });
          this.onReading(reading);
        },
      );

      console.log('[SensorReader] Location tracking started successfully');
    } catch (error) {
      const errorMsg = `Failed to start location tracking: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[SensorReader]', errorMsg);
      this.onLocationError?.(errorMsg);
    }
  }

  /**
   * Re-check and restart location tracking if the subscription was lost
   * (e.g. after app resume or a transient permission error).
   */
  async ensureLocationTracking(): Promise<void> {
    if (this.locationSub) {
      // Already tracking
      return;
    }
    console.log('[SensorReader] Re-starting location tracking (recovery)');
    await this.startLocationTracking();
  }

  /**
   * Ensure ALL sensor subscriptions (accel, gyro, location) are active.
   *
   * When the app is backgrounded (e.g., user switches to Google Maps), the OS
   * kills foreground sensor listeners. Call this when the app returns to
   * foreground to re-subscribe any lost sensors.
   */
  async ensureAllSensors(): Promise<void> {
    const intervalMs = Math.max(10, Math.round(1000 / this.sampleRateHz));

    if (!this.accelSub) {
      console.log('[SensorReader] Re-subscribing accelerometer');
      Accelerometer.setUpdateInterval(intervalMs);
      this.accelSub = Accelerometer.addListener((data) => {
        this.onReading({
          t: Date.now(),
          sensor: 'accel',
          x: data.x ?? 0,
          y: data.y ?? 0,
          z: data.z ?? 0,
        });
      });
    }

    if (!this.gyroSub) {
      console.log('[SensorReader] Re-subscribing gyroscope');
      Gyroscope.setUpdateInterval(intervalMs);
      this.gyroSub = Gyroscope.addListener((data) => {
        this.onReading({
          t: Date.now(),
          sensor: 'gyro',
          x: data.x ?? 0,
          y: data.y ?? 0,
          z: data.z ?? 0,
        });
      });
    }

    await this.ensureLocationTracking();
  }

  stop(): void {
    this.accelSub?.remove();
    this.gyroSub?.remove();
    this.locationSub?.remove();
    this.accelSub = undefined;
    this.gyroSub = undefined;
    this.locationSub = undefined;
  }
}

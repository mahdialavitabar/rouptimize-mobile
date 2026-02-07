export type SensorReading =
  | {
      t: number;
      sensor: 'accel' | 'gyro';
      x: number;
      y: number;
      z: number;
    }
  | {
      t: number;
      sensor: 'location';
      lng: number;
      lat: number;
      accuracy?: number;
      altitude?: number;
      speed?: number;
      heading?: number;
    };

export type SensorBatch = {
  batchId: string;
  deviceId: string;
  driverId?: string;
  vehicleId?: string;
  readings: SensorReading[];
};

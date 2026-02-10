import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';

export type StreamingStatus = 'off' | 'live' | 'error';

export interface SensorThroughput {
  /** Sensor readings collected per second (from accelerometer, gyroscope, location) */
  readingsPerSecond: number;
  /** Batches successfully sent to server per second */
  batchesSentPerSecond: number;
  /** Batches that failed to send per second */
  batchesFailedPerSecond: number;
  /** Total sensor readings collected since streaming started */
  totalReadingsCollected: number;
  /** Total batches successfully sent since streaming started */
  totalBatchesSent: number;
  /** Total batches that failed since streaming started */
  totalBatchesFailed: number;
  /** Total bytes estimated sent (rough estimate based on reading count) */
  estimatedBytesSent: number;
  /** Readings breakdown by sensor type per second */
  readingsByType: {
    accel: number;
    gyro: number;
    location: number;
  };
}

const EMPTY_THROUGHPUT: SensorThroughput = {
  readingsPerSecond: 0,
  batchesSentPerSecond: 0,
  batchesFailedPerSecond: 0,
  totalReadingsCollected: 0,
  totalBatchesSent: 0,
  totalBatchesFailed: 0,
  estimatedBytesSent: 0,
  readingsByType: { accel: 0, gyro: 0, location: 0 },
};

/** Approximate bytes per reading for estimation purposes */
const ESTIMATED_BYTES_PER_READING = 120;

interface SensorStreamingStatusContextValue {
  /** Current streaming status */
  status: StreamingStatus;
  /** Number of consecutive failures (resets to 0 on success) */
  consecutiveFailures: number;
  /** Live throughput metrics */
  throughput: SensorThroughput;
  /** Report a successful batch send */
  reportSuccess: () => void;
  /** Report a failed batch send */
  reportFailure: () => void;
  /** Report sensor readings collected (call with count and sensor type) */
  reportReadings: (count: number, sensorType?: 'accel' | 'gyro' | 'location') => void;
  /** Report a batch of readings sent successfully (with reading count in the batch) */
  reportBatchSent: (readingCount: number) => void;
  /** Report a batch send failure */
  reportBatchFailed: () => void;
  /** Set streaming to off */
  setOff: () => void;
}

const SensorStreamingStatusContext =
  createContext<SensorStreamingStatusContextValue | null>(null);

/**
 * Threshold of consecutive failures before showing error status.
 * A single transient failure won't immediately show error.
 */
const FAILURE_THRESHOLD = 3;

/** How often we recalculate per-second rates (in ms) */
const RATE_CALCULATION_INTERVAL_MS = 1000;

export function SensorStreamingStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<StreamingStatus>('off');
  const [throughput, setThroughput] = useState<SensorThroughput>(EMPTY_THROUGHPUT);
  const failCountRef = useRef(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  // Accumulator refs for rate calculation (reset each interval)
  const readingsWindowRef = useRef(0);
  const batchesSentWindowRef = useRef(0);
  const batchesFailedWindowRef = useRef(0);
  const readingsByTypeWindowRef = useRef({ accel: 0, gyro: 0, location: 0 });

  // Total accumulators (never reset, only on setOff)
  const totalReadingsRef = useRef(0);
  const totalBatchesSentRef = useRef(0);
  const totalBatchesFailedRef = useRef(0);
  const totalBytesSentRef = useRef(0);

  // Periodic rate calculation
  useEffect(() => {
    if (status === 'off') return;

    const interval = setInterval(() => {
      const readingsPerSecond = readingsWindowRef.current;
      const batchesSentPerSecond = batchesSentWindowRef.current;
      const batchesFailedPerSecond = batchesFailedWindowRef.current;
      const readingsByType = { ...readingsByTypeWindowRef.current };

      // Reset window accumulators
      readingsWindowRef.current = 0;
      batchesSentWindowRef.current = 0;
      batchesFailedWindowRef.current = 0;
      readingsByTypeWindowRef.current = { accel: 0, gyro: 0, location: 0 };

      setThroughput({
        readingsPerSecond,
        batchesSentPerSecond,
        batchesFailedPerSecond,
        totalReadingsCollected: totalReadingsRef.current,
        totalBatchesSent: totalBatchesSentRef.current,
        totalBatchesFailed: totalBatchesFailedRef.current,
        estimatedBytesSent: totalBytesSentRef.current,
        readingsByType,
      });
    }, RATE_CALCULATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status]);

  const reportSuccess = useCallback(() => {
    failCountRef.current = 0;
    setConsecutiveFailures(0);
    setStatus('live');
  }, []);

  const reportFailure = useCallback(() => {
    failCountRef.current += 1;
    setConsecutiveFailures(failCountRef.current);
    if (failCountRef.current >= FAILURE_THRESHOLD) {
      setStatus('error');
    }
  }, []);

  const reportReadings = useCallback(
    (count: number, sensorType?: 'accel' | 'gyro' | 'location') => {
      readingsWindowRef.current += count;
      totalReadingsRef.current += count;
      if (sensorType) {
        readingsByTypeWindowRef.current[sensorType] += count;
      }
    },
    [],
  );

  const reportBatchSent = useCallback((readingCount: number) => {
    batchesSentWindowRef.current += 1;
    totalBatchesSentRef.current += 1;
    totalBytesSentRef.current += readingCount * ESTIMATED_BYTES_PER_READING;
  }, []);

  const reportBatchFailed = useCallback(() => {
    batchesFailedWindowRef.current += 1;
    totalBatchesFailedRef.current += 1;
  }, []);

  const setOff = useCallback(() => {
    failCountRef.current = 0;
    setConsecutiveFailures(0);
    setStatus('off');

    // Reset all counters
    readingsWindowRef.current = 0;
    batchesSentWindowRef.current = 0;
    batchesFailedWindowRef.current = 0;
    readingsByTypeWindowRef.current = { accel: 0, gyro: 0, location: 0 };
    totalReadingsRef.current = 0;
    totalBatchesSentRef.current = 0;
    totalBatchesFailedRef.current = 0;
    totalBytesSentRef.current = 0;

    setThroughput(EMPTY_THROUGHPUT);
  }, []);

  const value = useMemo(
    () => ({
      status,
      consecutiveFailures,
      throughput,
      reportSuccess,
      reportFailure,
      reportReadings,
      reportBatchSent,
      reportBatchFailed,
      setOff,
    }),
    [
      status,
      consecutiveFailures,
      throughput,
      reportSuccess,
      reportFailure,
      reportReadings,
      reportBatchSent,
      reportBatchFailed,
      setOff,
    ],
  );

  return (
    <SensorStreamingStatusContext.Provider value={value}>
      {children}
    </SensorStreamingStatusContext.Provider>
  );
}

export function useSensorStreamingStatus(): SensorStreamingStatusContextValue {
  const ctx = useContext(SensorStreamingStatusContext);
  if (!ctx) {
    throw new Error(
      'useSensorStreamingStatus must be used within SensorStreamingStatusProvider',
    );
  }
  return ctx;
}

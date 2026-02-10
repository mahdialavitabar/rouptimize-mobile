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

export type StreamingStatus = 'off' | 'live' | 'error' | 'draining';

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
  /** Number of batches currently waiting in the local SQLite queue */
  queueDepth: number;
  /** Whether there are pending batches in the local queue waiting to be sent */
  hasPendingQueue: boolean;
  /** Average round-trip latency to ClickHouse (ms), rolling window */
  avgLatencyMs: number;
  /** Most recent round-trip latency to ClickHouse (ms) */
  lastLatencyMs: number;
  /** Min latency observed in the current window (ms) */
  minLatencyMs: number;
  /** Max latency observed in the current window (ms) */
  maxLatencyMs: number;
  /** P95 latency approximation (ms) */
  p95LatencyMs: number;
  /** Data throughput in bytes per second (estimated) */
  bytesPerSecond: number;
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
  queueDepth: 0,
  hasPendingQueue: false,
  avgLatencyMs: 0,
  lastLatencyMs: 0,
  minLatencyMs: 0,
  maxLatencyMs: 0,
  p95LatencyMs: 0,
  bytesPerSecond: 0,
};

/** Approximate bytes per reading for estimation purposes */
const ESTIMATED_BYTES_PER_READING = 120;

/** Max latency samples to keep for percentile calculation */
const MAX_LATENCY_SAMPLES = 100;

/** Queue depth threshold that triggers 'draining' status */
const DRAINING_QUEUE_THRESHOLD = 10;

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
  /** Report a latency measurement (round-trip HTTP call to ClickHouse, in ms) */
  reportLatency: (latencyMs: number) => void;
  /** Report the current local queue depth (number of pending batches) */
  reportQueueDepth: (depth: number) => void;
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

/**
 * Calculate the p95 value from a sorted array of numbers.
 */
function calculateP95(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil(sortedValues.length * 0.95) - 1;
  return sortedValues[Math.max(0, index)] ?? 0;
}

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
  const bytesWindowRef = useRef(0);

  // Total accumulators (never reset, only on setOff)
  const totalReadingsRef = useRef(0);
  const totalBatchesSentRef = useRef(0);
  const totalBatchesFailedRef = useRef(0);
  const totalBytesSentRef = useRef(0);

  // Queue depth tracking
  const queueDepthRef = useRef(0);

  // Latency tracking – rolling window of samples
  const latencySamplesRef = useRef<number[]>([]);
  const lastLatencyRef = useRef(0);

  // Periodic rate calculation
  useEffect(() => {
    if (status === 'off') return;

    const interval = setInterval(() => {
      const readingsPerSecond = readingsWindowRef.current;
      const batchesSentPerSecond = batchesSentWindowRef.current;
      const batchesFailedPerSecond = batchesFailedWindowRef.current;
      const readingsByType = { ...readingsByTypeWindowRef.current };
      const bytesPerSecond = bytesWindowRef.current;

      // Reset window accumulators
      readingsWindowRef.current = 0;
      batchesSentWindowRef.current = 0;
      batchesFailedWindowRef.current = 0;
      readingsByTypeWindowRef.current = { accel: 0, gyro: 0, location: 0 };
      bytesWindowRef.current = 0;

      // Compute latency stats from the rolling window
      const samples = latencySamplesRef.current;
      let avgLatencyMs = 0;
      let minLatencyMs = 0;
      let maxLatencyMs = 0;
      let p95LatencyMs = 0;

      if (samples.length > 0) {
        const sorted = [...samples].sort((a, b) => a - b);
        const sum = sorted.reduce((acc, v) => acc + v, 0);
        avgLatencyMs = Math.round(sum / sorted.length);
        minLatencyMs = sorted[0] ?? 0;
        maxLatencyMs = sorted[sorted.length - 1] ?? 0;
        p95LatencyMs = calculateP95(sorted);
      }

      const queueDepth = queueDepthRef.current;
      const hasPendingQueue = queueDepth > 0;

      setThroughput({
        readingsPerSecond,
        batchesSentPerSecond,
        batchesFailedPerSecond,
        totalReadingsCollected: totalReadingsRef.current,
        totalBatchesSent: totalBatchesSentRef.current,
        totalBatchesFailed: totalBatchesFailedRef.current,
        estimatedBytesSent: totalBytesSentRef.current,
        readingsByType,
        queueDepth,
        hasPendingQueue,
        avgLatencyMs,
        lastLatencyMs: lastLatencyRef.current,
        minLatencyMs,
        maxLatencyMs,
        p95LatencyMs,
        bytesPerSecond,
      });
    }, RATE_CALCULATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status]);

  const reportSuccess = useCallback(() => {
    failCountRef.current = 0;
    setConsecutiveFailures(0);
    // If there are pending items in the queue, show 'draining' instead of 'live'
    if (queueDepthRef.current >= DRAINING_QUEUE_THRESHOLD) {
      setStatus('draining');
    } else {
      setStatus('live');
    }
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
    const bytes = readingCount * ESTIMATED_BYTES_PER_READING;
    totalBytesSentRef.current += bytes;
    bytesWindowRef.current += bytes;
  }, []);

  const reportBatchFailed = useCallback(() => {
    batchesFailedWindowRef.current += 1;
    totalBatchesFailedRef.current += 1;
  }, []);

  const reportLatency = useCallback((latencyMs: number) => {
    lastLatencyRef.current = latencyMs;

    const samples = latencySamplesRef.current;
    samples.push(latencyMs);

    // Keep a rolling window of the most recent samples
    if (samples.length > MAX_LATENCY_SAMPLES) {
      // Remove oldest 20% to amortize the shift cost
      const removeCount = Math.floor(MAX_LATENCY_SAMPLES * 0.2);
      latencySamplesRef.current = samples.slice(removeCount);
    }
  }, []);

  const reportQueueDepth = useCallback((depth: number) => {
    queueDepthRef.current = depth;

    // Auto-transition between 'live' and 'draining' based on queue depth
    // (only if we're currently in a non-error state)
    setStatus((prev) => {
      if (prev === 'off' || prev === 'error') return prev;
      if (depth >= DRAINING_QUEUE_THRESHOLD) return 'draining';
      return 'live';
    });
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
    bytesWindowRef.current = 0;
    totalReadingsRef.current = 0;
    totalBatchesSentRef.current = 0;
    totalBatchesFailedRef.current = 0;
    totalBytesSentRef.current = 0;

    // Reset queue & latency tracking
    queueDepthRef.current = 0;
    latencySamplesRef.current = [];
    lastLatencyRef.current = 0;

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
      reportLatency,
      reportQueueDepth,
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
      reportLatency,
      reportQueueDepth,
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

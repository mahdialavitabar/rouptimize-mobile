import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type StreamingStatus = 'off' | 'live' | 'error';

interface SensorStreamingStatusContextValue {
  /** Current streaming status */
  status: StreamingStatus;
  /** Number of consecutive failures (resets to 0 on success) */
  consecutiveFailures: number;
  /** Report a successful batch send */
  reportSuccess: () => void;
  /** Report a failed batch send */
  reportFailure: () => void;
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

export function SensorStreamingStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<StreamingStatus>('off');
  const failCountRef = useRef(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

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

  const setOff = useCallback(() => {
    failCountRef.current = 0;
    setConsecutiveFailures(0);
    setStatus('off');
  }, []);

  const value = useMemo(
    () => ({
      status,
      consecutiveFailures,
      reportSuccess,
      reportFailure,
      setOff,
    }),
    [status, consecutiveFailures, reportSuccess, reportFailure, setOff],
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

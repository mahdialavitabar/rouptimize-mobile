import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Linking, Platform } from 'react-native';

const SENSOR_PERMISSION_KEY = 'sensor_streaming_permission';

export type SensorPermissionStatus =
  | 'undetermined'
  | 'granted'
  | 'denied'
  | 'loading';

interface SensorPermissionContextValue {
  /** Current permission status for sensor streaming */
  permissionStatus: SensorPermissionStatus;
  /** Whether the user has been asked for permission (even if denied) */
  hasBeenAsked: boolean;
  /** Request permission from the user - shows a dialog explaining what data is collected */
  requestPermission: () => Promise<boolean>;
  /** Revoke permission (user can opt out later) */
  revokePermission: () => Promise<void>;
  /** Whether sensor streaming is currently allowed (granted and not revoked) */
  isAllowed: boolean;
}

const SensorPermissionContext =
  createContext<SensorPermissionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Show an alert that returns a Promise resolving to the pressed button index */
function alertAsync(
  title: string,
  message: string,
  buttons: { text: string; style?: 'cancel' | 'default' | 'destructive' }[],
): Promise<number> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((b, i) => ({
        ...b,
        onPress: () => resolve(i),
      })),
      { cancelable: false },
    );
  });
}

export function SensorPermissionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [permissionStatus, setPermissionStatus] =
    useState<SensorPermissionStatus>('loading');
  const [hasBeenAsked, setHasBeenAsked] = useState(false);

  // Load saved permission status on mount
  useEffect(() => {
    const loadPermissionStatus = async () => {
      try {
        const saved = await AsyncStorage.getItem(SENSOR_PERMISSION_KEY);
        if (saved === 'granted') {
          // Verify location permission is still valid at OS level
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            setPermissionStatus('granted');
          } else {
            // OS permission revoked – reset so we re-ask next time
            setPermissionStatus('undetermined');
          }
          setHasBeenAsked(true);
        } else if (saved === 'denied') {
          setPermissionStatus('denied');
          setHasBeenAsked(true);
        } else {
          setPermissionStatus('undetermined');
        }
      } catch {
        setPermissionStatus('undetermined');
      }
    };

    loadPermissionStatus();
  }, []);

  // -------------------------------------------------------------------------
  // Step-by-step permission request flow
  // -------------------------------------------------------------------------
  const requestPermission = useCallback(async (): Promise<boolean> => {
    // ── Step 1: Explain why we need the permission ────────────────────────
    const step1 = await alertAsync(
      'Route Tracking',
      'To optimize your delivery routes and ensure safety, Rouptimize needs to record your location, motion, and orientation while you navigate.\n\nData is only collected during active deliveries.',
      [{ text: 'Not Now', style: 'cancel' }, { text: 'Continue' }],
    );

    if (step1 === 0) {
      // User tapped "Not Now"
      await AsyncStorage.setItem(SENSOR_PERMISSION_KEY, 'denied');
      setPermissionStatus('denied');
      setHasBeenAsked(true);
      return false;
    }

    // ── Step 2: Request foreground location permission ────────────────────
    const { status: fgStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (fgStatus !== 'granted') {
      // OS denied – guide user to settings
      await alertAsync(
        'Location Permission Required',
        'Rouptimize cannot track your route without location access. Please enable location in your device settings.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings' }],
      ).then((idx) => {
        if (idx === 1) Linking.openSettings();
      });

      await AsyncStorage.setItem(SENSOR_PERMISSION_KEY, 'denied');
      setPermissionStatus('denied');
      setHasBeenAsked(true);
      return false;
    }

    // ── Step 3: Request background location (separate step on Android 11+)
    if (Platform.OS !== 'web') {
      const { status: bgStatus } =
        await Location.getBackgroundPermissionsAsync();

      if (bgStatus !== 'granted') {
        // Explain WHY background is needed before asking
        const bgChoice = await alertAsync(
          'Keep Tracking in Background',
          'When you switch to Google Maps, Waze, or another navigation app, Rouptimize needs background location access to continue recording your route.\n\nOn the next screen, please select "Allow all the time".',
          [{ text: 'Skip', style: 'cancel' }, { text: 'Allow' }],
        );

        if (bgChoice === 1) {
          try {
            const bgResult = await Location.requestBackgroundPermissionsAsync();

            if (bgResult.status !== 'granted') {
              // Didn't grant "Always" – inform but don't block
              Alert.alert(
                'Limited Background Tracking',
                'Without "Allow all the time" access, route tracking may pause when you switch to a map app.\n\nYou can change this later in Settings → Rouptimize → Location.',
              );
            }
          } catch (bgError) {
            console.log(
              '[SensorPermission] Background location not available:',
              bgError,
            );
          }
        }
      }
    }

    // ── Done – mark as granted ───────────────────────────────────────────
    await AsyncStorage.setItem(SENSOR_PERMISSION_KEY, 'granted');
    setPermissionStatus('granted');
    setHasBeenAsked(true);
    return true;
  }, []);

  const revokePermission = useCallback(async () => {
    await AsyncStorage.setItem(SENSOR_PERMISSION_KEY, 'denied');
    setPermissionStatus('denied');
  }, []);

  const isAllowed = permissionStatus === 'granted';

  const value = useMemo<SensorPermissionContextValue>(
    () => ({
      permissionStatus,
      hasBeenAsked,
      requestPermission,
      revokePermission,
      isAllowed,
    }),
    [
      permissionStatus,
      hasBeenAsked,
      requestPermission,
      revokePermission,
      isAllowed,
    ],
  );

  return (
    <SensorPermissionContext.Provider value={value}>
      {children}
    </SensorPermissionContext.Provider>
  );
}

export function useSensorPermission(): SensorPermissionContextValue {
  const context = useContext(SensorPermissionContext);
  if (!context) {
    throw new Error(
      'useSensorPermission must be used within a SensorPermissionProvider',
    );
  }
  return context;
}

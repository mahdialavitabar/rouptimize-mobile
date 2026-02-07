import { Alert, Linking, Platform } from 'react-native';

export interface NavigationCoordinates {
  latitude: number;
  longitude: number;
  address?: string;
}

/**
 * Opens the device's native navigation app using the universal geo: URI scheme.
 * This works with any navigation app installed on the device (Google Maps, Waze, etc.)
 *
 * @param destination - The destination coordinates and optional address
 */
export async function openNativeNavigation(
  destination: NavigationCoordinates,
): Promise<void> {
  const { latitude, longitude, address } = destination;

  // Use geo: URI scheme - this is the universal standard that works with any navigation app
  // The device will show a picker if multiple navigation apps are installed
  const label = address ? encodeURIComponent(address) : '';

  let url: string;

  if (Platform.OS === 'ios') {
    // iOS: Use Apple Maps URL scheme which can also trigger app picker
    // If user has other map apps, iOS will show options
    url = `maps://?daddr=${latitude},${longitude}&dirflg=d`;
  } else {
    // Android: Use geo: intent which shows app picker for all installed map/nav apps
    // Adding ?q= with coordinates and label for better compatibility
    url = label
      ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Final fallback: open Google Maps in browser (works everywhere)
      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
      await Linking.openURL(webUrl);
    }
  } catch {
    // Final fallback: open Google Maps in browser
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    await Linking.openURL(webUrl);
  }
}

/**
 * Opens native navigation for a route with multiple waypoints.
 * Opens the first uncompleted stop in the native navigation app.
 *
 * @param stops - Array of stops in order with their coordinates
 */
export async function openNativeNavigationForRoute(
  stops: Array<{
    latitude: number;
    longitude: number;
    address?: string;
    isCompleted?: boolean;
  }>,
): Promise<void> {
  // Find the first uncompleted stop
  const nextStop = stops.find((stop) => !stop.isCompleted);

  if (!nextStop) {
    Alert.alert('Route Complete', 'All stops have been completed.');
    return;
  }

  await openNativeNavigation({
    latitude: nextStop.latitude,
    longitude: nextStop.longitude,
    address: nextStop.address,
  });
}

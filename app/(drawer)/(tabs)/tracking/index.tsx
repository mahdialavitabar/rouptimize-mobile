import Mapbox, {
  Camera,
  LineLayer,
  LocationPuck,
  MapView,
  ShapeSource,
} from '@rnmapbox/maps';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View, useColorScheme } from 'react-native';

import {
  EnhancedMissionMarker,
  MapControls,
  MissionInfoPanel,
  RouteEndpointMarker,
  SelectedMissionCard,
} from '@/components/map/index';
import { StreamingStatusIndicator } from '@/components/map/StreamingStatusIndicator';
import { useMissions, useRoutes } from '@/lib/api/hooks';
import type { Mission } from '@/lib/api/types';
import { openNativeNavigation } from '@/lib/navigation/openNativeNavigation';
import { useAuthenticatedSensorStreaming } from '@/lib/sensor-streaming/useAuthenticatedSensorStreaming';

const accessToken = Constants.expoConfig?.extra?.mapboxAccessToken ?? '';
Mapbox.setAccessToken(accessToken);

// Default center (Tehran)
const DEFAULT_CENTER: [number, number] = [51.389, 35.6892];
const DEFAULT_ZOOM = 13;

export default function TrackingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const cameraRef = useRef<Camera>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [showMissions, setShowMissions] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);

  // Get today's date
  const today = new Date().toISOString().split('T')[0];

  // Fetch today's missions and routes
  const { missions } = useMissions({ date: today });
  const { routes } = useRoutes({ date: today });

  // Determine if driver is actively navigating (has an in-progress route)
  const isNavigating = useMemo(
    () => routes.some((r) => r.status === 'in_progress'),
    [routes],
  );

  // Start/stop sensor streaming based on navigation status
  useAuthenticatedSensorStreaming({ isNavigating });

  // Get active route and its geometry
  const activeRoute = useMemo(() => {
    return routes.find(
      (r) => r.status === 'in_progress' || r.status === 'planned',
    );
  }, [routes]);

  const activeRouteGeometry = useMemo(() => {
    if (!activeRoute?.geometry) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: activeRoute.geometry,
    };
  }, [activeRoute]);

  // Get start/end points from vehicle
  const routeEndpoints = useMemo(() => {
    if (!activeRoute?.vehicle) return null;
    const vehicle = activeRoute.vehicle as any;

    // Parse start/end points from vehicle (format: "lng,lat")
    const parsePoint = (point: string | undefined): [number, number] | null => {
      if (!point) return null;
      const parts = point.split(',').map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return [parts[0], parts[1]];
      }
      return null;
    };

    return {
      start: parsePoint(vehicle.startPoint),
      end: parsePoint(vehicle.endPoint),
    };
  }, [activeRoute]);

  // Filter missions with valid coordinates
  const mappableMissions = useMemo(() => {
    return missions.filter(
      (m) =>
        m.latitude && m.longitude && !isNaN(m.latitude) && !isNaN(m.longitude),
    );
  }, [missions]);

  // Calculate bounds for all points
  const allBounds = useMemo(() => {
    const points: [number, number][] = [];

    mappableMissions.forEach((m) => {
      points.push([m.longitude, m.latitude]);
    });

    if (routeEndpoints?.start) points.push(routeEndpoints.start);
    if (routeEndpoints?.end) points.push(routeEndpoints.end);
    if (userLocation) points.push(userLocation);

    if (points.length === 0) return null;

    let minLng = Infinity,
      maxLng = -Infinity;
    let minLat = Infinity,
      maxLat = -Infinity;

    points.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    const lngPadding = Math.max((maxLng - minLng) * 0.2, 0.01);
    const latPadding = Math.max((maxLat - minLat) * 0.2, 0.01);

    return {
      ne: [maxLng + lngPadding, maxLat + latPadding] as [number, number],
      sw: [minLng - lngPadding, minLat - latPadding] as [number, number],
    };
  }, [mappableMissions, routeEndpoints, userLocation]);

  // Get initial user location for camera positioning (permission handled by SensorPermissionContext)
  useEffect(() => {
    const getInitialLocation = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        setHasPermission(true);
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setUserLocation([location.coords.longitude, location.coords.latitude]);
      } catch {
        // Use default center if location fails
      }
    };

    getInitialLocation();
  }, []);

  // Camera controls
  const centerOnUser = useCallback(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords: [number, number] = [
        location.coords.longitude,
        location.coords.latitude,
      ];
      setUserLocation(coords);
      cameraRef.current?.setCamera({
        centerCoordinate: coords,
        zoomLevel: 16,
        animationDuration: 800,
      });
    } catch {
      // Fall back to last known location
      if (userLocation && cameraRef.current) {
        cameraRef.current.setCamera({
          centerCoordinate: userLocation,
          zoomLevel: 16,
          animationDuration: 800,
        });
      }
    }
  }, [userLocation]);

  const zoomIn = useCallback(() => {
    const newZoom = Math.min(zoomLevel + 1, 20);
    setZoomLevel(newZoom);
    cameraRef.current?.setCamera({
      zoomLevel: newZoom,
      animationDuration: 300,
    });
  }, [zoomLevel]);

  const zoomOut = useCallback(() => {
    const newZoom = Math.max(zoomLevel - 1, 5);
    setZoomLevel(newZoom);
    cameraRef.current?.setCamera({
      zoomLevel: newZoom,
      animationDuration: 300,
    });
  }, [zoomLevel]);

  const fitAllMarkers = useCallback(() => {
    if (allBounds && cameraRef.current) {
      cameraRef.current.fitBounds(
        allBounds.ne,
        allBounds.sw,
        [50, 50, 150, 50],
        1000,
      );
    }
  }, [allBounds]);

  // Mission interactions
  const selectMission = useCallback((mission: Mission) => {
    setSelectedMission(mission);
    cameraRef.current?.setCamera({
      centerCoordinate: [mission.longitude, mission.latitude],
      zoomLevel: 16,
      animationDuration: 500,
    });
  }, []);

  // Navigate using native navigation app
  const navigateToMission = useCallback((mission: Mission) => {
    openNativeNavigation({
      latitude: mission.latitude,
      longitude: mission.longitude,
      address: mission.address,
    });
  }, []);

  const callMission = useCallback(async (mission: Mission) => {
    if (!mission.phone) return;

    const phoneUrl = `tel:${mission.phone}`;
    const canOpen = await Linking.canOpenURL(phoneUrl);

    if (canOpen) {
      await Linking.openURL(phoneUrl);
    } else {
      await Clipboard.setStringAsync(mission.phone);
      Alert.alert('Copied', 'Phone number copied to clipboard');
    }
  }, []);

  const viewMissionDetails = useCallback(
    (mission: Mission) => {
      router.push(`/(drawer)/(tabs)/missions/${mission.id}` as any);
    },
    [router],
  );

  const viewAllMissions = useCallback(() => {
    router.push('/(drawer)/(tabs)/missions' as any);
  }, [router]);

  const centerCoordinate = userLocation ?? DEFAULT_CENTER;

  return (
    <View className="flex-1">
      {/* Map */}
      <MapView
        style={styles.map}
        styleURL={
          colorScheme === 'dark'
            ? 'mapbox://styles/mapbox/navigation-night-v1'
            : 'mapbox://styles/mapbox/streets-v12'
        }
        onPress={() => setSelectedMission(null)}
      >
        <Camera
          ref={cameraRef}
          zoomLevel={zoomLevel}
          centerCoordinate={centerCoordinate}
          animationMode="flyTo"
          animationDuration={1000}
        />

        {/* User location puck */}
        {hasPermission && (
          <LocationPuck
            puckBearing="heading"
            puckBearingEnabled
            visible
            pulsing={{
              isEnabled: true,
              color: '#3B82F6',
              radius: 50,
            }}
          />
        )}

        {/* Route line with gradient effect */}
        {showRoute && activeRouteGeometry && (
          <ShapeSource id="route-source" shape={activeRouteGeometry}>
            {/* Route shadow */}
            <LineLayer
              id="route-shadow"
              style={{
                lineColor: 'rgba(0,0,0,0.2)',
                lineWidth: 8,
                lineBlur: 3,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Main route line */}
            <LineLayer
              id="route-line"
              style={{
                lineColor: '#3B82F6',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Route border */}
            <LineLayer
              id="route-border"
              belowLayerID="route-line"
              style={{
                lineColor: '#1E40AF',
                lineWidth: 7,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* Start point marker */}
        {showRoute && routeEndpoints?.start && (
          <RouteEndpointMarker
            coordinate={routeEndpoints.start}
            type="start"
            label="Start"
          />
        )}

        {/* End point marker */}
        {showRoute && routeEndpoints?.end && (
          <RouteEndpointMarker
            coordinate={routeEndpoints.end}
            type="end"
            label="End"
          />
        )}

        {/* Mission markers */}
        {showMissions &&
          mappableMissions.map((mission, index) => (
            <EnhancedMissionMarker
              key={mission.id}
              mission={mission}
              order={index + 1}
              isSelected={selectedMission?.id === mission.id}
              isActive={mission.status === 'inProgress'}
              showLabel={false}
              onPress={() => selectMission(mission)}
            />
          ))}
      </MapView>

      {/* Streaming Status Indicator */}
      <StreamingStatusIndicator />

      {/* Map Controls */}
      <MapControls
        onCenterOnUser={centerOnUser}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onToggleMissions={() => setShowMissions(!showMissions)}
        onToggleRoute={() => setShowRoute(!showRoute)}
        onFitBounds={allBounds ? fitAllMarkers : undefined}
        showMissions={showMissions}
        showRoute={showRoute}
      />

      {/* Selected Mission Card */}
      {selectedMission && (
        <SelectedMissionCard
          mission={selectedMission}
          onNavigate={() => navigateToMission(selectedMission)}
          onCall={() => callMission(selectedMission)}
          onViewDetails={() => viewMissionDetails(selectedMission)}
          onClose={() => setSelectedMission(null)}
        />
      )}

      {/* Mission Info Panel */}
      {mappableMissions.length > 0 && !selectedMission && (
        <MissionInfoPanel
          missions={mappableMissions}
          onViewAll={viewAllMissions}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});

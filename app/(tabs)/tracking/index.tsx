import Mapbox, {
    Atmosphere,
    Camera,
    FillExtrusionLayer,
    Light,
    LineLayer,
    LocationPuck,
    MapView,
    ShapeSource,
    VectorSource
} from '@rnmapbox/maps';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Linking,
    StyleSheet,
    View,
    useColorScheme
} from 'react-native';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
    EnhancedMissionMarker,
    MapControls,
    MapStyleSelector,
    MissionInfoPanel,
    RouteEndpointMarker,
    SelectedMissionCard,
    SensorDataOverlay,
    type MapStyleId,
    type MapStyleOption
} from '@/components/map/index';
import { StreamingStatusIndicator } from '@/components/map/StreamingStatusIndicator';
import { Text } from '@/components/ui/text';
import { useMissions, useRoutes } from '@/lib/api/hooks';
import type { Mission } from '@/lib/api/types';
import { MAP } from '@/lib/colors';
import { openNativeNavigation } from '@/lib/navigation/openNativeNavigation';
import { useAuthenticatedSensorStreaming } from '@/lib/sensor-streaming/useAuthenticatedSensorStreaming';

const accessToken = Constants.expoConfig?.extra?.mapboxAccessToken ?? '';
Mapbox.setAccessToken(accessToken);

// Default center (Tehran)
const DEFAULT_CENTER: [number, number] = [51.389, 35.6892];
const DEFAULT_ZOOM = 16;

// ---------------------------------------------------------------------------
// Speed display component (shows current speed in km/h when navigating)
// ---------------------------------------------------------------------------

function SpeedDisplay({
  speed,
  isDark,
}: {
  speed: number | null;
  isDark: boolean;
}) {
  if (speed === null || speed < 0) return null;

  const kmh = Math.round(speed * 3.6); // m/s → km/h

  return (
    <View
      style={[
        styles.speedContainer,
        {
          backgroundColor: isDark
            ? 'rgba(17, 24, 39, 0.92)'
            : 'rgba(255, 255, 255, 0.95)',
          borderColor: isDark ? '#374151' : '#DADCE0',
        },
      ]}
    >
      <Text
        style={[
          styles.speedValue,
          { color: isDark ? '#F3F4F6' : '#202124' },
        ]}
      >
        {kmh}
      </Text>
      <Text
        style={[
          styles.speedUnit,
          { color: isDark ? '#9CA3AF' : '#5F6368' },
        ]}
      >
        km/h
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Heading display (shows current bearing when navigating)
// ---------------------------------------------------------------------------

function HeadingDisplay({
  heading,
  isDark,
}: {
  heading: number;
  isDark: boolean;
}) {
  const cardinalDirection = (deg: number) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return dirs[idx];
  };

  return (
    <View
      style={[
        styles.headingContainer,
        {
          backgroundColor: isDark
            ? 'rgba(17, 24, 39, 0.92)'
            : 'rgba(255, 255, 255, 0.95)',
          borderColor: isDark ? '#374151' : '#DADCE0',
        },
      ]}
    >
      <MaterialIcons
        name="explore"
        size={14}
        color={isDark ? '#D1D5DB' : '#5F6368'}
      />
      <Text
        style={[
          styles.headingValue,
          { color: isDark ? '#F3F4F6' : '#202124' },
        ]}
      >
        {Math.round(heading)}°
      </Text>
      <Text
        style={[
          styles.headingDir,
          { color: isDark ? '#9CA3AF' : '#80868B' },
        ]}
      >
        {cardinalDirection(heading)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main TrackingScreen
// ---------------------------------------------------------------------------

export default function TrackingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const cameraRef = useRef<Camera>(null);

  // ── State ──────────────────────────────────────────────────────────
  const [hasPermission, setHasPermission] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [userSpeed, setUserSpeed] = useState<number | null>(null);
  const [showMissions, setShowMissions] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [followUser, setFollowUser] = useState(true);

  // Camera tracking state
  const [cameraHeading, setCameraHeading] = useState(0);
  const [cameraPitch, setCameraPitch] = useState(0);

  // Map features state
  const [selectedStyleId, setSelectedStyleId] = useState<MapStyleId>(
    isDark ? 'dark' : 'streets',
  );
  const [mapStyleURL, setMapStyleURL] = useState(
    isDark
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/streets-v12',
  );
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [threeDEnabled, setThreeDEnabled] = useState(true);

  // Get today's date
  const today = new Date().toISOString().split('T')[0];

  // ── Data ───────────────────────────────────────────────────────────
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

  // ── Location init ──────────────────────────────────────────────────
  useEffect(() => {
    const getInitialLocation = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        setHasPermission(true);
        // followUser is already true by default — the Camera's
        // followUserLocation prop will centre on the user as soon as
        // the location puck is available, no imperative call needed.
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const coords: [number, number] = [
          location.coords.longitude,
          location.coords.latitude,
        ];
        setUserLocation(coords);
        if (location.coords.speed !== null) {
          setUserSpeed(location.coords.speed);
        }
      } catch {
        // Use default center if location fails
      }
    };

    getInitialLocation();
  }, []);

  // ── Track user location for speed display ─────────────────────────
  useEffect(() => {
    if (!hasPermission || !isNavigating) return;

    let subscription: Location.LocationSubscription | undefined;

    const startWatching = async () => {
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 0,
          },
          (loc) => {
            setUserLocation([loc.coords.longitude, loc.coords.latitude]);
            setUserSpeed(loc.coords.speed);
          },
        );
      } catch {
        // Ignore errors – sensor reader also watches location
      }
    };

    startWatching();

    return () => {
      subscription?.remove();
    };
  }, [hasPermission, isNavigating]);

  // ── Camera controls ────────────────────────────────────────────────
  const centerOnUser = useCallback(async () => {
    // Re-enable follow mode so the camera locks back on to the user
    setFollowUser(true);
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords: [number, number] = [
        location.coords.longitude,
        location.coords.latitude,
      ];
      setUserLocation(coords);
    } catch {
      // follow mode will still centre using the location puck
    }
  }, []);

  const zoomIn = useCallback(() => {
    const newZoom = Math.min(zoomLevel + 1, 20);
    setZoomLevel(newZoom);
    cameraRef.current?.setCamera({
      zoomLevel: newZoom,
      animationDuration: 250,
    });
  }, [zoomLevel]);

  const zoomOut = useCallback(() => {
    const newZoom = Math.max(zoomLevel - 1, 3);
    setZoomLevel(newZoom);
    cameraRef.current?.setCamera({
      zoomLevel: newZoom,
      animationDuration: 250,
    });
  }, [zoomLevel]);

  const fitAllMarkers = useCallback(() => {
    if (allBounds && cameraRef.current) {
      setFollowUser(false);
      cameraRef.current.fitBounds(
        allBounds.ne,
        allBounds.sw,
        [50, 50, 150, 50],
        1000,
      );
    }
  }, [allBounds]);

  const resetBearing = useCallback(() => {
    cameraRef.current?.setCamera({
      heading: 0,
      pitch: 0,
      animationDuration: 400,
    });
  }, []);

  // ── Camera state tracking ─────────────────────────────────────────
  const handleCameraChanged = useCallback(
    (state: {
      properties: {
        center: number[];
        zoom: number;
        heading: number;
        pitch: number;
        isFollowingUserLocation?: boolean;
      };
    }) => {
      const { heading, pitch, zoom } = state.properties;
      setCameraHeading(heading);
      setCameraPitch(pitch);
      setZoomLevel(zoom);
    },
    [],
  );

  // ── Map style ─────────────────────────────────────────────────────
  const handleSelectStyle = useCallback((style: MapStyleOption) => {
    setSelectedStyleId(style.id);
    setMapStyleURL(style.styleURL);
    setShowStyleSelector(false);
  }, []);

  // ── Mission interactions ───────────────────────────────────────────
  const selectMission = useCallback((mission: Mission) => {
    setSelectedMission(mission);
    setFollowUser(false);
    cameraRef.current?.setCamera({
      centerCoordinate: [mission.longitude, mission.latitude],
      zoomLevel: 17,
      animationDuration: 500,
      animationMode: 'flyTo',
    });
  }, []);

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
      router.push(`/(tabs)/missions/${mission.id}` as any);
    },
    [router],
  );

  const viewAllMissions = useCallback(() => {
    router.push('/(tabs)/missions' as any);
  }, [router]);

  const centerCoordinate = followUser ? undefined : (userLocation ?? DEFAULT_CENTER);

  // Determine if the current style supports 3D buildings well
  const isSatelliteStyle =
    selectedStyleId === 'satellite' || selectedStyleId === 'satellite-streets';

  return (
    <View style={styles.rootContainer}>
      {/* ── Map ───────────────────────────────────────────────────── */}
      <MapView
        style={styles.map}
        styleURL={mapStyleURL}
        onPress={() => setSelectedMission(null)}
        onCameraChanged={handleCameraChanged}
        compassEnabled={false} // We use our own compass
        compassFadeWhenNorth
        scaleBarEnabled
        scaleBarPosition={{ bottom: 36, left: 12 }}
        logoEnabled
        logoPosition={{ bottom: 12, left: 12 }}
        attributionEnabled
        attributionPosition={{ bottom: 12, right: 12 }}
        pitchEnabled
        rotateEnabled
        zoomEnabled
        scrollEnabled
        projection="mercator"
        localizeLabels={{ locale: 'current' }}
      >
        <Camera
          ref={cameraRef}
          followUserLocation={followUser && hasPermission}
          followZoomLevel={DEFAULT_ZOOM}
          followPitch={0}
          onUserTrackingModeChange={(event: any) => {
            // When the user pans/zooms the map, Mapbox fires this with
            // followUserLocation = false — we mirror that into state so
            // declarative props stop fighting with the gesture.
            if (event?.nativeEvent?.payload?.followUserLocation === false) {
              setFollowUser(false);
            }
          }}
          {...(!followUser || !hasPermission
            ? {
                centerCoordinate: centerCoordinate ?? DEFAULT_CENTER,
                zoomLevel,
              }
            : {})}
          animationMode="flyTo"
          animationDuration={1000}
        />

        {/* ── Atmosphere (sky effect for globe/high zoom-out) ──── */}
        <Atmosphere
          style={{
            color: isDark ? '#242B4B' : '#D8E5F0',
            highColor: isDark ? '#161B36' : '#72B4E8',
            spaceColor: isDark ? '#0B0F26' : '#A5CFEE',
            horizonBlend: 0.08,
            starIntensity: isDark ? 0.3 : 0,
          }}
        />

        {/* ── Light for 3D building extrusions ─────────────────── */}
        <Light
          style={{
            anchor: 'map',
            position: [1.5, 210, 30],
            color: isDark ? '#E8E8E8' : '#FFFFFF',
            intensity: isDark ? 0.3 : 0.4,
          }}
        />

        {/* ── User location puck (Google-style) ────────────────── */}
        {hasPermission && (
          <LocationPuck
            puckBearing="heading"
            puckBearingEnabled
            visible
            pulsing={{
              isEnabled: true,
              color: MAP.locationPuck,
              radius: 70,
            }}
          />
        )}

        {/* ── 3D Buildings ─────────────────────────────────────── */}
        {threeDEnabled && !isSatelliteStyle && (
          <VectorSource
            id="building-source-3d"
            url="mapbox://mapbox.mapbox-streets-v8"
          >
            <FillExtrusionLayer
              id="3d-buildings"
              sourceLayerID="building"
              minZoomLevel={14}
              maxZoomLevel={24}
              filter={['==', 'extrude', 'true']}
              style={{
                fillExtrusionColor: isDark ? '#2A3042' : '#DDE1E8',
                fillExtrusionHeight: [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  14,
                  0,
                  14.5,
                  ['get', 'height'],
                ],
                fillExtrusionBase: [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  14,
                  0,
                  14.5,
                  ['get', 'min_height'],
                ],
                fillExtrusionOpacity: isDark ? 0.7 : 0.55,
                fillExtrusionVerticalGradient: true,
              }}
            />
          </VectorSource>
        )}

        {/* ── Traffic Layer ─────────────────────────────────────── */}
        {trafficEnabled && (
          <VectorSource
            id="traffic-source"
            url="mapbox://mapbox.mapbox-traffic-v1"
          >
            {/* Motorway/trunk traffic */}
            <LineLayer
              id="traffic-motorway"
              sourceLayerID="traffic"
              filter={[
                'all',
                ['==', '$type', 'LineString'],
                ['in', 'class', 'motorway', 'trunk'],
              ]}
              style={{
                lineColor: [
                  'match',
                  ['get', 'congestion'],
                  'low',
                  '#34A853',
                  'moderate',
                  '#FBBC04',
                  'heavy',
                  '#EA4335',
                  'severe',
                  '#9B1B1B',
                  '#34A853',
                ],
                lineWidth: [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  8,
                  1,
                  14,
                  4,
                  18,
                  8,
                ],
                lineOpacity: 0.75,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Primary/secondary traffic */}
            <LineLayer
              id="traffic-primary"
              sourceLayerID="traffic"
              filter={[
                'all',
                ['==', '$type', 'LineString'],
                ['in', 'class', 'primary', 'secondary'],
              ]}
              style={{
                lineColor: [
                  'match',
                  ['get', 'congestion'],
                  'low',
                  '#34A853',
                  'moderate',
                  '#FBBC04',
                  'heavy',
                  '#EA4335',
                  'severe',
                  '#9B1B1B',
                  '#34A853',
                ],
                lineWidth: [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10,
                  0.5,
                  14,
                  2.5,
                  18,
                  6,
                ],
                lineOpacity: 0.65,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Street-level traffic */}
            <LineLayer
              id="traffic-street"
              sourceLayerID="traffic"
              filter={[
                'all',
                ['==', '$type', 'LineString'],
                ['!in', 'class', 'motorway', 'trunk', 'primary', 'secondary'],
              ]}
              minZoomLevel={13}
              style={{
                lineColor: [
                  'match',
                  ['get', 'congestion'],
                  'low',
                  '#34A853',
                  'moderate',
                  '#FBBC04',
                  'heavy',
                  '#EA4335',
                  'severe',
                  '#9B1B1B',
                  '#34A853',
                ],
                lineWidth: [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  13,
                  0.3,
                  16,
                  2,
                  18,
                  4,
                ],
                lineOpacity: 0.5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </VectorSource>
        )}

        {/* ── Active route line with Google-like styling ────────── */}
        {showRoute && activeRouteGeometry && (
          <ShapeSource id="route-source" shape={activeRouteGeometry}>
            {/* Route casing (outer border) */}
            <LineLayer
              id="route-casing"
              style={{
                lineColor: isDark ? MAP.routeHaloDark : MAP.routeLineBorder,
                lineWidth: 10,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.35,
              }}
            />
            {/* Route shadow */}
            <LineLayer
              id="route-shadow"
              style={{
                lineColor: 'rgba(0,0,0,0.15)',
                lineWidth: 9,
                lineBlur: 4,
                lineCap: 'round',
                lineJoin: 'round',
                lineTranslate: [0, 2],
              }}
            />
            {/* Main route line – Google blue */}
            <LineLayer
              id="route-line"
              style={{
                lineColor: isDark ? MAP.routeLineDark : MAP.routeLine,
                lineWidth: 6,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Route border */}
            <LineLayer
              id="route-border"
              belowLayerID="route-line"
              style={{
                lineColor: MAP.routeLineBorder,
                lineWidth: 8,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* ── Route endpoint markers ──────────────────────────── */}
        {showRoute && routeEndpoints?.start && (
          <RouteEndpointMarker
            coordinate={routeEndpoints.start}
            type="start"
            label="Start"
          />
        )}
        {showRoute && routeEndpoints?.end && (
          <RouteEndpointMarker
            coordinate={routeEndpoints.end}
            type="end"
            label="End"
          />
        )}

        {/* ── Mission markers ─────────────────────────────────── */}
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

      {/* ── Streaming Status Indicator (top-left) ──────────────── */}
      <StreamingStatusIndicator />

      {/* ── Sensor Data Overlay (below streaming indicator) ──────── */}
      <SensorDataOverlay />

      {/* ── Speed Display (bottom-left, when navigating) ──────── */}
      {isNavigating && (
        <View style={styles.bottomLeftInfo}>
          <SpeedDisplay speed={userSpeed} isDark={isDark} />
          {cameraHeading > 2 && (
            <HeadingDisplay heading={cameraHeading} isDark={isDark} />
          )}
        </View>
      )}

      {/* ── Map Controls (Google-style) ────────────────────────── */}
      <MapControls
        onCenterOnUser={centerOnUser}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onToggleMissions={() => setShowMissions(!showMissions)}
        onToggleRoute={() => setShowRoute(!showRoute)}
        onFitBounds={allBounds ? fitAllMarkers : undefined}
        onOpenLayers={() => setShowStyleSelector(true)}
        onResetBearing={resetBearing}
        showMissions={showMissions}
        showRoute={showRoute}
        heading={cameraHeading}
        pitch={cameraPitch}
      />

      {/* ── Map Style Selector Modal ──────────────────────────── */}
      <MapStyleSelector
        visible={showStyleSelector}
        selectedStyleId={selectedStyleId}
        onSelectStyle={handleSelectStyle}
        onClose={() => setShowStyleSelector(false)}
        trafficEnabled={trafficEnabled}
        onToggleTraffic={() => setTrafficEnabled(!trafficEnabled)}
        threeDEnabled={threeDEnabled}
        onToggle3D={() => setThreeDEnabled(!threeDEnabled)}
      />

      {/* ── Selected Mission Card ─────────────────────────────── */}
      {selectedMission && (
        <SelectedMissionCard
          mission={selectedMission}
          onNavigate={() => navigateToMission(selectedMission)}
          onCall={() => callMission(selectedMission)}
          onViewDetails={() => viewMissionDetails(selectedMission)}
          onClose={() => setSelectedMission(null)}
        />
      )}

      {/* ── Mission Info Panel ────────────────────────────────── */}
      {mappableMissions.length > 0 && !selectedMission && (
        <MissionInfoPanel
          missions={mappableMissions}
          onViewAll={viewAllMissions}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: {
    flex: 1,
  },

  // ── Speed display ─────────────────────────────────────────────────
  bottomLeftInfo: {
    position: 'absolute',
    bottom: 100,
    left: 12,
    gap: 6,
    zIndex: 5,
  },
  speedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  speedValue: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 22,
  },
  speedUnit: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: -1,
  },

  // ── Heading display ───────────────────────────────────────────────
  headingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  headingValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headingDir: {
    fontSize: 11,
    fontWeight: '600',
  },
});

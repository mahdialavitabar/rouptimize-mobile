import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Mapbox, {
  Camera,
  LineLayer,
  LocationPuck,
  MapView,
  ShapeSource,
} from '@rnmapbox/maps';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';

import {
  EnhancedMissionMarker,
  MapControls,
  RouteEndpointMarker,
  SelectedMissionCard,
} from '@/components/map/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useRoute } from '@/lib/api/hooks';
import type { Mission, MissionStatus } from '@/lib/api/types';
import {
  openNativeNavigation,
  openNativeNavigationForRoute,
} from '@/lib/navigation/openNativeNavigation';
import { formatDistance, formatDuration, formatTimeWindow } from '@/lib/utils';

const accessToken = Constants.expoConfig?.extra?.mapboxAccessToken ?? '';
Mapbox.setAccessToken(accessToken);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.45;

// Status badge configuration for missions
const statusConfig: Record<MissionStatus, { color: string; bgColor: string }> =
  {
    unassigned: { color: '#6B7280', bgColor: '#F3F4F6' },
    assigned: { color: '#3B82F6', bgColor: '#DBEAFE' },
    inProgress: { color: '#F59E0B', bgColor: '#FEF3C7' },
    delivered: { color: '#10B981', bgColor: '#D1FAE5' },
  };

// Get marker color based on mission status
function getMarkerColor(status: MissionStatus): string {
  return statusConfig[status]?.color || '#6B7280';
}

// Mission list item
function MissionListItem({
  mission,
  order,
  onPress,
  onNavigate,
}: {
  mission: Mission;
  order: number;
  onPress: () => void;
  onNavigate: () => void;
}) {
  const colorScheme = useColorScheme();
  const statusColor = getMarkerColor(mission.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center py-3 border-b border-border"
    >
      {/* Order badge */}
      <View
        className="w-8 h-8 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: statusColor }}
      >
        <Text className="text-white text-sm font-bold">{order}</Text>
      </View>

      {/* Mission info */}
      <View className="flex-1">
        <Text className="font-medium text-foreground" numberOfLines={1}>
          {mission.customerName}
        </Text>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {mission.address}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {formatTimeWindow(mission.startTimeWindow)} -{' '}
          {formatTimeWindow(mission.endTimeWindow)}
        </Text>
      </View>

      {/* Navigate button */}
      <TouchableOpacity
        onPress={onNavigate}
        className="ml-2 p-2 rounded-full bg-primary"
      >
        <MaterialIcons name="navigation" size={20} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// Default center location (Tehran) when no missions
const DEFAULT_CENTER: [number, number] = [51.389, 35.6892];
const DEFAULT_ZOOM = 11;

export default function RouteMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const cameraRef = useRef<Camera>(null);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);

  const { route, loading, error } = useRoute(id);

  // Sort missions by stop order - use routeMissions if available, fallback to missions
  const sortedMissions = useMemo(() => {
    // Prefer routeMissions (has stopOrder and nested mission)
    if (route?.routeMissions && route.routeMissions.length > 0) {
      return [...route.routeMissions]
        .sort((a, b) => a.stopOrder - b.stopOrder)
        .map((rm) => rm.mission)
        .filter((m): m is Mission => m !== undefined);
    }
    // Fallback to flat missions array (already Mission objects)
    if (route?.missions && route.missions.length > 0) {
      return route.missions;
    }
    return [];
  }, [route]);

  // Calculate bounding box for all missions, or use default center
  const mapConfig = useMemo(() => {
    if (sortedMissions.length === 0) {
      // No missions - use default center
      return {
        type: 'center' as const,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      };
    }

    if (sortedMissions.length === 1) {
      // Single mission - center on it with reasonable zoom
      const mission = sortedMissions[0];
      return {
        type: 'center' as const,
        center: [mission.longitude, mission.latitude] as [number, number],
        zoom: 14,
      };
    }

    // Multiple missions - calculate bounding box
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    sortedMissions.forEach((m) => {
      minLng = Math.min(minLng, m.longitude);
      maxLng = Math.max(maxLng, m.longitude);
      minLat = Math.min(minLat, m.latitude);
      maxLat = Math.max(maxLat, m.latitude);
    });

    // Add padding
    const lngPadding = Math.max((maxLng - minLng) * 0.2, 0.01);
    const latPadding = Math.max((maxLat - minLat) * 0.2, 0.01);

    return {
      type: 'bounds' as const,
      bounds: {
        ne: [maxLng + lngPadding, maxLat + latPadding] as [number, number],
        sw: [minLng - lngPadding, minLat - latPadding] as [number, number],
      },
    };
  }, [sortedMissions]);

  // GeoJSON for route line
  const routeGeoJSON = useMemo(() => {
    if (!route?.geometry) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: route.geometry,
    };
  }, [route]);

  // Get start/end points from vehicle
  const routeEndpoints = useMemo(() => {
    if (!route?.vehicle) return null;
    const vehicle = route.vehicle as any;

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
  }, [route]);

  // Start native navigation for the entire route
  const startNavigation = useCallback(() => {
    const stops = sortedMissions.map((mission) => ({
      latitude: mission.latitude,
      longitude: mission.longitude,
      address: mission.address,
      isCompleted: mission.status === 'delivered',
    }));
    openNativeNavigationForRoute(stops);
  }, [sortedMissions]);

  // Navigate to a specific mission using native navigation app
  const navigateToMission = useCallback((mission: Mission) => {
    openNativeNavigation({
      latitude: mission.latitude,
      longitude: mission.longitude,
      address: mission.address,
    });
  }, []);

  // Call mission customer
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

  // Focus camera on mission
  const focusOnMission = useCallback((mission: Mission) => {
    setSelectedMission(mission);
    cameraRef.current?.setCamera({
      centerCoordinate: [mission.longitude, mission.latitude],
      zoomLevel: 15,
      animationDuration: 500,
    });
  }, []);

  // Navigate to mission details
  const goToMissionDetails = useCallback(
    (mission: Mission) => {
      router.push(`/(drawer)/(tabs)/missions/${mission.id}` as any);
    },
    [router],
  );

  // Fit all markers
  const fitAllMarkers = useCallback(() => {
    if (mapConfig.type === 'bounds') {
      cameraRef.current?.fitBounds(
        mapConfig.bounds.ne,
        mapConfig.bounds.sw,
        [50, 50, 50, 50],
        1000,
      );
    }
  }, [mapConfig]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          size="large"
          color={colorScheme === 'dark' ? '#fff' : '#3B82F6'}
        />
        <Text className="mt-4 text-muted-foreground">Loading route...</Text>
      </View>
    );
  }

  if (error || !route) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <MaterialIcons
          name="error-outline"
          size={48}
          color={colorScheme === 'dark' ? '#EF4444' : '#DC2626'}
        />
        <Text className="mt-4 text-center text-lg font-medium text-destructive">
          Failed to load route
        </Text>
        <Text className="mt-2 text-center text-muted-foreground">
          {error?.message || 'Route not found'}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-6 rounded-lg bg-primary px-6 py-3"
        >
          <Text className="font-medium text-primary-foreground">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Map */}
      <View style={{ height: MAP_HEIGHT }}>
        <MapView
          style={styles.map}
          styleURL={
            colorScheme === 'dark'
              ? 'mapbox://styles/mapbox/navigation-night-v1'
              : 'mapbox://styles/mapbox/navigation-day-v1'
          }
        >
          <Camera
            ref={cameraRef}
            {...(mapConfig.type === 'bounds'
              ? {
                  bounds: mapConfig.bounds,
                  padding: {
                    paddingTop: 50,
                    paddingRight: 50,
                    paddingBottom: 50,
                    paddingLeft: 50,
                  },
                }
              : {
                  centerCoordinate: mapConfig.center,
                  zoomLevel: mapConfig.zoom,
                })}
            animationDuration={1000}
          />

          {/* User location */}
          <LocationPuck puckBearing="heading" puckBearingEnabled visible />

          {/* Route line with enhanced styling */}
          {routeGeoJSON && (
            <ShapeSource id="route-source" shape={routeGeoJSON}>
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
          {routeEndpoints?.start && (
            <RouteEndpointMarker
              coordinate={routeEndpoints.start}
              type="start"
              label="Start"
            />
          )}

          {/* End point marker */}
          {routeEndpoints?.end && (
            <RouteEndpointMarker
              coordinate={routeEndpoints.end}
              type="end"
              label="End"
            />
          )}

          {/* Enhanced mission markers */}
          {sortedMissions.map((mission, index) => (
            <EnhancedMissionMarker
              key={mission.id}
              mission={mission}
              order={index + 1}
              isSelected={selectedMission?.id === mission.id}
              isActive={mission.status === 'inProgress'}
              showLabel={false}
              onPress={() => focusOnMission(mission)}
            />
          ))}
        </MapView>

        {/* Map controls overlay */}
        <MapControls
          onFitBounds={sortedMissions.length > 1 ? fitAllMarkers : undefined}
        />

        {/* Selected mission card */}
        {selectedMission && (
          <SelectedMissionCard
            mission={selectedMission}
            onNavigate={() => navigateToMission(selectedMission)}
            onCall={() => callMission(selectedMission)}
            onViewDetails={() => goToMissionDetails(selectedMission)}
            onClose={() => setSelectedMission(null)}
          />
        )}
      </View>

      {/* Route info and mission list */}
      <ScrollView className="flex-1">
        {/* Route summary card */}
        <Card className="mx-4 mt-4 mb-2">
          <CardHeader className="pb-2">
            <CardTitle>{route.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="flex-row justify-between">
              <View className="items-center">
                <Text className="text-2xl font-bold text-foreground">
                  {sortedMissions.length}
                </Text>
                <Text className="text-xs text-muted-foreground">Stops</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold text-foreground">
                  {route.totalDistanceMeters > 0
                    ? formatDistance(route.totalDistanceMeters)
                    : sortedMissions.length === 1
                      ? '—'
                      : formatDistance(route.totalDistanceMeters)}
                </Text>
                <Text className="text-xs text-muted-foreground">Distance</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold text-foreground">
                  {route.totalDurationSeconds > 0
                    ? formatDuration(route.totalDurationSeconds)
                    : sortedMissions.length === 1
                      ? '—'
                      : formatDuration(route.totalDurationSeconds)}
                </Text>
                <Text className="text-xs text-muted-foreground">Duration</Text>
              </View>
            </View>

            {/* Single-stop info message */}
            {sortedMissions.length === 1 && route.totalDistanceMeters === 0 && (
              <Text className="text-xs text-muted-foreground text-center mt-2">
                Distance & duration calculated during navigation
              </Text>
            )}

            {/* Start Navigation Button */}
            {sortedMissions.length > 0 && (
              <TouchableOpacity
                onPress={startNavigation}
                className="mt-4 flex-row items-center justify-center bg-primary py-3 rounded-lg"
                activeOpacity={0.8}
              >
                <MaterialIcons name="navigation" size={24} color="#fff" />
                <Text className="text-primary-foreground font-semibold ml-2 text-base">
                  Start Navigation
                </Text>
              </TouchableOpacity>
            )}
          </CardContent>
        </Card>

        {/* Mission list */}
        <Card className="mx-4 mb-4">
          <CardHeader>
            <CardTitle>Delivery Stops</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {sortedMissions.map((mission, index) => (
              <MissionListItem
                key={mission.id}
                mission={mission}
                order={index + 1}
                onPress={() => goToMissionDetails(mission)}
                onNavigate={() => navigateToMission(mission)}
              />
            ))}
            {sortedMissions.length === 0 && (
              <Text className="text-center text-muted-foreground py-4">
                No stops in this route
              </Text>
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});

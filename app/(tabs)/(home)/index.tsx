import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useMissions, useRoutes } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth';
import { BRAND, SEMANTIC, STATUS, pickColor } from '@/lib/colors';
import { useSensorPermission } from '@/lib/sensor-streaming/SensorPermissionContext';
import { formatTimeWindow } from '@/lib/utils';

/**
 * Returns a time-of-day greeting string based on the current hour.
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const { hasBeenAsked, requestPermission, permissionStatus } =
    useSensorPermission();

  // Prompt for sensor permission after login if not yet asked
  useEffect(() => {
    // Wait until permission status is loaded (not 'loading')
    if (permissionStatus === 'loading') return;

    // Only prompt if user hasn't been asked before
    if (!hasBeenAsked) {
      // Small delay to let the home screen render first
      const timer = setTimeout(() => {
        requestPermission();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasBeenAsked, requestPermission, permissionStatus]);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const {
    routes,
    loading: routesLoading,
    refetch: refetchRoutes,
  } = useRoutes({ date: today });
  const {
    missions,
    loading: missionsLoading,
    refetch: refetchMissions,
  } = useMissions({ date: today });

  const loading = routesLoading || missionsLoading;

  // Calculate stats
  const stats = useMemo(() => {
    const totalMissions = missions.length;
    const assignedMissions = missions.filter(
      (m) => m.status === 'assigned',
    ).length;
    const inProgressMissions = missions.filter(
      (m) => m.status === 'inProgress',
    ).length;
    const deliveredMissions = missions.filter(
      (m) => m.status === 'delivered',
    ).length;
    const activeRoutes = routes.filter(
      (r) => r.status === 'in_progress',
    ).length;
    const plannedRoutes = routes.filter((r) => r.status === 'planned').length;

    return {
      totalMissions,
      assignedMissions,
      inProgressMissions,
      deliveredMissions,
      totalRoutes: routes.length,
      activeRoutes,
      plannedRoutes,
    };
  }, [missions, routes]);

  // Get next mission (first assigned or in-progress)
  const nextMission = useMemo(() => {
    const activeMission = missions.find((m) => m.status === 'inProgress');
    if (activeMission) return activeMission;
    return missions.find((m) => m.status === 'assigned');
  }, [missions]);

  const handleRefresh = async () => {
    await Promise.all([refetchRoutes(), refetchMissions()]);
  };

  const navigateToMission = (id: string) => {
    router.push(`/(tabs)/missions/${id}` as any);
  };

  const greeting = getGreeting();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }
    >
      {/* Welcome Card */}
      <Card className="mb-4 bg-primary">
        <CardContent className="py-6">
          <Text className="text-primary-foreground text-lg">
            {greeting},{' '}
          </Text>
          <Text className="text-primary-foreground text-2xl font-bold">
            {user?.username || 'Driver'}
          </Text>
          <Text className="text-primary-foreground/80 mt-2">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <View className="flex-row flex-wrap gap-3 mb-4">
        {/* Total Missions */}
        <TouchableOpacity
          className="flex-1 min-w-[45%]"
          onPress={() => router.push('/(tabs)/missions' as any)}
          activeOpacity={0.7}
        >
          <Card>
            <CardContent className="py-4 items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: isDark ? 'rgba(249, 115, 22, 0.15)' : '#FFEDD5' }}
              >
                <MaterialIcons name="assignment" size={24} color={BRAND.primary} />
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.totalMissions}
              </Text>
              <Text className="text-muted-foreground text-sm">
                Total Missions
              </Text>
            </CardContent>
          </Card>
        </TouchableOpacity>

        {/* Delivered */}
        <TouchableOpacity
          className="flex-1 min-w-[45%]"
          onPress={() => router.push('/(tabs)/missions' as any)}
          activeOpacity={0.7}
        >
          <Card>
            <CardContent className="py-4 items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5' }}
              >
                <MaterialIcons name="check-circle" size={24} color={STATUS.delivered.color} />
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.deliveredMissions}
              </Text>
              <Text className="text-muted-foreground text-sm">Delivered</Text>
            </CardContent>
          </Card>
        </TouchableOpacity>

        {/* In Progress */}
        <TouchableOpacity
          className="flex-1 min-w-[45%]"
          onPress={() => router.push('/(tabs)/missions' as any)}
          activeOpacity={0.7}
        >
          <Card>
            <CardContent className="py-4 items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }}
              >
                <MaterialIcons
                  name="local-shipping"
                  size={24}
                  color={STATUS.inProgress.color}
                />
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.inProgressMissions}
              </Text>
              <Text className="text-muted-foreground text-sm">In Progress</Text>
            </CardContent>
          </Card>
        </TouchableOpacity>

        {/* Routes */}
        <TouchableOpacity
          className="flex-1 min-w-[45%]"
          onPress={() => router.push('/(tabs)/routes' as any)}
          activeOpacity={0.7}
        >
          <Card>
            <CardContent className="py-4 items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: isDark ? 'rgba(13, 148, 136, 0.15)' : '#CCFBF1' }}
              >
                <MaterialIcons name="route" size={24} color={pickColor(SEMANTIC.route, isDark)} />
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.totalRoutes}
              </Text>
              <Text className="text-muted-foreground text-sm">
                Routes Today
              </Text>
            </CardContent>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Next Mission Card */}
      {nextMission && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex-row items-center">
              <MaterialIcons
                name={
                  nextMission.status === 'inProgress'
                    ? 'local-shipping'
                    : 'assignment'
                }
                size={20}
                color={
                  nextMission.status === 'inProgress'
                    ? STATUS.inProgress.color
                    : BRAND.primary
                }
              />
              <Text className="ml-2 text-lg font-semibold text-foreground">
                {nextMission.status === 'inProgress'
                  ? 'Current Delivery'
                  : 'Next Delivery'}
              </Text>
            </CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <Text className="text-lg font-medium text-foreground">
              {nextMission.customerName}
            </Text>
            <View className="flex-row items-center gap-2">
              <MaterialIcons
                name="location-on"
                size={16}
                color={pickColor(SEMANTIC.location, isDark)}
              />
              <Text className="text-muted-foreground flex-1" numberOfLines={1}>
                {nextMission.address}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <MaterialIcons
                name="schedule"
                size={16}
                color={pickColor(SEMANTIC.calendar, isDark)}
              />
              <Text className="text-muted-foreground">
                {formatTimeWindow(nextMission.startTimeWindow)} -{' '}
                {formatTimeWindow(nextMission.endTimeWindow)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigateToMission(nextMission.id)}
              activeOpacity={0.8}
              className="mt-2 flex-row items-center justify-center bg-primary rounded-lg py-3"
            >
              <MaterialIcons name="navigation" size={20} color="#fff" />
              <Text className="ml-2 text-primary-foreground font-medium">
                View Details
              </Text>
            </TouchableOpacity>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && stats.totalMissions === 0 && (
        <Card className="mb-4">
          <CardContent className="py-8 items-center">
            <MaterialIcons
              name="event-available"
              size={48}
              color={isDark ? '#6B7280' : '#9CA3AF'}
            />
            <Text className="mt-4 text-lg font-medium text-foreground">
              No deliveries today
            </Text>
            <Text className="text-muted-foreground text-center mt-2">
              You don't have any missions scheduled for today. Check back later!
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="gap-0">
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/routes' as any)}
            activeOpacity={0.7}
            className="flex-row items-center py-3 border-b border-border"
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center mr-3"
              style={{
                backgroundColor: isDark
                  ? 'rgba(13, 148, 136, 0.15)'
                  : 'rgba(13, 148, 136, 0.1)',
              }}
            >
              <MaterialIcons
                name="map"
                size={20}
                color={pickColor(SEMANTIC.route, isDark)}
              />
            </View>
            <Text className="flex-1 text-foreground font-medium">
              View Today's Routes
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={isDark ? '#6B7280' : '#9CA3AF'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/missions' as any)}
            activeOpacity={0.7}
            className="flex-row items-center py-3 border-b border-border"
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center mr-3"
              style={{
                backgroundColor: isDark
                  ? `rgba(${BRAND.primaryRgb}, 0.15)`
                  : `rgba(${BRAND.primaryRgb}, 0.1)`,
              }}
            >
              <MaterialIcons
                name="assignment"
                size={20}
                color={pickColor(SEMANTIC.mission, isDark)}
              />
            </View>
            <Text className="flex-1 text-foreground font-medium">
              All Missions
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={isDark ? '#6B7280' : '#9CA3AF'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/tracking' as any)}
            activeOpacity={0.7}
            className="flex-row items-center py-3"
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center mr-3"
              style={{
                backgroundColor: isDark
                  ? 'rgba(5, 150, 105, 0.15)'
                  : 'rgba(5, 150, 105, 0.1)',
              }}
            >
              <MaterialIcons
                name="gps-fixed"
                size={20}
                color={pickColor(SEMANTIC.navigation, isDark)}
              />
            </View>
            <Text className="flex-1 text-foreground font-medium">
              Live Tracking
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={isDark ? '#6B7280' : '#9CA3AF'}
            />
          </TouchableOpacity>
        </CardContent>
      </Card>
    </ScrollView>
  );
}

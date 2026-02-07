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
import { useSensorPermission } from '@/lib/sensor-streaming/SensorPermissionContext';
import { formatTimeWindow } from '@/lib/utils';

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
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
    router.push(`/(drawer)/(tabs)/missions/${id}` as any);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }
    >
      {/* Welcome Card */}
      <Card className="mb-4 bg-primary">
        <CardContent className="py-6">
          <Text className="text-primary-foreground text-lg">Welcome back,</Text>
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
          onPress={() => router.push('/(drawer)/(tabs)/missions' as any)}
        >
          <Card>
            <CardContent className="py-4 items-center">
              <View className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 items-center justify-center mb-2">
                <MaterialIcons name="assignment" size={24} color="#3B82F6" />
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
        <View className="flex-1 min-w-[45%]">
          <Card>
            <CardContent className="py-4 items-center">
              <View className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 items-center justify-center mb-2">
                <MaterialIcons name="check-circle" size={24} color="#10B981" />
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.deliveredMissions}
              </Text>
              <Text className="text-muted-foreground text-sm">Delivered</Text>
            </CardContent>
          </Card>
        </View>

        {/* In Progress */}
        <View className="flex-1 min-w-[45%]">
          <Card>
            <CardContent className="py-4 items-center">
              <View className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900 items-center justify-center mb-2">
                <MaterialIcons
                  name="local-shipping"
                  size={24}
                  color="#F59E0B"
                />
              </View>
              <Text className="text-2xl font-bold text-foreground">
                {stats.inProgressMissions}
              </Text>
              <Text className="text-muted-foreground text-sm">In Progress</Text>
            </CardContent>
          </Card>
        </View>

        {/* Routes */}
        <TouchableOpacity
          className="flex-1 min-w-[45%]"
          onPress={() => router.push('/(drawer)/(tabs)/routes' as any)}
        >
          <Card>
            <CardContent className="py-4 items-center">
              <View className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900 items-center justify-center mb-2">
                <MaterialIcons name="route" size={24} color="#8B5CF6" />
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
                  nextMission.status === 'inProgress' ? '#F59E0B' : '#3B82F6'
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
                color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
              />
              <Text className="text-muted-foreground flex-1" numberOfLines={1}>
                {nextMission.address}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <MaterialIcons
                name="schedule"
                size={16}
                color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
              />
              <Text className="text-muted-foreground">
                {formatTimeWindow(nextMission.startTimeWindow)} -{' '}
                {formatTimeWindow(nextMission.endTimeWindow)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigateToMission(nextMission.id)}
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
              color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
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
        <CardContent className="gap-2">
          <TouchableOpacity
            onPress={() => router.push('/(drawer)/(tabs)/routes' as any)}
            className="flex-row items-center py-3 border-b border-border"
          >
            <MaterialIcons
              name="map"
              size={24}
              color={colorScheme === 'dark' ? '#3B82F6' : '#2563EB'}
            />
            <Text className="ml-3 flex-1 text-foreground">
              View Today's Routes
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(drawer)/(tabs)/missions' as any)}
            className="flex-row items-center py-3 border-b border-border"
          >
            <MaterialIcons
              name="assignment"
              size={24}
              color={colorScheme === 'dark' ? '#3B82F6' : '#2563EB'}
            />
            <Text className="ml-3 flex-1 text-foreground">All Missions</Text>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(drawer)/(tabs)/tracking' as any)}
            className="flex-row items-center py-3"
          >
            <MaterialIcons
              name="gps-fixed"
              size={24}
              color={colorScheme === 'dark' ? '#3B82F6' : '#2563EB'}
            />
            <Text className="ml-3 flex-1 text-foreground">Live Tracking</Text>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
            />
          </TouchableOpacity>
        </CardContent>
      </Card>
    </ScrollView>
  );
}

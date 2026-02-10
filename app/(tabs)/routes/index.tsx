import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterChip } from '@/components/ui/filter-chip';
import { Text } from '@/components/ui/text';
import { useRoutes } from '@/lib/api/hooks';
import type { Route, RouteStatus } from '@/lib/api/types';
import { BRAND, ROUTE_STATUS, SEMANTIC, pickColor } from '@/lib/colors';
import { formatDistance, formatDuration } from '@/lib/utils';

// Status badge configuration
const statusConfig: Record<
  RouteStatus,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  draft: {
    label: 'Draft',
    color: ROUTE_STATUS.draft.color,
    bgColor: ROUTE_STATUS.draft.bgColor,
    icon: 'edit',
  },
  planned: {
    label: 'Planned',
    color: ROUTE_STATUS.planned.color,
    bgColor: ROUTE_STATUS.planned.bgColor,
    icon: 'event',
  },
  in_progress: {
    label: 'In Progress',
    color: ROUTE_STATUS.in_progress.color,
    bgColor: ROUTE_STATUS.in_progress.bgColor,
    icon: 'local-shipping',
  },
  completed: {
    label: 'Completed',
    color: ROUTE_STATUS.completed.color,
    bgColor: ROUTE_STATUS.completed.bgColor,
    icon: 'check-circle',
  },
  delayed: {
    label: 'Delayed',
    color: ROUTE_STATUS.delayed.color,
    bgColor: ROUTE_STATUS.delayed.bgColor,
    icon: 'warning',
  },
};

// Filter options
type FilterOption = 'all' | 'planned' | 'in_progress' | 'completed';

function StatusBadge({ status }: { status: RouteStatus }) {
  const config = statusConfig[status];

  return (
    <View
      className="flex-row items-center rounded-full px-2 py-1"
      style={{ backgroundColor: config.bgColor }}
    >
      <MaterialIcons
        name={config.icon as keyof typeof MaterialIcons.glyphMap}
        size={12}
        color={config.color}
      />
      <Text
        className="ml-1 text-xs font-medium"
        style={{ color: config.color }}
      >
        {config.label}
      </Text>
    </View>
  );
}

function RouteCard({ route, onPress }: { route: Route; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  // Count missions - prefer routeMissions, fallback to missions
  const missionCount =
    route.routeMissions?.length ?? route.missions?.length ?? 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card className="mb-3 mx-4">
        <CardHeader className="pb-2">
          <View className="flex-row items-center justify-between">
            <CardTitle className="flex-1" numberOfLines={1}>
              {route.name}
            </CardTitle>
            <StatusBadge status={route.status} />
          </View>
        </CardHeader>
        <CardContent>
          <View className="gap-2">
            {/* Description */}
            {route.description && (
              <Text className="text-muted-foreground text-sm" numberOfLines={2}>
                {route.description}
              </Text>
            )}

            {/* Stats row */}
            <View className="flex-row items-center gap-4 mt-1">
              {/* Missions count */}
              <View className="flex-row items-center gap-1">
                <MaterialIcons
                  name="assignment"
                  size={16}
                  color={pickColor(SEMANTIC.mission, isDark)}
                />
                <Text className="text-muted-foreground text-sm">
                  {missionCount} {missionCount === 1 ? 'stop' : 'stops'}
                </Text>
              </View>

              {/* Distance */}
              <View className="flex-row items-center gap-1">
                <MaterialIcons
                  name="straighten"
                  size={16}
                  color={pickColor(SEMANTIC.route, isDark)}
                />
                <Text className="text-muted-foreground text-sm">
                  {formatDistance(route.totalDistanceMeters)}
                </Text>
              </View>

              {/* Duration */}
              <View className="flex-row items-center gap-1">
                <MaterialIcons
                  name="schedule"
                  size={16}
                  color={pickColor(SEMANTIC.calendar, isDark)}
                />
                <Text className="text-muted-foreground text-sm">
                  {formatDuration(route.totalDurationSeconds)}
                </Text>
              </View>
            </View>

            {/* Vehicle (if assigned) */}
            {route.vehicle && (
              <View className="flex-row items-center gap-2 mt-1">
                <MaterialIcons
                  name="local-shipping"
                  size={16}
                  color={pickColor(SEMANTIC.delivery, isDark)}
                />
                <Text className="text-muted-foreground text-sm">
                  {route.vehicle.plateNumber}
                  {route.vehicle.model && ` - ${route.vehicle.model}`}
                </Text>
              </View>
            )}

            {/* Date */}
            <View className="flex-row items-center gap-2">
              <MaterialIcons
                name="calendar-today"
                size={16}
                color={pickColor(SEMANTIC.calendar, isDark)}
              />
              <Text className="text-muted-foreground text-sm">
                {new Date(route.date).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}

export default function RoutesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [filter, setFilter] = useState<FilterOption>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const { routes, loading, error, refetch } = useRoutes({ date: today });

  // Filter routes based on selected filter
  const filteredRoutes = useMemo(() => {
    if (filter === 'all') return routes;
    return routes.filter((r) => r.status === filter);
  }, [routes, filter]);

  // Count routes by status
  const statusCounts = useMemo(() => {
    return {
      all: routes.length,
      planned: routes.filter((r) => r.status === 'planned').length,
      in_progress: routes.filter((r) => r.status === 'in_progress').length,
      completed: routes.filter((r) => r.status === 'completed').length,
    };
  }, [routes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const navigateToRoute = (id: string) => {
    router.push(`/(tabs)/routes/${id}` as any);
  };

  if (loading && !refreshing) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          size="large"
          color={isDark ? '#fff' : BRAND.primary}
        />
        <Text className="mt-4 text-muted-foreground">Loading routes...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <MaterialIcons
          name="error-outline"
          size={48}
          color={isDark ? '#EF4444' : '#DC2626'}
        />
        <Text className="mt-4 text-center text-lg font-medium text-destructive">
          Failed to load routes
        </Text>
        <Text className="mt-2 text-center text-muted-foreground">
          {error.message}
        </Text>
        <TouchableOpacity
          onPress={refetch}
          className="mt-6 rounded-lg bg-primary px-6 py-3"
        >
          <Text className="font-medium text-primary-foreground">Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Filter chips */}
      <View className="px-4 py-3">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: 'all', label: `All (${statusCounts.all})` },
            { key: 'planned', label: `Planned (${statusCounts.planned})` },
            {
              key: 'in_progress',
              label: `Active (${statusCounts.in_progress})`,
            },
            { key: 'completed', label: `Done (${statusCounts.completed})` },
          ]}
          renderItem={({ item }) => (
            <FilterChip
              label={item.label}
              isActive={filter === item.key}
              onPress={() => setFilter(item.key as FilterOption)}
            />
          )}
          keyExtractor={(item) => item.key}
        />
      </View>

      {/* Routes list */}
      <FlatList
        data={filteredRoutes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RouteCard route={item} onPress={() => navigateToRoute(item.id)} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={isDark ? '#fff' : BRAND.primary}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <MaterialIcons
              name="route"
              size={64}
              color={isDark ? '#4B5563' : '#9CA3AF'}
            />
            <Text className="mt-4 text-lg font-medium text-muted-foreground">
              No routes found
            </Text>
            <Text className="mt-2 text-center text-muted-foreground px-8">
              {filter === 'all'
                ? "You don't have any routes for today"
                : `No ${filter.replace('_', ' ')} routes`}
            </Text>
          </View>
        }
        contentContainerStyle={
          filteredRoutes.length === 0 ? { flex: 1 } : { paddingVertical: 8 }
        }
      />
    </View>
  );
}

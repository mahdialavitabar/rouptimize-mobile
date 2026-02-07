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
import { Text } from '@/components/ui/text';
import { useMissions } from '@/lib/api/hooks';
import type { Mission, MissionStatus } from '@/lib/api/types';
import { formatTimeWindow } from '@/lib/utils';

// Status badge configuration
const statusConfig: Record<
  MissionStatus,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  unassigned: {
    label: 'Unassigned',
    color: '#6B7280',
    bgColor: '#F3F4F6',
    icon: 'help-outline',
  },
  assigned: {
    label: 'Assigned',
    color: '#3B82F6',
    bgColor: '#DBEAFE',
    icon: 'assignment',
  },
  inProgress: {
    label: 'In Progress',
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    icon: 'local-shipping',
  },
  delivered: {
    label: 'Delivered',
    color: '#10B981',
    bgColor: '#D1FAE5',
    icon: 'check-circle',
  },
};

// Filter options for driver
type FilterOption = 'all' | 'assigned' | 'inProgress' | 'delivered';

function StatusBadge({ status }: { status: MissionStatus }) {
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

function MissionCard({
  mission,
  onPress,
}: {
  mission: Mission;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card className="mb-3 mx-4">
        <CardHeader className="pb-2">
          <View className="flex-row items-center justify-between">
            <CardTitle className="flex-1" numberOfLines={1}>
              {mission.customerName}
            </CardTitle>
            <StatusBadge status={mission.status} />
          </View>
        </CardHeader>
        <CardContent>
          <View className="gap-2">
            {/* Address */}
            <View className="flex-row items-start gap-2">
              <MaterialIcons
                name="location-on"
                size={16}
                color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
              />
              <Text
                className="text-muted-foreground flex-1 text-sm"
                numberOfLines={2}
              >
                {mission.address}
              </Text>
            </View>

            {/* Phone */}
            <View className="flex-row items-center gap-2">
              <MaterialIcons
                name="phone"
                size={16}
                color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
              />
              <Text className="text-muted-foreground text-sm">
                {mission.phone}
              </Text>
            </View>

            {/* Time Window */}
            <View className="flex-row items-center gap-2">
              <MaterialIcons
                name="schedule"
                size={16}
                color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
              />
              <Text className="text-muted-foreground text-sm">
                {formatTimeWindow(mission.startTimeWindow)} -{' '}
                {formatTimeWindow(mission.endTimeWindow)}
              </Text>
            </View>

            {/* Vehicle (if assigned) */}
            {mission.vehiclePlate && (
              <View className="flex-row items-center gap-2">
                <MaterialIcons
                  name="local-shipping"
                  size={16}
                  color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                />
                <Text className="text-muted-foreground text-sm">
                  {mission.vehiclePlate}
                </Text>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      className="mr-2 rounded-full px-4 py-2"
      style={{
        backgroundColor: isActive
          ? colorScheme === 'dark'
            ? '#3B82F6'
            : '#2563EB'
          : colorScheme === 'dark'
            ? '#374151'
            : '#F3F4F6',
      }}
    >
      <Text
        className="text-sm font-medium"
        style={{
          color: isActive
            ? '#fff'
            : colorScheme === 'dark'
              ? '#D1D5DB'
              : '#4B5563',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function MissionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [filter, setFilter] = useState<FilterOption>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const { missions, loading, error, refetch } = useMissions({ date: today });

  // Filter missions based on selected filter
  const filteredMissions = useMemo(() => {
    if (filter === 'all') return missions;
    return missions.filter((m) => m.status === filter);
  }, [missions, filter]);

  // Count missions by status
  const statusCounts = useMemo(() => {
    return {
      all: missions.length,
      assigned: missions.filter((m) => m.status === 'assigned').length,
      inProgress: missions.filter((m) => m.status === 'inProgress').length,
      delivered: missions.filter((m) => m.status === 'delivered').length,
    };
  }, [missions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const navigateToMission = (id: string) => {
    router.push(`/(drawer)/(tabs)/missions/${id}` as any);
  };

  if (loading && !refreshing) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          size="large"
          color={colorScheme === 'dark' ? '#fff' : '#3B82F6'}
        />
        <Text className="mt-4 text-muted-foreground">Loading missions...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <MaterialIcons
          name="error-outline"
          size={48}
          color={colorScheme === 'dark' ? '#EF4444' : '#DC2626'}
        />
        <Text className="mt-4 text-center text-lg font-medium text-destructive">
          Failed to load missions
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
            { key: 'assigned', label: `Assigned (${statusCounts.assigned})` },
            {
              key: 'inProgress',
              label: `In Progress (${statusCounts.inProgress})`,
            },
            {
              key: 'delivered',
              label: `Delivered (${statusCounts.delivered})`,
            },
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

      {/* Mission list */}
      <FlatList
        data={filteredMissions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MissionCard
            mission={item}
            onPress={() => navigateToMission(item.id)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colorScheme === 'dark' ? '#fff' : '#3B82F6'}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <MaterialIcons
              name="inbox"
              size={64}
              color={colorScheme === 'dark' ? '#4B5563' : '#9CA3AF'}
            />
            <Text className="mt-4 text-lg font-medium text-muted-foreground">
              No missions found
            </Text>
            <Text className="mt-2 text-center text-muted-foreground px-8">
              {filter === 'all'
                ? "You don't have any missions for today"
                : `No ${filter} missions`}
            </Text>
          </View>
        }
        contentContainerStyle={
          filteredMissions.length === 0 ? { flex: 1 } : { paddingVertical: 8 }
        }
      />
    </View>
  );
}

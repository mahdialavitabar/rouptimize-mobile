import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useMission, useUpdateMissionStatus } from '@/lib/api/hooks';
import { MissionStatus } from '@/lib/api/types';
import { openNativeNavigation } from '@/lib/navigation/openNativeNavigation';
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

// Get next valid status for driver (only forward transitions)
function getNextStatus(currentStatus: MissionStatus): MissionStatus | null {
  switch (currentStatus) {
    case MissionStatus.ASSIGNED:
      return MissionStatus.IN_PROGRESS;
    case MissionStatus.IN_PROGRESS:
      return MissionStatus.DELIVERED;
    default:
      return null; // No forward transition available
  }
}

// Get button text for status update
function getStatusButtonText(currentStatus: MissionStatus): string {
  switch (currentStatus) {
    case MissionStatus.ASSIGNED:
      return 'Start Delivery';
    case MissionStatus.IN_PROGRESS:
      return 'Mark as Delivered';
    default:
      return '';
  }
}

function StatusBadge({ status }: { status: MissionStatus }) {
  const config = statusConfig[status];

  return (
    <View
      className="flex-row items-center rounded-full px-3 py-1.5"
      style={{ backgroundColor: config.bgColor }}
    >
      <MaterialIcons
        name={config.icon as keyof typeof MaterialIcons.glyphMap}
        size={16}
        color={config.color}
      />
      <Text
        className="ml-1.5 text-sm font-medium"
        style={{ color: config.color }}
      >
        {config.label}
      </Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const colorScheme = useColorScheme();
  const Component = onPress ? TouchableOpacity : View;

  return (
    <Component
      className="flex-row items-start py-3 border-b border-border"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialIcons
        name={icon as keyof typeof MaterialIcons.glyphMap}
        size={20}
        color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
        style={{ marginTop: 2 }}
      />
      <View className="ml-3 flex-1">
        <Text className="text-muted-foreground text-xs uppercase tracking-wider">
          {label}
        </Text>
        <Text
          className={`text-base ${onPress ? 'text-primary' : 'text-foreground'}`}
          numberOfLines={3}
        >
          {value}
        </Text>
      </View>
      {onPress && (
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
        />
      )}
    </Component>
  );
}

export default function MissionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [isUpdating, setIsUpdating] = useState(false);

  const { mission, loading, error, refetch } = useMission(id);
  const { updateStatus } = useUpdateMissionStatus();

  // Open navigation app using native apps
  const handleNavigate = useCallback(async () => {
    if (!mission?.latitude || !mission?.longitude) {
      Alert.alert('Error', 'No location available for this mission');
      return;
    }

    await openNativeNavigation({
      latitude: mission.latitude,
      longitude: mission.longitude,
      address: mission.address,
    });
  }, [mission]);

  // Call customer
  const callCustomer = useCallback(async () => {
    if (!mission?.phone) {
      Alert.alert('Error', 'No phone number available');
      return;
    }

    const phoneUrl = `tel:${mission.phone}`;
    const canOpen = await Linking.canOpenURL(phoneUrl);

    if (canOpen) {
      await Linking.openURL(phoneUrl);
    } else {
      // On emulator or devices without phone capability, offer to copy number
      Alert.alert(
        'Copy Phone Number',
        `Would you like to copy ${mission.phone} to clipboard?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Copy',
            onPress: async () => {
              await Clipboard.setStringAsync(mission.phone);
              Alert.alert('Copied', 'Phone number copied to clipboard');
            },
          },
        ],
      );
    }
  }, [mission]);

  // Update mission status
  const handleStatusUpdate = useCallback(async () => {
    if (!mission) return;

    const nextStatus = getNextStatus(mission.status);
    if (!nextStatus) return;

    const actionText =
      nextStatus === MissionStatus.IN_PROGRESS
        ? 'start delivery'
        : 'mark as delivered';

    Alert.alert(
      'Confirm Status Update',
      `Are you sure you want to ${actionText} for this mission?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsUpdating(true);
            try {
              await updateStatus(mission.id, nextStatus);
              await refetch();
              Alert.alert('Success', 'Mission status updated successfully');
            } catch {
              Alert.alert('Error', 'Failed to update mission status');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ],
    );
  }, [mission, updateStatus, refetch]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          size="large"
          color={colorScheme === 'dark' ? '#fff' : '#3B82F6'}
        />
        <Text className="mt-4 text-muted-foreground">Loading mission...</Text>
      </View>
    );
  }

  if (error || !mission) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <MaterialIcons
          name="error-outline"
          size={48}
          color={colorScheme === 'dark' ? '#EF4444' : '#DC2626'}
        />
        <Text className="mt-4 text-center text-lg font-medium text-destructive">
          Failed to load mission
        </Text>
        <Text className="mt-2 text-center text-muted-foreground">
          {error?.message || 'Mission not found'}
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

  const nextStatus = getNextStatus(mission.status);
  const canUpdateStatus = nextStatus !== null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {/* Header Card */}
        <Card className="mb-4">
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <CardTitle className="flex-1 text-xl" numberOfLines={2}>
                {mission.customerName}
              </CardTitle>
              <StatusBadge status={mission.status} />
            </View>
          </CardHeader>
          <CardContent>
            {/* Quick actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleNavigate}
                className="flex-1 flex-row items-center justify-center rounded-lg bg-primary py-3"
              >
                <MaterialIcons name="navigation" size={20} color="#fff" />
                <Text className="ml-2 font-medium text-primary-foreground">
                  Navigate
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={callCustomer}
                className="flex-1 flex-row items-center justify-center rounded-lg bg-secondary py-3"
              >
                <MaterialIcons
                  name="phone"
                  size={20}
                  color={colorScheme === 'dark' ? '#fff' : '#000'}
                />
                <Text className="ml-2 font-medium text-secondary-foreground">
                  Call
                </Text>
              </TouchableOpacity>
            </View>
          </CardContent>
        </Card>

        {/* Details Card */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Delivery Details</CardTitle>
          </CardHeader>
          <CardContent className="gap-0">
            <InfoRow
              icon="location-on"
              label="Address"
              value={mission.address}
              onPress={handleNavigate}
            />
            <InfoRow
              icon="phone"
              label="Phone"
              value={mission.phone}
              onPress={callCustomer}
            />
            <InfoRow
              icon="schedule"
              label="Time Window"
              value={`${formatTimeWindow(mission.startTimeWindow)} - ${formatTimeWindow(mission.endTimeWindow)}`}
            />
            <InfoRow
              icon="calendar-today"
              label="Date"
              value={new Date(mission.date).toLocaleDateString()}
            />
            {mission.vehiclePlate && (
              <InfoRow
                icon="local-shipping"
                label="Vehicle"
                value={mission.vehiclePlate}
              />
            )}
            {mission.deliveryTime && (
              <InfoRow
                icon="check-circle"
                label="Delivered At"
                value={formatTimeWindow(mission.deliveryTime)}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation Card */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Navigation</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <TouchableOpacity
              onPress={handleNavigate}
              className="flex-row items-center justify-between py-2"
            >
              <View className="flex-row items-center">
                <MaterialIcons
                  name="navigation"
                  size={24}
                  color={colorScheme === 'dark' ? '#10B981' : '#059669'}
                />
                <Text
                  className="ml-3 font-medium"
                  style={{
                    color: colorScheme === 'dark' ? '#10B981' : '#059669',
                  }}
                >
                  Open in Navigation App
                </Text>
              </View>
              <MaterialIcons
                name="open-in-new"
                size={24}
                color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
              />
            </TouchableOpacity>
            {mission.routeId && (
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    `/(drawer)/(tabs)/routes/${mission.routeId}` as any,
                  )
                }
                className="flex-row items-center justify-between py-2 border-t border-border"
              >
                <View className="flex-row items-center">
                  <MaterialIcons
                    name="route"
                    size={24}
                    color={colorScheme === 'dark' ? '#3B82F6' : '#2563EB'}
                  />
                  <Text className="ml-3 text-primary font-medium">
                    View Route on Map
                  </Text>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={24}
                  color={colorScheme === 'dark' ? '#9CA3AF' : '#6B7280'}
                />
              </TouchableOpacity>
            )}
          </CardContent>
        </Card>
      </ScrollView>

      {/* Bottom action button */}
      {canUpdateStatus && (
        <View className="border-t border-border bg-background px-4 py-4">
          <Button
            onPress={handleStatusUpdate}
            disabled={isUpdating}
            className={`w-full ${
              mission.status === MissionStatus.ASSIGNED
                ? 'bg-amber-500'
                : 'bg-green-500'
            }`}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View className="flex-row items-center">
                <MaterialIcons
                  name={
                    mission.status === MissionStatus.ASSIGNED
                      ? 'play-arrow'
                      : 'check'
                  }
                  size={20}
                  color="#fff"
                />
                <Text className="ml-2 font-semibold text-white">
                  {getStatusButtonText(mission.status)}
                </Text>
              </View>
            )}
          </Button>
        </View>
      )}
    </View>
  );
}

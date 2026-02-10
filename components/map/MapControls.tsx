import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRef } from 'react';
import {
    Animated,
    StyleSheet,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Text } from '@/components/ui/text';

interface MapControlsProps {
  onCenterOnUser?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onToggleMissions?: () => void;
  onToggleRoute?: () => void;
  onFitBounds?: () => void;
  showMissions?: boolean;
  showRoute?: boolean;
  position?: 'left' | 'right';
}

export function MapControls({
  onCenterOnUser,
  onZoomIn,
  onZoomOut,
  onToggleMissions,
  onToggleRoute,
  onFitBounds,
  showMissions = true,
  showRoute = true,
  position = 'right',
}: MapControlsProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bgColor = isDark ? '#374151' : '#fff';
  const iconColor = isDark ? '#fff' : '#374151';
  const activeColor = '#3B82F6';

  return (
    <View
      style={[
        styles.controlsContainer,
        position === 'left' ? styles.leftPosition : styles.rightPosition,
      ]}
    >
      {/* Center on user */}
      {onCenterOnUser && (
        <ControlButton
          icon="my-location"
          onPress={onCenterOnUser}
          bgColor={bgColor}
          iconColor={activeColor}
          tooltip="My Location"
        />
      )}

      {/* Fit all markers */}
      {onFitBounds && (
        <ControlButton
          icon="fit-screen"
          onPress={onFitBounds}
          bgColor={bgColor}
          iconColor={iconColor}
          tooltip="Fit All"
        />
      )}

      {/* Zoom controls */}
      {(onZoomIn || onZoomOut) && (
        <View style={[styles.zoomGroup, { backgroundColor: bgColor }]}>
          {onZoomIn && (
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={onZoomIn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="add" size={24} color={iconColor} />
            </TouchableOpacity>
          )}
          <View
            style={[
              styles.zoomDivider,
              { backgroundColor: isDark ? '#4B5563' : '#E5E7EB' },
            ]}
          />
          {onZoomOut && (
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={onZoomOut}
              activeOpacity={0.7}
            >
              <MaterialIcons name="remove" size={24} color={iconColor} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Toggle missions */}
      {onToggleMissions && (
        <ControlButton
          icon="local-shipping"
          onPress={onToggleMissions}
          bgColor={showMissions ? activeColor : bgColor}
          iconColor={showMissions ? '#fff' : iconColor}
          tooltip="Deliveries"
        />
      )}

      {/* Toggle route */}
      {onToggleRoute && (
        <ControlButton
          icon="route"
          onPress={onToggleRoute}
          bgColor={showRoute ? activeColor : bgColor}
          iconColor={showRoute ? '#fff' : iconColor}
          tooltip="Route"
        />
      )}
    </View>
  );
}

interface ControlButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  bgColor: string;
  iconColor: string;
  tooltip?: string;
  size?: number;
}

function ControlButton({
  icon,
  onPress,
  bgColor,
  iconColor,
  tooltip,
  size = 48,
}: ControlButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.controlButton,
          { backgroundColor: bgColor, width: size, height: size },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <MaterialIcons name={icon} size={24} color={iconColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Mission info panel for bottom of map
interface MissionInfoPanelProps {
  missions: { status: string }[];
  onViewAll?: () => void;
}

export function MissionInfoPanel({
  missions,
  onViewAll,
}: MissionInfoPanelProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const counts = {
    assigned: missions.filter((m) => m.status === 'assigned').length,
    inProgress: missions.filter((m) => m.status === 'inProgress').length,
    delivered: missions.filter((m) => m.status === 'delivered').length,
  };

  return (
    <View
      style={[
        styles.infoPanel,
        { backgroundColor: isDark ? '#1F2937' : '#fff' },
      ]}
    >
      <View style={styles.infoPanelContent}>
        <StatusPill color="#3B82F6" count={counts.assigned} label="Assigned" />
        <StatusPill
          color="#F59E0B"
          count={counts.inProgress}
          label="Active"
          highlight
        />
        <StatusPill color="#10B981" count={counts.delivered} label="Done" />
      </View>

      {onViewAll && (
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={onViewAll}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <MaterialIcons name="chevron-right" size={18} color="#3B82F6" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusPill({
  color,
  count,
  label,
  highlight = false,
}: {
  color: string;
  count: number;
  label: string;
  highlight?: boolean;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.statusPill, highlight && styles.statusPillHighlight]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text
        style={[
          styles.statusCount,
          isDark && styles.statusCountDark,
          highlight && styles.statusCountHighlight,
        ]}
      >
        {count}
      </Text>
      <Text style={[styles.statusLabel, isDark && styles.statusLabelDark]}>
        {label}
      </Text>
    </View>
  );
}

// Selected mission card that appears at bottom
interface SelectedMissionCardProps {
  mission: {
    customerName: string;
    address: string;
    status: string;
    phone?: string;
  };
  onNavigate?: () => void;
  onCall?: () => void;
  onViewDetails?: () => void;
  onClose?: () => void;
}

export function SelectedMissionCard({
  mission,
  onNavigate,
  onCall,
  onViewDetails,
  onClose,
}: SelectedMissionCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const statusColors: Record<string, string> = {
    assigned: '#3B82F6',
    inProgress: '#F59E0B',
    delivered: '#10B981',
  };

  return (
    <Animated.View
      style={[
        styles.selectedCard,
        { backgroundColor: isDark ? '#1F2937' : '#fff' },
      ]}
    >
      {/* Close button */}
      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <MaterialIcons
            name="close"
            size={20}
            color={isDark ? '#9CA3AF' : '#6B7280'}
          />
        </TouchableOpacity>
      )}

      {/* Status indicator */}
      <View
        style={[
          styles.statusIndicator,
          { backgroundColor: statusColors[mission.status] || '#6B7280' },
        ]}
      />

      {/* Content */}
      <View style={styles.selectedCardContent}>
        <Text
          style={[styles.customerName, { color: isDark ? '#fff' : '#1F2937' }]}
          numberOfLines={1}
        >
          {mission.customerName}
        </Text>
        <View style={styles.addressRow}>
          <MaterialIcons
            name="location-on"
            size={14}
            color={isDark ? '#9CA3AF' : '#6B7280'}
          />
          <Text style={styles.addressText} numberOfLines={1}>
            {mission.address}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.selectedCardActions}>
        {onNavigate && (
          <TouchableOpacity
            style={[styles.actionButton, styles.navigateButton]}
            onPress={onNavigate}
          >
            <MaterialIcons name="navigation" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        {onCall && mission.phone && (
          <TouchableOpacity
            style={[styles.actionButton, styles.callButton]}
            onPress={onCall}
          >
            <MaterialIcons name="phone" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        {onViewDetails && (
          <TouchableOpacity
            style={[styles.actionButton, styles.detailsButton]}
            onPress={onViewDetails}
          >
            <MaterialIcons name="info" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Controls container
  controlsContainer: {
    position: 'absolute',
    top: 16,
    gap: 10,
  },
  leftPosition: {
    left: 16,
  },
  rightPosition: {
    right: 16,
  },
  controlButton: {
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomGroup: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomButton: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: 1,
    marginHorizontal: 8,
  },

  // Info panel
  infoPanel: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  infoPanelContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillHighlight: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
  },
  statusCountDark: {
    color: '#E5E7EB',
  },
  statusCountHighlight: {
    color: '#F59E0B',
  },
  statusLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusLabelDark: {
    color: '#9CA3AF',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },

  // Selected mission card
  selectedCard: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
  },
  statusIndicator: {
    width: 4,
    height: 50,
    borderRadius: 2,
    marginRight: 12,
  },
  selectedCardContent: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  selectedCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigateButton: {
    backgroundColor: '#3B82F6',
  },
  callButton: {
    backgroundColor: '#10B981',
  },
  detailsButton: {
    backgroundColor: '#6366F1',
  },
});

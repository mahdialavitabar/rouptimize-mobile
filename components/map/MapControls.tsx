import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef } from 'react';
import {
    Animated,
    StyleSheet,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { BRAND, MAP, STATUS } from '@/lib/colors';

// ---------------------------------------------------------------------------
// Google-Maps-style Map Controls
// ---------------------------------------------------------------------------

interface MapControlsProps {
  onCenterOnUser?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onToggleMissions?: () => void;
  onToggleRoute?: () => void;
  onFitBounds?: () => void;
  onOpenLayers?: () => void;
  onResetBearing?: () => void;
  showMissions?: boolean;
  showRoute?: boolean;
  /** Current map heading in degrees – the compass shows when heading !== 0 */
  heading?: number;
  /** Current map pitch/tilt in degrees */
  pitch?: number;
}

export function MapControls({
  onCenterOnUser,
  onZoomIn,
  onZoomOut,
  onToggleMissions,
  onToggleRoute,
  onFitBounds,
  onOpenLayers,
  onResetBearing,
  showMissions = true,
  showRoute = true,
  heading = 0,
  pitch = 0,
}: MapControlsProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const cardBg = isDark ? '#1F2937' : '#FFFFFF';
  const iconColor = isDark ? '#E5E7EB' : '#5F6368';
  const activeAccent = MAP.controlAccent;
  const dividerColor = isDark ? '#374151' : '#EAEDF0';

  // Compass is visible when heading OR pitch are non-zero
  const showCompass = Math.abs(heading) > 2 || Math.abs(pitch) > 2;

  return (
    <>
      {/* ── Top bar: chips + compass + layers in one horizontal row ──── */}
      <View style={[styles.topBar, { top: Math.max(insets.top, 12) + 4 }]}>
        {/* Toggle chips: Missions / Route */}
        <View style={styles.chipGroup}>
          {onToggleMissions && (
            <ToggleChip
              icon="local-shipping"
              label="Deliveries"
              isActive={showMissions}
              onPress={onToggleMissions}
              activeColor={activeAccent}
              isDark={isDark}
            />
          )}
          {onToggleRoute && (
            <ToggleChip
              icon="route"
              label="Route"
              isActive={showRoute}
              onPress={onToggleRoute}
              activeColor={activeAccent}
              isDark={isDark}
            />
          )}
        </View>

        {/* Spacer pushes the right-side buttons to the edge */}
        <View style={{ flex: 1 }} />

        {/* Compass – auto-appears when map is rotated/tilted */}
        {showCompass && onResetBearing && (
          <CompassButton
            heading={heading}
            onPress={onResetBearing}
            bgColor={cardBg}
          />
        )}

        {/* Layers button (square Google-style) */}
        {onOpenLayers && (
          <GMapButton
            icon="layers"
            onPress={onOpenLayers}
            bgColor={cardBg}
            iconColor={iconColor}
            size={44}
            borderRadius={8}
          />
        )}
      </View>

      {/* ── Right-side vertical cluster: Zoom + Fit ──────────────────── */}
      <View style={styles.rightCenter}>
        {(onZoomIn || onZoomOut) && (
          <View style={[styles.zoomCard, { backgroundColor: cardBg }]}>
            {onZoomIn && (
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={onZoomIn}
                activeOpacity={0.6}
                hitSlop={{ top: 4, bottom: 2, left: 8, right: 8 }}
              >
                <MaterialIcons name="add" size={22} color={iconColor} />
              </TouchableOpacity>
            )}
            <View style={[styles.zoomDivider, { backgroundColor: dividerColor }]} />
            {onZoomOut && (
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={onZoomOut}
                activeOpacity={0.6}
                hitSlop={{ top: 2, bottom: 4, left: 8, right: 8 }}
              >
                <MaterialIcons name="remove" size={22} color={iconColor} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {onFitBounds && (
          <GMapButton
            icon="fit-screen"
            onPress={onFitBounds}
            bgColor={cardBg}
            iconColor={iconColor}
            size={44}
            borderRadius={8}
          />
        )}
      </View>

      {/* ── Bottom-right: My Location FAB ────────────────────────────── */}
      {onCenterOnUser && (
        <View style={styles.bottomRight}>
          <GMapButton
            icon="my-location"
            onPress={onCenterOnUser}
            bgColor={cardBg}
            iconColor={activeAccent}
            size={48}
            borderRadius={24}
            elevated
          />
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Reusable Google-style button
// ---------------------------------------------------------------------------

interface GMapButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  bgColor: string;
  iconColor: string;
  size?: number;
  iconSize?: number;
  borderRadius?: number;
  elevated?: boolean;
}

function GMapButton({
  icon,
  onPress,
  bgColor,
  iconColor,
  size = 44,
  iconSize = 22,
  borderRadius = 8,
  elevated = false,
}: GMapButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.gmapBtn,
          {
            backgroundColor: bgColor,
            width: size,
            height: size,
            borderRadius,
          },
          elevated && styles.gmapBtnElevated,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <MaterialIcons name={icon} size={iconSize} color={iconColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Compass button that rotates with the map heading
// ---------------------------------------------------------------------------

function CompassButton({
  heading,
  onPress,
  bgColor,
}: {
  heading: number;
  onPress: () => void;
  bgColor: string;
}) {
  const rotateAnim = useRef(new Animated.Value(-heading)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: -heading,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [heading, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  return (
    <TouchableOpacity
      style={[styles.compassBtn, { backgroundColor: bgColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Animated.View style={{ transform: [{ rotate: rotation }] }}>
        <View style={styles.compassNeedle}>
          {/* North triangle (red) */}
          <View style={styles.compassNorth} />
          {/* South triangle (gray) */}
          <View style={styles.compassSouth} />
        </View>
      </Animated.View>
      <View style={styles.compassCenter} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Toggle chip (Deliveries / Route)
// ---------------------------------------------------------------------------

function ToggleChip({
  icon,
  label,
  isActive,
  onPress,
  activeColor,
  isDark,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  isActive: boolean;
  onPress: () => void;
  activeColor: string;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: isActive
            ? activeColor
            : isDark
              ? '#1F2937'
              : '#FFFFFF',
          borderColor: isActive
            ? activeColor
            : isDark
              ? '#374151'
              : '#DADCE0',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialIcons
        name={icon}
        size={15}
        color={isActive ? '#FFFFFF' : isDark ? '#D1D5DB' : '#5F6368'}
      />
      <Text
        style={[
          styles.chipLabel,
          {
            color: isActive ? '#FFFFFF' : isDark ? '#D1D5DB' : '#5F6368',
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Mission Info Panel (Google-style bottom card)
// ---------------------------------------------------------------------------

interface MissionInfoPanelProps {
  missions: { status: string }[];
  onViewAll?: () => void;
}

export function MissionInfoPanel({ missions, onViewAll }: MissionInfoPanelProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const counts = {
    assigned: missions.filter((m) => m.status === 'assigned').length,
    inProgress: missions.filter((m) => m.status === 'inProgress').length,
    delivered: missions.filter((m) => m.status === 'delivered').length,
  };

  const total = missions.length;

  return (
    <View
      style={[
        styles.infoPanel,
        { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' },
      ]}
    >
      {/* Top row – summary */}
      <View style={styles.infoPanelTop}>
        <View style={styles.infoPanelTitleRow}>
          <MaterialIcons
            name="local-shipping"
            size={18}
            color={isDark ? '#D1D5DB' : '#5F6368'}
          />
          <Text
            style={[
              styles.infoPanelTitle,
              { color: isDark ? '#F3F4F6' : '#202124' },
            ]}
          >
            {total} Deliveries Today
          </Text>
        </View>
      </View>

      {/* Status pills */}
      <View style={styles.infoPanelContent}>
        <StatusPill
          color={STATUS.assigned.color}
          count={counts.assigned}
          label="Assigned"
          isDark={isDark}
        />
        <StatusPill
          color="#FBBC04"
          count={counts.inProgress}
          label="Active"
          isDark={isDark}
          highlight
        />
        <StatusPill
          color="#34A853"
          count={counts.delivered}
          label="Done"
          isDark={isDark}
        />
      </View>

      {/* View all */}
      {onViewAll && (
        <TouchableOpacity
          style={[
            styles.viewAllBtn,
            { borderTopColor: isDark ? '#374151' : '#EAEDF0' },
          ]}
          onPress={onViewAll}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>View All Missions</Text>
          <MaterialIcons name="chevron-right" size={18} color={BRAND.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusPill({
  color,
  count,
  label,
  isDark,
  highlight = false,
}: {
  color: string;
  count: number;
  label: string;
  isDark: boolean;
  highlight?: boolean;
}) {
  return (
    <View
      style={[
        styles.statusPill,
        highlight && {
          backgroundColor: color + '18',
          borderRadius: 20,
        },
      ]}
    >
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text
        style={[
          styles.statusCount,
          { color: highlight ? color : isDark ? '#E5E7EB' : '#202124' },
        ]}
      >
        {count}
      </Text>
      <Text
        style={[styles.statusLabel, { color: isDark ? '#9CA3AF' : '#5F6368' }]}
      >
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Selected mission card (bottom sheet style)
// ---------------------------------------------------------------------------

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
    assigned: STATUS.assigned.color,
    inProgress: STATUS.inProgress.color,
    delivered: STATUS.delivered.color,
  };

  const statusLabels: Record<string, string> = {
    assigned: 'Assigned',
    inProgress: 'In Progress',
    delivered: 'Delivered',
  };

  const statusColor = statusColors[mission.status] || '#5F6368';

  return (
    <View
      style={[
        styles.selectedCard,
        { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' },
      ]}
    >
      {/* Handle bar */}
      <View style={styles.cardHandleContainer}>
        <View
          style={[
            styles.cardHandle,
            { backgroundColor: isDark ? '#4B5563' : '#DADCE0' },
          ]}
        />
      </View>

      {/* Close button */}
      {onClose && (
        <TouchableOpacity
          style={[
            styles.cardCloseBtn,
            { backgroundColor: isDark ? '#374151' : '#F1F3F4' },
          ]}
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons
            name="close"
            size={16}
            color={isDark ? '#9CA3AF' : '#5F6368'}
          />
        </TouchableOpacity>
      )}

      {/* Content row */}
      <View style={styles.cardContent}>
        {/* Status indicator */}
        <View
          style={[
            styles.cardStatusBar,
            { backgroundColor: statusColor },
          ]}
        />

        <View style={styles.cardInfo}>
          {/* Status badge */}
          <View
            style={[styles.cardStatusBadge, { backgroundColor: statusColor + '18' }]}
          >
            <View style={[styles.cardStatusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.cardStatusText, { color: statusColor }]}>
              {statusLabels[mission.status] || mission.status}
            </Text>
          </View>

          <Text
            style={[
              styles.cardCustomerName,
              { color: isDark ? '#F3F4F6' : '#202124' },
            ]}
            numberOfLines={1}
          >
            {mission.customerName}
          </Text>

          <View style={styles.cardAddressRow}>
            <MaterialIcons
              name="location-on"
              size={14}
              color={isDark ? '#9CA3AF' : '#80868B'}
            />
            <Text
              style={[
                styles.cardAddress,
                { color: isDark ? '#9CA3AF' : '#5F6368' },
              ]}
              numberOfLines={1}
            >
              {mission.address}
            </Text>
          </View>
        </View>
      </View>

      {/* Action buttons row */}
      <View style={styles.cardActions}>
        {onNavigate && (
          <TouchableOpacity
            style={[styles.cardActionBtn, { backgroundColor: BRAND.primary }]}
            onPress={onNavigate}
            activeOpacity={0.8}
          >
            <MaterialIcons name="navigation" size={18} color="#FFFFFF" />
            <Text style={styles.cardActionLabel}>Directions</Text>
          </TouchableOpacity>
        )}
        {onCall && mission.phone && (
          <TouchableOpacity
            style={[
              styles.cardActionBtn,
              {
                backgroundColor: isDark ? '#374151' : '#F1F3F4',
              },
            ]}
            onPress={onCall}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="phone"
              size={18}
              color={isDark ? '#D1D5DB' : '#5F6368'}
            />
            <Text
              style={[
                styles.cardActionLabel,
                { color: isDark ? '#D1D5DB' : '#5F6368' },
              ]}
            >
              Call
            </Text>
          </TouchableOpacity>
        )}
        {onViewDetails && (
          <TouchableOpacity
            style={[
              styles.cardActionBtn,
              {
                backgroundColor: isDark ? '#374151' : '#F1F3F4',
              },
            ]}
            onPress={onViewDetails}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="info-outline"
              size={18}
              color={isDark ? '#D1D5DB' : '#5F6368'}
            />
            <Text
              style={[
                styles.cardActionLabel,
                { color: isDark ? '#D1D5DB' : '#5F6368' },
              ]}
            >
              Details
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SHADOW_LIGHT = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.18,
  shadowRadius: 3,
  elevation: 3,
};

const SHADOW_MEDIUM = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 6,
  elevation: 5,
};

const styles = StyleSheet.create({
  // ── Layout containers ─────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 12, // overridden dynamically with safe area inset
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 5,
  },
  rightCenter: {
    position: 'absolute',
    right: 12,
    top: '42%',
    gap: 8,
    alignItems: 'center',
    zIndex: 5,
  },
  bottomRight: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    zIndex: 5,
  },

  // ── Google-style button ───────────────────────────────────────────
  gmapBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_LIGHT,
  },
  gmapBtnElevated: {
    ...SHADOW_MEDIUM,
  },

  // ── Zoom card ─────────────────────────────────────────────────────
  zoomCard: {
    borderRadius: 8,
    overflow: 'hidden',
    ...SHADOW_LIGHT,
  },
  zoomBtn: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
  },

  // ── Compass ───────────────────────────────────────────────────────
  compassBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_LIGHT,
  },
  compassNeedle: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassNorth: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#EA4335',
    marginBottom: -1,
  },
  compassSouth: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#B0B5B9',
    marginTop: -1,
  },
  compassCenter: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#5F6368',
  },

  // ── Toggle chips ──────────────────────────────────────────────────
  chipGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    ...SHADOW_LIGHT,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Mission Info Panel ────────────────────────────────────────────
  infoPanel: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    borderRadius: 16,
    paddingTop: 14,
    ...SHADOW_MEDIUM,
  },
  infoPanelTop: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  infoPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoPanelTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoPanelContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusCount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusLabel: {
    fontSize: 12,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.primary,
  },

  // ── Selected Mission Card ─────────────────────────────────────────
  selectedCard: {
    position: 'absolute',
    bottom: 100,
    left: 12,
    right: 12,
    borderRadius: 20,
    paddingBottom: 16,
    ...SHADOW_MEDIUM,
  },
  cardHandleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  cardHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  cardCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardContent: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  cardStatusBar: {
    width: 4,
    borderRadius: 2,
    minHeight: 54,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 2,
  },
  cardStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardCustomerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardAddress: {
    fontSize: 13,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 24,
  },
  cardActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

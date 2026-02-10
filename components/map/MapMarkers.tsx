import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MarkerView } from '@rnmapbox/maps';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { Mission, MissionStatus } from '@/lib/api/types';
import { STATUS } from '@/lib/colors';

// Status configuration with colors and icons
export const missionStatusConfig: Record<
  MissionStatus | string,
  {
    color: string;
    bgColor: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    pulseColor: string;
  }
> = {
  unassigned: {
    color: STATUS.unassigned.color,
    bgColor: STATUS.unassigned.bgColor,
    icon: 'help-outline',
    pulseColor: STATUS.unassigned.pulseColor,
  },
  assigned: {
    color: STATUS.assigned.color,
    bgColor: STATUS.assigned.bgColor,
    icon: 'assignment',
    pulseColor: STATUS.assigned.pulseColor,
  },
  inProgress: {
    color: STATUS.inProgress.color,
    bgColor: STATUS.inProgress.bgColor,
    icon: 'local-shipping',
    pulseColor: STATUS.inProgress.pulseColor,
  },
  delivered: {
    color: STATUS.delivered.color,
    bgColor: STATUS.delivered.bgColor,
    icon: 'check-circle',
    pulseColor: STATUS.delivered.pulseColor,
  },
};

// Animated pulse ring for active/selected markers
function PulseRing({
  color,
  size = 60,
  active = true,
}: {
  color: string;
  size?: number;
  active?: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;

    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.5,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [active, scaleAnim, opacityAnim]);

  if (!active) return null;

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    />
  );
}

// Bounce animation for marker entrance
function useBounceAnimation() {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [bounceAnim]);

  return bounceAnim;
}

// Enhanced Mission Marker with animations
export function EnhancedMissionMarker({
  mission,
  order,
  isSelected = false,
  isActive = false,
  showLabel = false,
  onPress,
}: {
  mission: Mission;
  order?: number;
  isSelected?: boolean;
  isActive?: boolean;
  showLabel?: boolean;
  onPress?: () => void;
}) {
  const config =
    missionStatusConfig[mission.status] || missionStatusConfig.assigned;
  const bounceAnim = useBounceAnimation();
  const isInProgress = mission.status === 'inProgress';

  return (
    <MarkerView
      id={`mission-marker-${mission.id}`}
      coordinate={[mission.longitude, mission.latitude]}
      allowOverlap
      allowOverlapWithPuck
    >
      <View style={styles.enhancedMarkerWrapper} onTouchEnd={onPress}>
        {/* Pulse effect for in-progress or selected */}
        <PulseRing
          color={config.pulseColor}
          size={isSelected ? 70 : 55}
          active={isInProgress || isSelected}
        />

        {/* Main marker */}
        <Animated.View
          style={[
            styles.enhancedMarkerContainer,
            {
              transform: [
                {
                  scale: bounceAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, isSelected ? 1.15 : 1],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Marker body */}
          <View
            style={[
              styles.enhancedMarkerBody,
              {
                backgroundColor: config.color,
                borderColor: isSelected ? '#fff' : 'rgba(255,255,255,0.8)',
                borderWidth: isSelected ? 3 : 2,
                shadowColor: config.color,
                shadowOpacity: isSelected ? 0.6 : 0.4,
                shadowRadius: isSelected ? 12 : 8,
              },
            ]}
          >
            {order !== undefined ? (
              <Text style={styles.markerOrderText}>{order}</Text>
            ) : (
              <MaterialIcons name={config.icon} size={18} color="#fff" />
            )}
          </View>

          {/* Marker pointer */}
          <View
            style={[
              styles.enhancedMarkerPointer,
              { borderTopColor: config.color },
            ]}
          />

          {/* Shadow under pointer */}
          <View style={styles.markerShadow} />
        </Animated.View>

        {/* Label tooltip */}
        {(showLabel || isSelected) && (
          <Animated.View
            style={[
              styles.markerLabel,
              {
                opacity: bounceAnim,
                transform: [
                  {
                    translateY: bounceAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.markerLabelText} numberOfLines={1}>
              {mission.customerName}
            </Text>
            {mission.status === 'inProgress' && (
              <View style={styles.activeIndicator}>
                <MaterialIcons
                  name="directions-car"
                  size={10}
                  color="#F59E0B"
                />
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </MarkerView>
  );
}

// Start/End point markers
export function RouteEndpointMarker({
  coordinate,
  type,
  label,
  onPress,
}: {
  coordinate: [number, number];
  type: 'start' | 'end';
  label?: string;
  onPress?: () => void;
}) {
  const bounceAnim = useBounceAnimation();
  const isStart = type === 'start';
  const color = isStart ? '#22C55E' : '#EF4444';
  const icon = isStart ? 'play-arrow' : 'flag';

  return (
    <MarkerView
      id={`endpoint-${type}`}
      coordinate={coordinate}
      allowOverlap
      allowOverlapWithPuck
    >
      <View style={styles.endpointWrapper} onTouchEnd={onPress}>
        <Animated.View
          style={[
            styles.endpointContainer,
            {
              transform: [
                {
                  scale: bounceAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.endpointBody, { backgroundColor: color }]}>
            <MaterialIcons name={icon} size={20} color="#fff" />
          </View>
          <View style={[styles.endpointPointer, { borderTopColor: color }]} />
        </Animated.View>

        {label && (
          <Animated.View
            style={[
              styles.endpointLabel,
              { backgroundColor: color, opacity: bounceAnim },
            ]}
          >
            <Text style={styles.endpointLabelText}>{label}</Text>
          </Animated.View>
        )}
      </View>
    </MarkerView>
  );
}

const styles = StyleSheet.create({
  // Pulse ring
  pulseRing: {
    position: 'absolute',
  },

  // Enhanced marker
  enhancedMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
  },
  enhancedMarkerContainer: {
    alignItems: 'center',
  },
  enhancedMarkerBody: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  enhancedMarkerPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -4,
  },
  markerShadow: {
    width: 20,
    height: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: 2,
  },
  markerOrderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  markerLabel: {
    position: 'absolute',
    top: -35,
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerLabelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  activeIndicator: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 2,
  },

  // Endpoint markers
  endpointWrapper: {
    alignItems: 'center',
  },
  endpointContainer: {
    alignItems: 'center',
  },
  endpointBody: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  endpointPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -4,
  },
  endpointLabel: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  endpointLabelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
});

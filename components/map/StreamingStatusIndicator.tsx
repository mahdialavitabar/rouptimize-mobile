import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useColorScheme } from 'react-native';

import { Text } from '@/components/ui/text';
import {
  type StreamingStatus,
  useSensorStreamingStatus,
} from '@/lib/sensor-streaming/SensorStreamingStatusContext';

const STATUS_CONFIG: Record<
  StreamingStatus,
  {
    icon: keyof typeof MaterialIcons.glyphMap;
    label: string;
    color: string;
    bgColor: string;
    darkBgColor: string;
    pulse: boolean;
  }
> = {
  live: {
    icon: 'sensors',
    label: 'LIVE',
    color: '#22C55E',
    bgColor: '#F0FDF4',
    darkBgColor: '#14532D',
    pulse: true,
  },
  error: {
    icon: 'sensors-off',
    label: 'PAUSED',
    color: '#EF4444',
    bgColor: '#FEF2F2',
    darkBgColor: '#7F1D1D',
    pulse: false,
  },
  off: {
    icon: 'sensors-off',
    label: 'OFF',
    color: '#9CA3AF',
    bgColor: '#F3F4F6',
    darkBgColor: '#374151',
    pulse: false,
  },
};

export function StreamingStatusIndicator() {
  const { status } = useSensorStreamingStatus();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const config = STATUS_CONFIG[status];

  useEffect(() => {
    if (config.pulse) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [config.pulse, pulseAnim]);

  // Don't show anything when streaming is off
  if (status === 'off') {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? config.darkBgColor : config.bgColor,
          borderColor: config.color,
        },
      ]}
    >
      <Animated.View style={{ opacity: pulseAnim }}>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
      </Animated.View>
      <MaterialIcons
        name={config.icon}
        size={14}
        color={config.color}
        style={styles.icon}
      />
      <Text style={[styles.label, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  icon: {
    marginLeft: -1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

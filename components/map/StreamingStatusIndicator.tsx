import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
    bgLight: string;
    bgDark: string;
    borderLight: string;
    borderDark: string;
    pulse: boolean;
  }
> = {
  live: {
    icon: 'sensors',
    label: 'LIVE',
    color: '#34A853',
    bgLight: 'rgba(255, 255, 255, 0.97)',
    bgDark: 'rgba(17, 24, 39, 0.95)',
    borderLight: 'rgba(52, 168, 83, 0.3)',
    borderDark: 'rgba(52, 168, 83, 0.4)',
    pulse: true,
  },
  draining: {
    icon: 'sync',
    label: 'SYNC',
    color: '#FBBC04',
    bgLight: 'rgba(255, 255, 255, 0.97)',
    bgDark: 'rgba(17, 24, 39, 0.95)',
    borderLight: 'rgba(251, 188, 4, 0.3)',
    borderDark: 'rgba(251, 188, 4, 0.4)',
    pulse: true,
  },
  error: {
    icon: 'sensors-off',
    label: 'PAUSED',
    color: '#EA4335',
    bgLight: 'rgba(255, 255, 255, 0.97)',
    bgDark: 'rgba(17, 24, 39, 0.95)',
    borderLight: 'rgba(234, 67, 53, 0.3)',
    borderDark: 'rgba(234, 67, 53, 0.4)',
    pulse: false,
  },
  off: {
    icon: 'sensors-off',
    label: 'OFF',
    color: '#9CA3AF',
    bgLight: 'rgba(255, 255, 255, 0.97)',
    bgDark: 'rgba(17, 24, 39, 0.95)',
    borderLight: 'rgba(156, 163, 175, 0.3)',
    borderDark: 'rgba(156, 163, 175, 0.3)',
    pulse: false,
  },
};

function formatRate(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function formatLatency(ms: number): string {
  if (ms <= 0) return '–';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function latencyColor(ms: number): string {
  if (ms <= 0) return '#9CA3AF';
  if (ms < 200) return '#34A853'; // green – excellent
  if (ms < 500) return '#FBBC04'; // yellow – acceptable
  return '#EA4335'; // red – high
}

export function StreamingStatusIndicator() {
  const { status, throughput, consecutiveFailures } =
    useSensorStreamingStatus();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dotScaleAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const config = STATUS_CONFIG[status];

  // Pulsing dot animation for live / draining status
  useEffect(() => {
    if (config.pulse) {
      const dotPulse = Animated.loop(
        Animated.sequence([
          Animated.timing(dotScaleAnim, {
            toValue: 1.6,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(dotScaleAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );

      const opacityPulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );

      dotPulse.start();
      opacityPulse.start();

      return () => {
        dotPulse.stop();
        opacityPulse.stop();
      };
    } else {
      pulseAnim.setValue(1);
      dotScaleAnim.setValue(1);
    }
  }, [config.pulse, pulseAnim, dotScaleAnim]);

  // Spin animation for draining/sync icon
  useEffect(() => {
    if (status === 'draining') {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      );
      spin.start();
      return () => spin.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [status, spinAnim]);

  // Don't show anything when streaming is off
  if (status === 'off') {
    return null;
  }

  const hasActivity = throughput.readingsPerSecond > 0;
  const showQueueBadge =
    throughput.hasPendingQueue && throughput.queueDepth > 0;
  const showLatency =
    (status === 'live' || status === 'draining') && throughput.avgLatencyMs > 0;

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      style={[
        styles.container,
        {
          top: Math.max(insets.top, 12) + 4,
          backgroundColor: isDark ? config.bgDark : config.bgLight,
          borderColor: isDark ? config.borderDark : config.borderLight,
        },
      ]}
    >
      {/* Left: animated dot + status label */}
      <View style={styles.statusSection}>
        <View style={styles.dotContainer}>
          {/* Pulse ring behind the dot */}
          {config.pulse && (
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  backgroundColor: config.color,
                  opacity: pulseAnim,
                  transform: [{ scale: dotScaleAnim }],
                },
              ]}
            />
          )}
          <View style={[styles.dot, { backgroundColor: config.color }]} />
        </View>

        {status === 'draining' ? (
          <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
            <MaterialIcons
              name={config.icon}
              size={13}
              color={config.color}
              style={styles.statusIcon}
            />
          </Animated.View>
        ) : (
          <MaterialIcons
            name={config.icon}
            size={13}
            color={config.color}
            style={styles.statusIcon}
          />
        )}
        <Text style={[styles.statusLabel, { color: config.color }]}>
          {config.label}
        </Text>
      </View>

      {/* Right: throughput stats (only when live/draining and has activity) */}
      {(status === 'live' || status === 'draining') && hasActivity && (
        <>
          <View
            style={[
              styles.separator,
              { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
            ]}
          />
          <View style={styles.throughputSection}>
            {/* Readings collected rate */}
            <View style={styles.rateBadge}>
              <MaterialIcons
                name="arrow-downward"
                size={9}
                color="#34A853"
              />
              <Text
                style={[
                  styles.rateValue,
                  { color: isDark ? '#D1D5DB' : '#5F6368' },
                ]}
              >
                {formatRate(throughput.readingsPerSecond)}
              </Text>
            </View>

            {/* Batches sent rate */}
            <View style={styles.rateBadge}>
              <MaterialIcons
                name="arrow-upward"
                size={9}
                color="#F97316"
              />
              <Text
                style={[
                  styles.rateValue,
                  { color: isDark ? '#D1D5DB' : '#5F6368' },
                ]}
              >
                {formatRate(throughput.batchesSentPerSecond)}
              </Text>
            </View>

            <Text
              style={[
                styles.rateUnit,
                { color: isDark ? '#6B7280' : '#9CA3AF' },
              ]}
            >
              /s
            </Text>
          </View>
        </>
      )}

      {/* Latency indicator */}
      {showLatency && (
        <>
          <View
            style={[
              styles.separator,
              { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
            ]}
          />
          <View style={styles.rateBadge}>
            <MaterialIcons
              name="speed"
              size={9}
              color={latencyColor(throughput.avgLatencyMs)}
            />
            <Text
              style={[
                styles.rateValue,
                { color: latencyColor(throughput.avgLatencyMs) },
              ]}
            >
              {formatLatency(throughput.avgLatencyMs)}
            </Text>
          </View>
        </>
      )}

      {/* Queue depth badge (when batches are pending in SQLite) */}
      {showQueueBadge && (
        <>
          <View
            style={[
              styles.separator,
              { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
            ]}
          />
          <View style={styles.queueBadge}>
            <MaterialIcons name="schedule" size={9} color="#FBBC04" />
            <Text style={styles.queueText}>
              {throughput.queueDepth > 999
                ? `${(throughput.queueDepth / 1000).toFixed(1)}k`
                : throughput.queueDepth}
            </Text>
          </View>
        </>
      )}

      {/* Show failure count when in error state */}
      {status === 'error' && consecutiveFailures > 0 && (
        <>
          <View
            style={[
              styles.separator,
              { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
            ]}
          />
          <View style={styles.errorSection}>
            <MaterialIcons name="warning" size={11} color="#EA4335" />
            <Text style={styles.errorText}>
              {consecutiveFailures} fail{consecutiveFailures !== 1 ? 's' : ''}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12, // overridden dynamically with safe area inset
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotContainer: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    zIndex: 1,
  },
  statusIcon: {
    marginLeft: 1,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  separator: {
    width: 1,
    height: 14,
    marginHorizontal: 8,
  },
  throughputSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  rateValue: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rateUnit: {
    fontSize: 9,
    fontWeight: '500',
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  queueText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#FBBC04',
  },
  errorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  errorText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#EA4335',
  },
});

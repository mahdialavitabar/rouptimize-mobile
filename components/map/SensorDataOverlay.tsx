import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useRef, useState } from 'react';
import {
    Animated,
    StyleSheet,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Text } from '@/components/ui/text';
import {
    type SensorThroughput,
    useSensorStreamingStatus,
} from '@/lib/sensor-streaming/SensorStreamingStatusContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function ThroughputRow({
  icon,
  label,
  value,
  unit,
  color,
  isDark,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  unit: string;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon} size={14} color={color} />
      </View>
      <Text
        style={[styles.statLabel, { color: isDark ? '#9CA3AF' : '#6B7280' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.statValueContainer}>
        <Text
          style={[
            styles.statValue,
            { color: isDark ? '#F3F4F6' : '#1F2937' },
          ]}
        >
          {value}
        </Text>
        <Text
          style={[styles.statUnit, { color: isDark ? '#6B7280' : '#9CA3AF' }]}
        >
          {unit}
        </Text>
      </View>
    </View>
  );
}

function SensorBreakdown({
  throughput,
  isDark,
}: {
  throughput: SensorThroughput;
  isDark: boolean;
}) {
  const { readingsByType } = throughput;
  const total = readingsByType.accel + readingsByType.gyro + readingsByType.location;
  const accelPct = total > 0 ? (readingsByType.accel / total) * 100 : 0;
  const gyroPct = total > 0 ? (readingsByType.gyro / total) * 100 : 0;
  const locPct = total > 0 ? (readingsByType.location / total) * 100 : 0;

  return (
    <View style={styles.breakdownContainer}>
      <Text
        style={[
          styles.breakdownTitle,
          { color: isDark ? '#9CA3AF' : '#6B7280' },
        ]}
      >
        SENSOR BREAKDOWN
      </Text>
      <View style={styles.breakdownBarContainer}>
        <View
          style={[
            styles.breakdownBarSegment,
            {
              flex: accelPct || 1,
              backgroundColor: '#3B82F6',
              borderTopLeftRadius: 4,
              borderBottomLeftRadius: 4,
            },
          ]}
        />
        <View
          style={[
            styles.breakdownBarSegment,
            { flex: gyroPct || 1, backgroundColor: '#8B5CF6' },
          ]}
        />
        <View
          style={[
            styles.breakdownBarSegment,
            {
              flex: locPct || 1,
              backgroundColor: '#10B981',
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
            },
          ]}
        />
      </View>
      <View style={styles.breakdownLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
          <Text
            style={[
              styles.legendText,
              { color: isDark ? '#9CA3AF' : '#6B7280' },
            ]}
          >
            Accel {readingsByType.accel}/s
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
          <Text
            style={[
              styles.legendText,
              { color: isDark ? '#9CA3AF' : '#6B7280' },
            ]}
          >
            Gyro {readingsByType.gyro}/s
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text
            style={[
              styles.legendText,
              { color: isDark ? '#9CA3AF' : '#6B7280' },
            ]}
          >
            GPS {readingsByType.location}/s
          </Text>
        </View>
      </View>
    </View>
  );
}

export function SensorDataOverlay() {
  const { status, throughput } = useSensorStreamingStatus();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggleExpanded = useCallback(() => {
    const toValue = isExpanded ? 0 : 1;
    setIsExpanded(!isExpanded);
    Animated.spring(expandAnim, {
      toValue,
      friction: 8,
      tension: 100,
      useNativeDriver: false,
    }).start();
  }, [isExpanded, expandAnim]);

  // Don't render when streaming is off
  if (status === 'off') {
    return null;
  }

  const bgColor = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.97)';
  const borderColor = isDark ? 'rgba(55, 65, 81, 0.6)' : 'rgba(229, 231, 235, 0.8)';

  const expandedHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 190],
  });

  const chevronRotation = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor,
        },
      ]}
    >
      {/* Compact Header - Always Visible */}
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          {/* Live throughput pill */}
          <View
            style={[
              styles.ratePill,
              {
                backgroundColor:
                  status === 'live' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              },
            ]}
          >
            <MaterialIcons
              name="arrow-upward"
              size={11}
              color={status === 'live' ? '#22C55E' : '#EF4444'}
            />
            <Text
              style={[
                styles.rateText,
                { color: status === 'live' ? '#22C55E' : '#EF4444' },
              ]}
            >
              {throughput.readingsPerSecond}/s
            </Text>
          </View>
          <View
            style={[
              styles.ratePill,
              { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
            ]}
          >
            <MaterialIcons name="cloud-upload" size={11} color="#3B82F6" />
            <Text style={[styles.rateText, { color: '#3B82F6' }]}>
              {throughput.batchesSentPerSecond}/s
            </Text>
          </View>
        </View>

        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <MaterialIcons
            name="expand-more"
            size={20}
            color={isDark ? '#9CA3AF' : '#6B7280'}
          />
        </Animated.View>
      </TouchableOpacity>

      {/* Expandable Details */}
      <Animated.View
        style={[styles.expandedContent, { height: expandedHeight }]}
      >
        <View style={styles.expandedInner}>
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
            ]}
          />

          <ThroughputRow
            icon="sensors"
            label="Readings collected"
            value={formatNumber(throughput.totalReadingsCollected)}
            unit="total"
            color="#8B5CF6"
            isDark={isDark}
          />
          <ThroughputRow
            icon="cloud-done"
            label="Batches sent"
            value={formatNumber(throughput.totalBatchesSent)}
            unit="total"
            color="#22C55E"
            isDark={isDark}
          />
          <ThroughputRow
            icon="data-usage"
            label="Data uploaded"
            value={formatBytes(throughput.estimatedBytesSent)}
            unit=""
            color="#3B82F6"
            isDark={isDark}
          />
          {throughput.totalBatchesFailed > 0 && (
            <ThroughputRow
              icon="error-outline"
              label="Failed batches"
              value={formatNumber(throughput.totalBatchesFailed)}
              unit="total"
              color="#EF4444"
              isDark={isDark}
            />
          )}

          <SensorBreakdown throughput={throughput} isDark={isDark} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 58,
    left: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 170,
    maxWidth: 220,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  rateText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  expandedContent: {
    overflow: 'hidden',
  },
  expandedInner: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 6,
  },
  divider: {
    height: 1,
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 11,
    flex: 1,
  },
  statValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontSize: 9,
    fontWeight: '500',
  },
  breakdownContainer: {
    marginTop: 4,
  },
  breakdownTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  breakdownBarContainer: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 1,
  },
  breakdownBarSegment: {
    minWidth: 4,
  },
  breakdownLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});

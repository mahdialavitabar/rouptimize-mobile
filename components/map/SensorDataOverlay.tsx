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

function formatLatency(ms: number): string {
  if (ms <= 0) return '–';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRate(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function latencyColor(ms: number): string {
  if (ms <= 0) return '#9CA3AF';
  if (ms < 200) return '#22C55E';
  if (ms < 500) return '#FBBC04';
  return '#EF4444';
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
        {unit ? (
          <Text
            style={[styles.statUnit, { color: isDark ? '#6B7280' : '#9CA3AF' }]}
          >
            {unit}
          </Text>
        ) : null}
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

function LatencyBar({
  throughput,
  isDark,
}: {
  throughput: SensorThroughput;
  isDark: boolean;
}) {
  const { avgLatencyMs, minLatencyMs, maxLatencyMs, p95LatencyMs } = throughput;
  if (avgLatencyMs <= 0) return null;

  const avgColor = latencyColor(avgLatencyMs);
  const p95Color = latencyColor(p95LatencyMs);

  return (
    <View style={styles.latencyContainer}>
      <Text
        style={[
          styles.breakdownTitle,
          { color: isDark ? '#9CA3AF' : '#6B7280' },
        ]}
      >
        LATENCY
      </Text>
      <View style={styles.latencyRow}>
        <View style={styles.latencyItem}>
          <Text
            style={[
              styles.latencyLabel,
              { color: isDark ? '#6B7280' : '#9CA3AF' },
            ]}
          >
            avg
          </Text>
          <Text style={[styles.latencyValue, { color: avgColor }]}>
            {formatLatency(avgLatencyMs)}
          </Text>
        </View>
        <View style={styles.latencyDivider} />
        <View style={styles.latencyItem}>
          <Text
            style={[
              styles.latencyLabel,
              { color: isDark ? '#6B7280' : '#9CA3AF' },
            ]}
          >
            min
          </Text>
          <Text
            style={[
              styles.latencyValue,
              { color: latencyColor(minLatencyMs) },
            ]}
          >
            {formatLatency(minLatencyMs)}
          </Text>
        </View>
        <View style={styles.latencyDivider} />
        <View style={styles.latencyItem}>
          <Text
            style={[
              styles.latencyLabel,
              { color: isDark ? '#6B7280' : '#9CA3AF' },
            ]}
          >
            p95
          </Text>
          <Text style={[styles.latencyValue, { color: p95Color }]}>
            {formatLatency(p95LatencyMs)}
          </Text>
        </View>
        <View style={styles.latencyDivider} />
        <View style={styles.latencyItem}>
          <Text
            style={[
              styles.latencyLabel,
              { color: isDark ? '#6B7280' : '#9CA3AF' },
            ]}
          >
            max
          </Text>
          <Text
            style={[
              styles.latencyValue,
              { color: latencyColor(maxLatencyMs) },
            ]}
          >
            {formatLatency(maxLatencyMs)}
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

  const hasLatency = throughput.avgLatencyMs > 0;
  const hasQueueDepth = throughput.hasPendingQueue;

  // Dynamically compute expanded height based on content
  let expandedHeight = 150; // base height for core stats
  if (hasLatency) expandedHeight += 58; // latency section
  if (hasQueueDepth) expandedHeight += 28; // queue depth row
  if (throughput.totalBatchesFailed > 0) expandedHeight += 28; // failed row
  if (throughput.bytesPerSecond > 0) expandedHeight += 28; // throughput rate row
  expandedHeight += 60; // sensor breakdown

  const expandedHeightInterp = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, expandedHeight],
  });

  const chevronRotation = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const rateColor =
    status === 'live'
      ? '#22C55E'
      : status === 'draining'
        ? '#FBBC04'
        : '#EF4444';

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
                backgroundColor: rateColor + '26',
              },
            ]}
          >
            <MaterialIcons
              name="arrow-upward"
              size={11}
              color={rateColor}
            />
            <Text
              style={[
                styles.rateText,
                { color: rateColor },
              ]}
            >
              {formatRate(throughput.readingsPerSecond)}/s
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
              {formatRate(throughput.batchesSentPerSecond)}/s
            </Text>
          </View>

          {/* Inline queue depth badge (compact header) */}
          {hasQueueDepth && (
            <View
              style={[
                styles.ratePill,
                { backgroundColor: 'rgba(251, 188, 4, 0.15)' },
              ]}
            >
              <MaterialIcons name="schedule" size={11} color="#FBBC04" />
              <Text style={[styles.rateText, { color: '#FBBC04' }]}>
                {throughput.queueDepth > 999
                  ? `${(throughput.queueDepth / 1000).toFixed(1)}k`
                  : throughput.queueDepth}
              </Text>
            </View>
          )}
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
        style={[styles.expandedContent, { height: expandedHeightInterp }]}
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

          {/* Data throughput rate */}
          {throughput.bytesPerSecond > 0 && (
            <ThroughputRow
              icon="speed"
              label="Throughput"
              value={formatBytes(throughput.bytesPerSecond)}
              unit="/s"
              color="#06B6D4"
              isDark={isDark}
            />
          )}

          {/* Queue depth (pending batches in SQLite) */}
          {hasQueueDepth && (
            <ThroughputRow
              icon="schedule"
              label="Queued (offline)"
              value={formatNumber(throughput.queueDepth)}
              unit="batches"
              color="#FBBC04"
              isDark={isDark}
            />
          )}

          {/* Failed batches */}
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

          {/* Latency breakdown */}
          <LatencyBar throughput={throughput} isDark={isDark} />

          {/* Sensor type breakdown */}
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
    maxWidth: 240,
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
    flexWrap: 'wrap',
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
  latencyContainer: {
    marginTop: 4,
  },
  latencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  latencyItem: {
    alignItems: 'center',
    flex: 1,
  },
  latencyLabel: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  latencyValue: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  latencyDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
  },
});

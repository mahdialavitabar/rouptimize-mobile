import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Modal,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Text } from '@/components/ui/text';

export type MapStyleId =
  | 'streets'
  | 'satellite'
  | 'satellite-streets'
  | 'light'
  | 'dark'
  | 'outdoors'
  | 'navigation-day'
  | 'navigation-night'
  | 'traffic';

export interface MapStyleOption {
  id: MapStyleId;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  styleURL: string;
  description: string;
  category: 'map' | 'satellite' | 'special';
}

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'streets',
    label: 'Default',
    icon: 'map',
    styleURL: 'mapbox://styles/mapbox/streets-v12',
    description: 'Standard street map',
    category: 'map',
  },
  {
    id: 'light',
    label: 'Light',
    icon: 'wb-sunny',
    styleURL: 'mapbox://styles/mapbox/light-v11',
    description: 'Clean minimal style',
    category: 'map',
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: 'dark-mode',
    styleURL: 'mapbox://styles/mapbox/dark-v11',
    description: 'Dark theme map',
    category: 'map',
  },
  {
    id: 'outdoors',
    label: 'Terrain',
    icon: 'terrain',
    styleURL: 'mapbox://styles/mapbox/outdoors-v12',
    description: 'Topographic details',
    category: 'map',
  },
  {
    id: 'satellite',
    label: 'Satellite',
    icon: 'satellite',
    styleURL: 'mapbox://styles/mapbox/satellite-v9',
    description: 'Aerial imagery',
    category: 'satellite',
  },
  {
    id: 'satellite-streets',
    label: 'Hybrid',
    icon: 'satellite-alt',
    styleURL: 'mapbox://styles/mapbox/satellite-streets-v12',
    description: 'Satellite with labels',
    category: 'satellite',
  },
  {
    id: 'navigation-day',
    label: 'Navigation',
    icon: 'navigation',
    styleURL: 'mapbox://styles/mapbox/navigation-day-v1',
    description: 'Optimized for driving',
    category: 'special',
  },
  {
    id: 'navigation-night',
    label: 'Night Nav',
    icon: 'nightlight-round',
    styleURL: 'mapbox://styles/mapbox/navigation-night-v1',
    description: 'Night driving mode',
    category: 'special',
  },
  {
    id: 'traffic',
    label: 'Traffic',
    icon: 'traffic',
    styleURL: 'mapbox://styles/mapbox/navigation-day-v1',
    description: 'Live traffic overlay',
    category: 'special',
  },
];

interface MapStyleSelectorProps {
  visible: boolean;
  selectedStyleId: MapStyleId;
  onSelectStyle: (style: MapStyleOption) => void;
  onClose: () => void;
  trafficEnabled?: boolean;
  onToggleTraffic?: () => void;
  threeDEnabled?: boolean;
  onToggle3D?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function StyleCard({
  style: mapStyle,
  isSelected,
  onPress,
  isDark,
}: {
  style: MapStyleOption;
  isSelected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
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
          styles.styleCard,
          {
            backgroundColor: isDark
              ? isSelected
                ? '#1E3A5F'
                : '#1F2937'
              : isSelected
                ? '#EFF6FF'
                : '#F9FAFB',
            borderColor: isSelected
              ? '#3B82F6'
              : isDark
                ? '#374151'
                : '#E5E7EB',
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View
          style={[
            styles.styleCardIcon,
            {
              backgroundColor: isSelected
                ? '#3B82F6'
                : isDark
                  ? '#374151'
                  : '#E5E7EB',
            },
          ]}
        >
          <MaterialIcons
            name={mapStyle.icon}
            size={22}
            color={isSelected ? '#fff' : isDark ? '#D1D5DB' : '#6B7280'}
          />
        </View>
        <Text
          style={[
            styles.styleCardLabel,
            {
              color: isSelected
                ? '#3B82F6'
                : isDark
                  ? '#E5E7EB'
                  : '#374151',
              fontWeight: isSelected ? '700' : '500',
            },
          ]}
          numberOfLines={1}
        >
          {mapStyle.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  isEnabled,
  onToggle,
  isDark,
  color,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  description: string;
  isEnabled: boolean;
  onToggle: () => void;
  isDark: boolean;
  color: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.toggleRow,
        {
          backgroundColor: isDark
            ? isEnabled
              ? 'rgba(59, 130, 246, 0.1)'
              : '#1F2937'
            : isEnabled
              ? 'rgba(59, 130, 246, 0.06)'
              : '#F9FAFB',
          borderColor: isEnabled
            ? color
            : isDark
              ? '#374151'
              : '#E5E7EB',
        },
      ]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.toggleIconContainer,
          { backgroundColor: isEnabled ? color + '20' : isDark ? '#374151' : '#E5E7EB' },
        ]}
      >
        <MaterialIcons
          name={icon}
          size={18}
          color={isEnabled ? color : isDark ? '#9CA3AF' : '#6B7280'}
        />
      </View>
      <View style={styles.toggleTextContainer}>
        <Text
          style={[
            styles.toggleLabel,
            {
              color: isEnabled
                ? color
                : isDark
                  ? '#E5E7EB'
                  : '#374151',
            },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.toggleDescription,
            { color: isDark ? '#6B7280' : '#9CA3AF' },
          ]}
        >
          {description}
        </Text>
      </View>
      <View
        style={[
          styles.toggleSwitch,
          {
            backgroundColor: isEnabled
              ? color
              : isDark
                ? '#4B5563'
                : '#D1D5DB',
          },
        ]}
      >
        <Animated.View
          style={[
            styles.toggleKnob,
            {
              transform: [{ translateX: isEnabled ? 16 : 2 }],
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

export function MapStyleSelector({
  visible,
  selectedStyleId,
  onSelectStyle,
  onClose,
  trafficEnabled = false,
  onToggleTraffic,
  threeDEnabled = false,
  onToggle3D,
}: MapStyleSelectorProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 9,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [slideAnim, backdropAnim, onClose]);

  if (!visible) {
    return null;
  }

  const mapStyles = MAP_STYLES.filter((s) => s.category === 'map');
  const satelliteStyles = MAP_STYLES.filter((s) => s.category === 'satellite');
  const specialStyles = MAP_STYLES.filter((s) => s.category === 'special');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={animateOut}
      onShow={animateIn}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={animateOut}
        >
          <Animated.View
            style={[styles.backdrop, { opacity: backdropAnim }]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? '#111827' : '#FFFFFF',
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Handle bar */}
          <View style={styles.handleBarContainer}>
            <View
              style={[
                styles.handleBar,
                { backgroundColor: isDark ? '#4B5563' : '#D1D5DB' },
              ]}
            />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text
              style={[
                styles.sheetTitle,
                { color: isDark ? '#F3F4F6' : '#111827' },
              ]}
            >
              Map Type
            </Text>
            <TouchableOpacity
              style={[
                styles.closeButton,
                { backgroundColor: isDark ? '#374151' : '#F3F4F6' },
              ]}
              onPress={animateOut}
            >
              <MaterialIcons
                name="close"
                size={18}
                color={isDark ? '#D1D5DB' : '#6B7280'}
              />
            </TouchableOpacity>
          </View>

          {/* Map type section */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#9CA3AF' : '#6B7280' },
              ]}
            >
              MAP VIEW
            </Text>
            <View style={styles.styleGrid}>
              {mapStyles.map((s) => (
                <StyleCard
                  key={s.id}
                  style={s}
                  isSelected={selectedStyleId === s.id}
                  onPress={() => onSelectStyle(s)}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>

          {/* Satellite section */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#9CA3AF' : '#6B7280' },
              ]}
            >
              SATELLITE
            </Text>
            <View style={styles.styleGrid}>
              {satelliteStyles.map((s) => (
                <StyleCard
                  key={s.id}
                  style={s}
                  isSelected={selectedStyleId === s.id}
                  onPress={() => onSelectStyle(s)}
                  isDark={isDark}
                />
              ))}
              {specialStyles.map((s) => (
                <StyleCard
                  key={s.id}
                  style={s}
                  isSelected={selectedStyleId === s.id}
                  onPress={() => onSelectStyle(s)}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>

          {/* Toggles section */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#9CA3AF' : '#6B7280' },
              ]}
            >
              MAP DETAILS
            </Text>
            <View style={styles.togglesContainer}>
              {onToggleTraffic && (
                <ToggleRow
                  icon="traffic"
                  label="Traffic"
                  description="Show live traffic conditions"
                  isEnabled={trafficEnabled}
                  onToggle={onToggleTraffic}
                  isDark={isDark}
                  color="#EF4444"
                />
              )}
              {onToggle3D && (
                <ToggleRow
                  icon="view-in-ar"
                  label="3D Buildings"
                  description="Show 3D building extrusions"
                  isEnabled={threeDEnabled}
                  onToggle={onToggle3D}
                  isDark={isDark}
                  color="#8B5CF6"
                />
              )}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  handleBarContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  styleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  styleCard: {
    width: (SCREEN_WIDTH - 40 - 30) / 4,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  styleCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  styleCardLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  togglesContainer: {
    gap: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  toggleIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleDescription: {
    fontSize: 11,
    marginTop: 1,
  },
  toggleSwitch: {
    width: 36,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});

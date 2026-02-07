import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer';
import { useTheme } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// App icon
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appIcon = require('@/assets/images/icon.png');

type DrawerItemProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  description?: string;
  route: string;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
  badge?: number;
};

function DrawerItem({
  icon,
  label,
  description,
  isActive,
  onPress,
  isDark,
  badge,
}: DrawerItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.drawerItem,
        isActive && (isDark ? styles.activeItemDark : styles.activeItem),
      ]}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconWrapper,
          isActive && styles.iconWrapperActive,
          isDark && !isActive && styles.iconWrapperDark,
        ]}
      >
        <MaterialIcons
          name={icon}
          size={20}
          color={isActive ? '#fff' : isDark ? '#9CA3AF' : '#6B7280'}
        />
      </View>
      <View style={styles.labelContainer}>
        <Text
          style={[
            styles.drawerLabel,
            isDark && styles.drawerLabelDark,
            isActive && styles.activeLabelText,
          ]}
        >
          {label}
        </Text>
        {description && (
          <Text style={styles.itemDescription}>{description}</Text>
        )}
      </View>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <MaterialIcons
        name="chevron-right"
        size={18}
        color={isDark ? '#4B5563' : '#D1D5DB'}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
}

function DrawerSectionHeader({
  title,
  isDark,
}: {
  title: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionLine, isDark && styles.sectionLineDark]} />
      <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
        {title}
      </Text>
      <View style={[styles.sectionLine, isDark && styles.sectionLineDark]} />
    </View>
  );
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const navigateTo = (route: string) => {
    router.push(route as any);
    props.navigation.closeDrawer();
  };

  const isActive = (route: string) => {
    if (route === '/(drawer)/(tabs)/(home)' || route === '/') {
      return (
        pathname === '/' || pathname === '/(home)' || pathname === '/index'
      );
    }
    return pathname.includes(route.replace('/(drawer)/(tabs)', ''));
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Gradient Header */}
      <LinearGradient
        colors={isDark ? ['#1E3A5F', '#1F2937'] : ['#3B82F6', '#1D4ED8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerContent}>
          <View style={styles.logoWrapper}>
            <Image
              source={appIcon}
              style={styles.logo}
              contentFit="contain"
              transition={200}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.appName}>Rouptimize</Text>
            <Text style={styles.appTagline}>Smart Route Optimization</Text>
          </View>
        </View>
        {/* Decorative circles */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
      </LinearGradient>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickAction, isDark && styles.quickActionDark]}
            onPress={() => navigateTo('/(drawer)/(tabs)/(home)')}
          >
            <MaterialIcons name="dashboard" size={20} color="#3B82F6" />
            <Text
              style={[
                styles.quickActionText,
                isDark && styles.quickActionTextDark,
              ]}
            >
              Dashboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, isDark && styles.quickActionDark]}
            onPress={() => navigateTo('/(drawer)/(tabs)/tracking')}
          >
            <MaterialIcons name="my-location" size={20} color="#10B981" />
            <Text
              style={[
                styles.quickActionText,
                isDark && styles.quickActionTextDark,
              ]}
            >
              Track Now
            </Text>
          </TouchableOpacity>
        </View>

        {/* Navigation Items */}
        <DrawerSectionHeader title="Navigation" isDark={isDark} />
        <DrawerItem
          icon="home"
          label="Home"
          description="Dashboard overview"
          route="/(drawer)/(tabs)/(home)"
          isActive={isActive('/(drawer)/(tabs)/(home)')}
          onPress={() => navigateTo('/(drawer)/(tabs)/(home)')}
          isDark={isDark}
        />

        <DrawerSectionHeader title="Deliveries" isDark={isDark} />
        <DrawerItem
          icon="assignment"
          label="My Missions"
          description="View assigned tasks"
          route="/(drawer)/(tabs)/missions"
          isActive={isActive('/missions')}
          onPress={() => navigateTo('/(drawer)/(tabs)/missions')}
          isDark={isDark}
        />
        <DrawerItem
          icon="route"
          label="My Routes"
          description="Optimized routes"
          route="/(drawer)/(tabs)/routes"
          isActive={isActive('/routes')}
          onPress={() => navigateTo('/(drawer)/(tabs)/routes')}
          isDark={isDark}
        />

        <DrawerSectionHeader title="Tools" isDark={isDark} />
        <DrawerItem
          icon="location-on"
          label="Live Tracking"
          description="Real-time location"
          route="/(drawer)/(tabs)/tracking"
          isActive={isActive('/tracking')}
          onPress={() => navigateTo('/(drawer)/(tabs)/tracking')}
          isDark={isDark}
        />

        <DrawerSectionHeader title="Account" isDark={isDark} />
        <DrawerItem
          icon="person"
          label="Profile"
          description="Manage your account"
          route="/(drawer)/(tabs)/profile"
          isActive={isActive('/profile')}
          onPress={() => navigateTo('/(drawer)/(tabs)/profile')}
          isDark={isDark}
        />
      </DrawerContentScrollView>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          isDark && styles.footerDark,
          { paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.footerContent}>
          <MaterialIcons
            name="verified"
            size={14}
            color="#10B981"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
        <Text style={styles.copyright}>© 2026 Rouptimize</Text>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  const { colors } = useTheme();
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerStyle: {
            backgroundColor: colorScheme === 'dark' ? '#1F2937' : '#fff',
            width: 300,
          },
          overlayColor: 'rgba(0,0,0,0.6)',
        }}
      >
        <Drawer.Screen
          name="(tabs)"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  containerDark: {
    backgroundColor: '#111827',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  logoWrapper: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  headerText: {
    marginLeft: 14,
    flex: 1,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    fontWeight: '500',
  },
  decorCircle1: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -30,
    right: -30,
  },
  decorCircle2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -20,
    left: 40,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 16,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionDark: {
    backgroundColor: '#1F2937',
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  quickActionTextDark: {
    color: '#D1D5DB',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    gap: 10,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  sectionLineDark: {
    backgroundColor: '#374151',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitleDark: {
    color: '#6B7280',
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 2,
    backgroundColor: 'transparent',
  },
  activeItem: {
    backgroundColor: '#EFF6FF',
  },
  activeItemDark: {
    backgroundColor: '#1E3A5F',
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapperDark: {
    backgroundColor: '#374151',
  },
  iconWrapperActive: {
    backgroundColor: '#3B82F6',
  },
  labelContainer: {
    flex: 1,
    marginLeft: 12,
  },
  drawerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  drawerLabelDark: {
    color: '#E5E7EB',
  },
  activeLabelText: {
    color: '#1D4ED8',
  },
  itemDescription: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  badge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  chevron: {
    opacity: 0.5,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  footerDark: {
    borderTopColor: '#374151',
    backgroundColor: '#111827',
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  version: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  copyright: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
});

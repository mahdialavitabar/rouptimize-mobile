import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR } from '@/lib/colors';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  // Use the actual bottom safe area inset (home indicator) instead of hardcoded Platform values
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? TAB_BAR.activeTintDark : TAB_BAR.activeTintLight,
        tabBarInactiveTintColor: isDark ? TAB_BAR.inactiveTintDark : TAB_BAR.inactiveTintLight,
        tabBarStyle: {
          backgroundColor: isDark ? '#111827' : '#fff',
          borderTopColor: isDark ? '#1F2937' : '#F3F4F6',
          borderTopWidth: 1,
          height: 56 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
          elevation: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.3 : 0.06,
          shadowRadius: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.1,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name={focused ? 'home' : 'home'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          title: 'Missions',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name="assignment"
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name="route"
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: 'Tracking',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name={focused ? 'my-location' : 'location-on'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name={focused ? 'person' : 'person-outline'}
              size={focused ? 26 : 24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

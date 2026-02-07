import { DrawerToggleButton } from '@/lib/navigation/DrawerToggleButton';
import type {
  NativeStackHeaderBackProps,
  NativeStackHeaderItemProps,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

export function createStackScreenOptions(): NativeStackNavigationOptions {
  return {
    headerShown: true,

    headerBackVisible: true,
    headerBackButtonDisplayMode: 'minimal' as const,

    // UX:
    // - Root screens: show drawer toggle on the left.
    // - Nested (canGoBack): keep native back button on the left and put drawer toggle on the right.
    headerLeft: ({ canGoBack, tintColor }: NativeStackHeaderBackProps) =>
      canGoBack ? null : <DrawerToggleButton tintColor={tintColor} />,
    headerRight: ({ canGoBack, tintColor }: NativeStackHeaderItemProps) =>
      canGoBack ? <DrawerToggleButton tintColor={tintColor} /> : null,
  };
}

import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

export function createStackScreenOptions(): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerBackVisible: true,
    headerBackButtonDisplayMode: 'minimal' as const,
  };
}

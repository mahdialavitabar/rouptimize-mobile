import { createStackScreenOptions } from '@/lib/navigation/stackScreenOptions';
import { Stack } from 'expo-router';

export default function TrackingStackLayout() {
  return (
    <Stack screenOptions={createStackScreenOptions()}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Tracking',
          headerShown: false,
        }}
      />
    </Stack>
  );
}

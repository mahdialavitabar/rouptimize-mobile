import { createStackScreenOptions } from '@/lib/navigation/stackScreenOptions';
import { Stack } from 'expo-router';

export default function ProfileStackLayout() {
  return (
    <Stack screenOptions={createStackScreenOptions()}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Profile',
        }}
      />
    </Stack>
  );
}

import { createStackScreenOptions } from '@/lib/navigation/stackScreenOptions';
import { Stack } from 'expo-router';

export default function MissionsLayout() {
  return (
    <Stack screenOptions={createStackScreenOptions()}>
      <Stack.Screen
        name="index"
        options={{
          title: 'My Missions',
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Mission Details',
        }}
      />
    </Stack>
  );
}

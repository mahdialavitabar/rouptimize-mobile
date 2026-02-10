import { createStackScreenOptions } from '@/lib/navigation/stackScreenOptions';
import { Stack } from 'expo-router';

export default function RoutesLayout() {
  return (
    <Stack screenOptions={createStackScreenOptions()}>
      <Stack.Screen
        name="index"
        options={{
          title: 'My Routes',
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Route Map',
        }}
      />
    </Stack>
  );
}

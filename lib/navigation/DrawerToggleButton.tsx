import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  DrawerActions,
  useNavigation,
  useTheme,
} from '@react-navigation/native';
import { Pressable } from 'react-native';

type Props = {
  tintColor?: string;
};

export function DrawerToggleButton({ tintColor }: Props) {
  const navigation = useNavigation();
  const { colors } = useTheme();

  const color = tintColor ?? colors.text;

  const findDrawerNavigation = () => {
    let current: any = navigation;
    for (let i = 0; i < 8 && current; i += 1) {
      const state = current.getState?.();
      if (state?.type === 'drawer') return current;
      current = current.getParent?.();
    }
    return null;
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
      hitSlop={10}
      onPress={() => {
        const drawerNavigation = findDrawerNavigation();
        (drawerNavigation ?? navigation).dispatch(DrawerActions.toggleDrawer());
      }}
      style={{ paddingHorizontal: 8, paddingVertical: 8 }}
    >
      <MaterialIcons name="menu" size={24} color={color} />
    </Pressable>
  );
}

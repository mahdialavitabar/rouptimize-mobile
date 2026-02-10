import { Text } from '@/components/ui/text';
import { BRAND } from '@/lib/colors';
import { TouchableOpacity, useColorScheme } from 'react-native';

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

export function FilterChip({ label, isActive, onPress }: FilterChipProps) {
  const colorScheme = useColorScheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="mr-2 rounded-full px-4 py-2"
      style={{
        backgroundColor: isActive
          ? colorScheme === 'dark'
            ? BRAND.primaryLight
            : BRAND.primaryDark
          : colorScheme === 'dark'
            ? '#374151'
            : '#F3F4F6',
      }}
    >
      <Text
        className="text-sm font-medium"
        style={{
          color: isActive
            ? '#fff'
            : colorScheme === 'dark'
              ? '#D1D5DB'
              : '#4B5563',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

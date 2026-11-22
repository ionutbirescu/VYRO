import { Pressable, StyleSheet, Text } from 'react-native';

import { InterFonts, UI } from '@/constants/theme';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export function FilterChip({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && !active && styles.chipPressed]}>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: UI.surface,
    marginRight: 8,
  },
  chipActive: { backgroundColor: UI.text },
  chipPressed: { backgroundColor: UI.surfaceHi },
  label: { fontFamily: InterFonts.medium, fontSize: 14, color: UI.muted },
  labelActive: { color: UI.bg },
});

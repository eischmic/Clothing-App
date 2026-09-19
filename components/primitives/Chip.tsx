import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function Chip({ label, selected = false, onPress, accentWhenSelected = true, style }: {
  label: string; selected?: boolean; onPress?: () => void; accentWhenSelected?: boolean; style?: ViewStyle;
}) {
  const { base, accent, radii, spacing, type } = useTheme();
  const filled = selected && accentWhenSelected;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[{ borderRadius: radii.chip, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: selected ? accent.base : base.hairline, backgroundColor: filled ? accent.base : 'transparent' }, style]}>
    <Text style={[type.caption, { color: filled ? base.canvas : selected ? accent.bright : base.textMid }]}>{label}</Text>
  </Pressable>;
}

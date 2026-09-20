import React from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function Chip({
  label,
  selected = false,
  onPress,
  accentWhenSelected = true,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accentWhenSelected?: boolean;
  style?: ViewStyle;
}) {
  const { base, accent, radii, spacing, type } = useTheme();
  const filled = selected && accentWhenSelected;
  const chrome = {
    borderRadius: radii.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: selected ? accent.base : base.hairline,
    backgroundColor: filled ? accent.base : 'transparent',
  } as const;
  const labelStyle = [
    type.caption,
    { color: filled ? base.canvas : selected ? accent.bright : base.textMid },
  ];

  if (!onPress) {
    return (
      <View style={[chrome, style]} accessibilityRole="text">
        <Text style={labelStyle}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[chrome, style]}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

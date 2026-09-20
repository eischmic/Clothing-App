import React from 'react';
import { ActivityIndicator, Pressable, Text, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function PrimaryButton({ label, onPress, disabled = false, loading = false, variant = 'solid', style }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'solid' | 'ghost'; style?: ViewStyle;
}) {
  const { base, accent, radii, spacing, type } = useTheme();
  const solid = variant === 'solid';
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={label}
      style={[
        {
          minHeight: 48,
          opacity: disabled ? 0.55 : 1,
          borderRadius: radii.chip,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          borderWidth: solid ? 0 : 1,
          borderColor: disabled ? base.hairline : accent.dim,
          backgroundColor: disabled ? base.elev3 : solid ? accent.base : 'transparent',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={solid ? base.canvas : accent.base} />
      ) : (
        <Text
          style={[
            type.body,
            { fontWeight: '700', color: disabled ? base.textLow : solid ? base.canvas : accent.bright },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

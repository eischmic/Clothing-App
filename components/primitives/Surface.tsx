import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function Surface({ level = 1, padded = true, style, children }: {
  level?: 1 | 2 | 3; padded?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const { base, radii, spacing } = useTheme();
  const backgrounds = { 1: base.elev1, 2: base.elev2, 3: base.elev3 };
  return <View style={[{ backgroundColor: backgrounds[level], borderColor: base.hairline, borderWidth: 1, borderRadius: radii.card, padding: padded ? spacing.md : 0 }, style]}>{children}</View>;
}

import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Ellipse, Path } from 'react-native-svg';
import type { Category } from '@/lib/types';
import { GARMENT_PATHS, colorToHex } from '@/lib/garmentPaths';
import { useTheme } from '@/theme/useTheme';

export function GarmentArt({ category, color, size = 120 }: { category: Category; color: string; size?: number }) {
  const { base, accent, radii } = useTheme();
  return <View accessibilityRole="image" accessibilityLabel={`${color} ${category}`} style={{ width: size, height: size, borderRadius: radii.tile, overflow: 'hidden' }}><LinearGradient colors={[base.elev3, base.elev1]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Svg width={size * .86} height={size * .86} viewBox="0 0 100 100"><Ellipse cx="50" cy="90" rx="29" ry="5" fill={accent.glow} /><Path d={GARMENT_PATHS[category]} fill={colorToHex(color)} stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" /></Svg></LinearGradient></View>;
}

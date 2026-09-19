import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/useTheme';

export function ScoreRing({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const { base, accent, type } = useTheme();
  const stroke = 5; const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const safe = Math.max(0, Math.min(1, value));
  return <View accessibilityRole="image" accessibilityLabel={label ?? `${Math.round(safe * 100)} percent match`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}><Circle cx={size / 2} cy={size / 2} r={r} stroke={base.hairline} strokeWidth={stroke} fill="none" /><Circle cx={size / 2} cy={size / 2} r={r} stroke={accent.base} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - safe)} fill="none" /></Svg>
    <Text style={[type.caption, { color: base.textHi, fontWeight: '700' }]}>{Math.round(safe * 100)}%</Text>
  </View>;
}

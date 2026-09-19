import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function Slider({ value, onChange, leftLabel, rightLabel }: { value: number; onChange: (value: number) => void; leftLabel: string; rightLabel: string }) {
  const { base, accent, spacing, type } = useTheme(); const safe = Math.max(0, Math.min(1, value));
  return <View><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}><Text style={[type.caption, { color: base.textLow }]}>{leftLabel}</Text><Text style={[type.caption, { color: base.textLow }]}>{rightLabel}</Text></View><Pressable accessibilityRole="adjustable" accessibilityLabel={`${leftLabel} to ${rightLabel}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(safe * 100) }} onPress={(e) => onChange(Math.max(0, Math.min(1, e.nativeEvent.locationX / Math.max(1, e.nativeEvent.pageX || 1))))} style={{ height: 28, justifyContent: 'center' }}><View style={{ height: 4, borderRadius: 2, backgroundColor: base.hairline }}><View style={{ width: `${safe * 100}%`, height: 4, borderRadius: 2, backgroundColor: accent.base }} /></View><View style={{ position: 'absolute', left: `${safe * 100}%`, marginLeft: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: accent.bright, borderWidth: 3, borderColor: base.elev2 }} /></Pressable></View>;
}

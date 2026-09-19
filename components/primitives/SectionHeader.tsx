import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { base, accent, type, spacing } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm }}><Text style={[type.section, { color: base.textMid }]}>{title}</Text>{action ? <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={action}><Text style={[type.caption, { color: accent.bright }]}>{action}</Text></Pressable> : null}</View>;
}

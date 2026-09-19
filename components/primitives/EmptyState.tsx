import React from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { useTheme } from '@/theme/useTheme';

export function EmptyState({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  const { base, type, spacing } = useTheme();
  return <View style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm }}><Text style={[type.title, { color: base.textHi, textAlign: 'center' }]}>{title}</Text>{body ? <Text style={[type.body, { color: base.textMid, textAlign: 'center' }]}>{body}</Text> : null}{action && onAction ? <PrimaryButton label={action} onPress={onAction} variant="ghost" /> : null}</View>;
}

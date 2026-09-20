import React from 'react';
import { Text, View } from 'react-native';
import type { Gap } from '@/lib/gaps';
import { ProductCard } from '@/components/ProductCard';
import { Surface } from '@/components/primitives';
import { useTheme } from '@/theme/useTheme';

export function GapCard({
  gap,
  onPressSuggestion,
}: {
  gap: Gap;
  onPressSuggestion?: () => void;
}) {
  const { base, accent, spacing, type, radii } = useTheme();
  const confidencePct = Math.round(gap.confidence * 100);

  return (
    <Surface level={2} style={{ marginBottom: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <Text style={[type.body, { color: base.textHi, fontWeight: '700', flex: 1 }]}>{gap.title}</Text>
        <View
          accessibilityRole="text"
          accessibilityLabel={`${confidencePct} percent confidence`}
          style={{
            borderRadius: radii.chip,
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
            backgroundColor: accent.glow,
            borderWidth: 1,
            borderColor: accent.dim,
          }}
        >
          <Text style={[type.caption, { color: accent.bright }]}>{confidencePct}%</Text>
        </View>
      </View>
      <Text style={[type.caption, { color: base.textMid }]}>{gap.reasoning}</Text>
      {gap.suggestion ? (
        <>
          <ProductCard recommendation={gap.suggestion} onPress={onPressSuggestion} />
          {gap.newOutfits > 0 ? (
            <Text style={[type.body, { color: accent.bright, fontWeight: '700' }]}>
              +{gap.newOutfits} new outfits
            </Text>
          ) : null}
        </>
      ) : null}
    </Surface>
  );
}

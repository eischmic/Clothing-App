import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Recommendation } from '@/lib/types';
import { GarmentArt } from '@/components/GarmentArt';
import { ScoreRing, Surface } from '@/components/primitives';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { selectWishlistIds } from '@/store/selectors';

export function ProductCard({
  recommendation,
  onPress,
}: {
  recommendation: Recommendation;
  onPress?: () => void;
}) {
  const { product } = recommendation;
  const { base, accent, spacing, type } = useTheme();
  const saved = useAppStore((s) => selectWishlistIds(s).includes(product.id));
  const toggle = useAppStore((s) => s.toggleWishlist);

  return (
    <Surface level={2} style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${product.name}, ${product.brand}, ${Math.round(recommendation.total * 100)} percent match`}
          style={{ flex: 1, flexDirection: 'row', gap: spacing.sm }}
        >
          <GarmentArt category={product.category} color={product.color} size={82} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} style={[type.body, { color: base.textHi, fontWeight: '700' }]}>
              {product.name}
            </Text>
            <Text style={[type.caption, { color: base.textMid }]}>
              {product.brand} · ${product.price}
            </Text>
            {recommendation.reasons.slice(0, 2).map((reason) => (
              <Text key={reason} style={[type.caption, { color: accent.bright }]}>
                {reason}
              </Text>
            ))}
          </View>
          <ScoreRing value={recommendation.total} size={52} />
        </Pressable>
        <Pressable
          onPress={() => toggle(product.id)}
          accessibilityRole="button"
          accessibilityLabel={`${saved ? 'Remove' : 'Save'} ${product.name}`}
          hitSlop={8}
          style={{ justifyContent: 'center', paddingHorizontal: 4 }}
        >
          <Text style={[type.title, { color: saved ? accent.base : base.textLow }]}>
            {saved ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>
    </Surface>
  );
}

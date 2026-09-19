import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { countOutfits, enumerateOutfits } from '@/lib/outfits';
import { EmptyState, SectionHeader, Surface } from '@/components/primitives';
import { GarmentArt } from '@/components/GarmentArt';

export default function FitsScreen() {
  const { base, accent, type, spacing } = useTheme();
  const items = useAppStore((s) => s.wardrobeItems);
  const outfits = enumerateOutfits(items).slice(0, 12);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}><ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}><Text style={[type.display, { color: accent.bright }]}>{countOutfits(items)}</Text><Text style={[type.body, { color: base.textMid }]}>possible outfits</Text>{items.length < 3 ? <EmptyState title="Add a few pieces first" body="Fits appear once we can combine a top, bottom, and footwear." /> : <><SectionHeader title="Your outfits" />{outfits.map((outfit, i) => <Surface key={i} level={2} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.sm }}>{outfit.map((item) => <View key={item.id} style={{ flex: 1, alignItems: 'center' }}><GarmentArt category={item.category} color={item.color} size={54} /><Text numberOfLines={1} style={[type.caption, { color: base.textMid }]}>{item.name}</Text></View>)}</Surface>)}</>}</ScrollView>
    </SafeAreaView>
  );
}

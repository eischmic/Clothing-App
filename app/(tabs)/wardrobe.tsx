import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { analyzeGaps, categoryCoverage } from '@/lib/gaps';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { CoverageBars } from '@/components/CoverageBars';
import { EmptyState, SectionHeader } from '@/components/primitives';
import { ProductCard } from '@/components/ProductCard';
import { WardrobeItemCard } from '@/components/WardrobeItemCard';

export default function WardrobeScreen() {
  const { base, type, spacing } = useTheme();
  const wardrobeItems = useAppStore((s) => s.wardrobeItems);
  const profile = useAppStore((s) => s.styleProfile);
  const remove = useAppStore((s) => s.removeWardrobeItem);
  const gaps = useMemo(() => profile ? analyzeGaps({ wardrobe: wardrobeItems, userVector: profile.vector, products: ALL_PRODUCTS, budgetCenter: 120 }) : [], [profile, wardrobeItems]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}><ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}><Text style={[type.display, { color: base.textHi }]}>Wardrobe</Text><Text style={[type.body, { color: base.textMid }]}>{wardrobeItems.length} pieces</Text>{wardrobeItems.length === 0 ? <EmptyState title="Your wardrobe is empty" body="Add pieces during onboarding to see how they work together." action="Start onboarding" onAction={() => router.replace('/onboarding' as never)} /> : <><SectionHeader title="Coverage" /><CoverageBars coverage={categoryCoverage(wardrobeItems)} /><SectionHeader title="Gaps in your wardrobe" />{gaps.slice(0, 4).map((gap) => <View key={gap.id} style={{ marginBottom: spacing.md }}><Text style={[type.body, { color: base.textHi, fontWeight: '700' }]}>{gap.title}</Text><Text style={[type.caption, { color: base.textMid, marginVertical: 4 }]}>{gap.reasoning}</Text>{gap.suggestion ? <ProductCard recommendation={gap.suggestion} onPress={() => router.push(`/product/${gap.suggestion?.product.id}` as never)} /> : null}</View>)}<SectionHeader title="Your pieces" /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>{wardrobeItems.map((item) => <WardrobeItemCard key={item.id} item={item} onRemove={() => remove(item.id)} />)}</View></>}</ScrollView>
    </SafeAreaView>
  );
}

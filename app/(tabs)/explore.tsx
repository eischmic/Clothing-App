import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { INTENTS, type IntentId, rankProducts } from '@/lib/scoring';
import { Chip, EmptyState, SectionHeader } from '@/components/primitives';
import { ProductCard } from '@/components/ProductCard';

export default function ExploreScreen() {
  const { base, type, spacing } = useTheme();
  const inspoImages = useAppStore((s) => s.inspoImages);
  const profile = useAppStore((s) => s.styleProfile);
  const wardrobe = useAppStore((s) => s.wardrobeItems);
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const [intentId, setIntentId] = useState<IntentId>(INTENTS.some((x) => x.id === intent) ? intent as IntentId : 'surprise');
  const [search, setSearch] = useState(''); const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const results = useMemo(() => { if (!profile) return []; const candidates = ALL_PRODUCTS.filter((p) => (!maxPrice || p.price <= maxPrice) && `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(search.toLowerCase())); return rankProducts({ userVector: profile.vector, wardrobe, inspoImages, products: candidates, intentId, budgetCenter: 120, limit: 12 }); }, [profile, wardrobe, inspoImages, intentId, search, maxPrice]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}><ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }} stickyHeaderIndices={[0]}><View style={{ backgroundColor: base.canvas, paddingBottom: spacing.sm }}><Text style={[type.display, { color: base.textHi }]}>Explore</Text><TextInput value={search} onChangeText={setSearch} placeholder="Search pieces, brands, styles" placeholderTextColor={base.textLow} accessibilityLabel="Search products" style={[type.body, { color: base.textHi, borderColor: base.hairline, borderWidth: 1, borderRadius: 14, padding: spacing.sm, marginTop: spacing.sm }]} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>{INTENTS.map((x) => <Chip key={x.id} label={x.label} selected={intentId === x.id} onPress={() => setIntentId(x.id)} />)}</ScrollView><View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}><Chip label="Under $100" selected={maxPrice === 100} onPress={() => setMaxPrice(maxPrice === 100 ? null : 100)} /><Chip label="Under $200" selected={maxPrice === 200} onPress={() => setMaxPrice(maxPrice === 200 ? null : 200)} /><Chip label="Any" selected={maxPrice === null} onPress={() => setMaxPrice(null)} /></View></View><SectionHeader title={`${results.length} recommendations`} />{results.length ? results.map((rec) => <ProductCard key={rec.product.id} recommendation={rec} onPress={() => router.push(`/product/${rec.product.id}` as never)} />) : <EmptyState title="No pieces found" body="Try a different intent, search, or price range." />}</ScrollView>
    </SafeAreaView>
  );
}

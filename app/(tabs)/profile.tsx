import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { Chip, EmptyState, PrimaryButton, SectionHeader, Slider, Surface } from '@/components/primitives';
import { STYLE_WORDS, VIBE_NAMES, type SliderKey } from '@/lib/types';
import { composeStyleVector } from '@/lib/vector';
import { RadarChart } from '@/components/RadarChart';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { GarmentArt } from '@/components/GarmentArt';

export default function ProfileScreen() {
  const { base, accent, type, spacing, mode, setMode } = useTheme();
  const styleProfile = useAppStore((s) => s.styleProfile);
  const questionnaire = useAppStore((s) => s.questionnaire);
  const setSliders = useAppStore((s) => s.setSliders);
  const toggleWord = useAppStore((s) => s.toggleWord);
  const setProfile = useAppStore((s) => s.setStyleProfile);
  const reset = useAppStore((s) => s.resetOnboarding);
  const loadDemo = useAppStore((s) => s.loadDemoData);
  const saved = useAppStore((s) => s.savedProductIds);
  const updateSlider = (key: SliderKey, value: number) => { const sliders = { ...questionnaire.sliders, [key]: value }; setSliders({ [key]: value }); if (styleProfile) setProfile({ ...styleProfile, vector: composeStyleVector([], { ...questionnaire, sliders }), questionnaire: { ...questionnaire, sliders }, updatedAt: new Date().toISOString() }); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      {!styleProfile ? <EmptyState title="No profile yet" action="Load demo data" onAction={loadDemo} /> : <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}><Text style={[type.display, { color: base.textHi }]}>Profile</Text><Text style={[type.body, { color: accent.bright }]}>{styleProfile.tags.join(' · ')}</Text><SectionHeader title="Your style" /><Surface level={2}><RadarChart vector={styleProfile.vector} /></Surface><SectionHeader title="Retune" />{([['minimalExpressive','Minimal','Expressive'],['classicTrendy','Classic','Trendy'],['formalCasual','Formal','Casual'],['practicalFashion','Practical','Fashion-forward'],['neutralColorful','Neutral','Colourful']] as Array<[SliderKey,string,string]>).map(([key,left,right]) => <Slider key={key} value={questionnaire.sliders[key]} onChange={(value) => updateSlider(key, value)} leftLabel={left} rightLabel={right} />)}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>{STYLE_WORDS.map((word) => <Chip key={word} label={word} selected={questionnaire.words.includes(word)} onPress={() => toggleWord(word)} />)}</View><SectionHeader title="Theme" /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}><Chip label="Auto" selected={mode === 'auto'} onPress={() => setMode('auto')} />{VIBE_NAMES.map((vibe) => <Chip key={vibe} label={vibe} selected={mode === vibe} onPress={() => setMode(vibe)} />)}</View><SectionHeader title="Saved" />{saved.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{ALL_PRODUCTS.filter((p) => saved.includes(p.id)).map((p) => <View key={p.id}><GarmentArt category={p.category} color={p.color} size={82} /><Text style={[type.caption, { color: base.textMid }]}>{p.name}</Text></View>)}</View> : <Text style={[type.body, { color: base.textLow }]}>Save recommendations to find them here.</Text>}<PrimaryButton label="Redo onboarding" variant="ghost" onPress={() => { reset(); router.replace('/onboarding' as never); }} style={{ marginTop: spacing.xl }} /></ScrollView>}
    </SafeAreaView>
  );
}

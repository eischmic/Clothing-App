import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { RadarChart } from '@/components/RadarChart';
import { PaletteRow } from '@/components/PaletteRow';
import { Chip, EmptyState, SectionHeader, Surface } from '@/components/primitives';
import { INTENTS } from '@/lib/scoring';
import { countOutfits } from '@/lib/outfits';

export default function HomeScreen() {
  const styleProfile = useAppStore((s) => s.styleProfile);
  const wardrobeItems = useAppStore((s) => s.wardrobeItems);
  const { base, accent, type, spacing } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      {!styleProfile ? <EmptyState title="No style profile yet" body="Answer a few questions and we’ll shape your wardrobe." action="Start onboarding" onAction={() => router.replace('/onboarding' as never)} /> : <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        <Text style={[type.display, { color: base.textHi }]}>Your Style</Text><Text style={[type.body, { color: accent.bright, marginTop: 4 }]}>{styleProfile.tags.join(' · ')}</Text>
        <SectionHeader title="Palette" /><PaletteRow colors={styleProfile.dominantColors} />
        <SectionHeader title="Style signature" /><Surface level={2}><RadarChart vector={styleProfile.vector} /></Surface>
        <SectionHeader title="Silhouettes" /><View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>{styleProfile.silhouettes.map((x) => <Chip key={x} label={x} />)}</View>
        <SectionHeader title="Materials" /><View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>{styleProfile.materials.map((x) => <Chip key={x} label={x} />)}</View>
        <SectionHeader title="What are you looking for?" /><View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>{INTENTS.map((intent) => <Chip key={intent.id} label={intent.label} onPress={() => router.push({ pathname: '/explore', params: { intent: intent.id } })} style={{ width: '48%' }} />)}</View>
        <Pressable onPress={() => router.push('/fits')} accessibilityRole="button" accessibilityLabel="View possible outfits" style={{ marginTop: spacing.xl }}><Surface level={1}><Text style={[type.body, { color: base.textHi }]}>{wardrobeItems.length} pieces · <Text style={{ color: accent.bright }}>{countOutfits(wardrobeItems)} possible outfits</Text></Text></Surface></Pressable>
      </ScrollView>}
    </SafeAreaView>
  );
}

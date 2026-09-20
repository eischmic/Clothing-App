import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import {
  selectActiveProfile,
  selectActiveRecord,
  selectCatalogById,
  selectQuestionnaire,
  selectReferenceImages,
  selectSavedOutfits,
  selectWishlistIds,
} from '@/store/selectors';
import {
  Chip,
  EmptyState,
  PrimaryButton,
  SectionHeader,
  Slider,
  Surface,
} from '@/components/primitives';
import { STYLE_WORDS, VIBE_NAMES, type ProfileRecord, type SliderKey } from '@/lib/types';
import { composeStyleVector } from '@/lib/vector';
import { ImagePickerGrid } from '@/components/ImagePickerGrid';
import { RadarChart } from '@/components/RadarChart';
import { PaletteRow } from '@/components/PaletteRow';
import { GarmentArt } from '@/components/GarmentArt';

const SLIDERS: Array<[SliderKey, string, string]> = [
  ['minimalExpressive', 'Minimal', 'Expressive'],
  ['classicTrendy', 'Classic', 'Trendy'],
  ['formalCasual', 'Formal', 'Casual'],
  ['practicalFashion', 'Practical', 'Fashion-forward'],
  ['neutralColorful', 'Neutral', 'Colourful'],
];

// Alert.alert is a no-op in react-native-web, which would make delete silently
// fail in the browser.
function confirmDelete(name: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`Delete “${name}”? Its wardrobe and saves go with it.`)) onConfirm();
    return;
  }
  Alert.alert('Delete profile', `Delete “${name}”? Its wardrobe and saves go with it.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

function ProfileRow({
  record,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  record: ProfileRecord;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { base, accent, type, spacing } = useTheme();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(record.name);

  const commit = () => {
    setEditing(false);
    if (value.trim()) onRename(value);
    else setValue(record.name);
  };

  return (
    <Surface
      level={2}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
        padding: spacing.sm,
      }}
    >
      <Pressable
        onPress={onSelect}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Use ${record.name}`}
        hitSlop={8}
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: active ? accent.base : base.hairline,
          backgroundColor: active ? accent.base : 'transparent',
        }}
      />
      {editing ? (
        <TextInput
          value={value}
          onChangeText={setValue}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          accessibilityLabel="Profile name"
          style={[type.body, { flex: 1, color: base.textHi }]}
        />
      ) : (
        <Text
          onPress={() => (active ? setEditing(true) : onSelect())}
          numberOfLines={1}
          accessibilityRole="button"
          accessibilityLabel={active ? `Rename ${record.name}` : `Use ${record.name}`}
          style={[type.body, { flex: 1, color: active ? base.textHi : base.textMid }]}
        >
          {record.name}
        </Text>
      )}
      <Text
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${record.name}`}
        style={[type.caption, { color: base.textLow, padding: spacing.xs }]}
      >
        Delete
      </Text>
    </Surface>
  );
}

export function ProfilePane() {
  const { base, accent, type, spacing, mode, setMode } = useTheme();
  const styleProfile = useAppStore(selectActiveProfile);
  const questionnaire = useAppStore(selectQuestionnaire);
  const referenceImages = useAppStore(selectReferenceImages);
  const savedOutfits = useAppStore(selectSavedOutfits);
  const activeRecord = useAppStore(selectActiveRecord);
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);
  const renameProfile = useAppStore((s) => s.renameProfile);
  const deleteProfile = useAppStore((s) => s.deleteProfile);
  const setSliders = useAppStore((s) => s.setSliders);
  const toggleWord = useAppStore((s) => s.toggleWord);
  const setProfile = useAppStore((s) => s.setStyleProfile);
  const beginDraft = useAppStore((s) => s.beginDraft);
  const addReferenceImages = useAppStore((s) => s.addReferenceImages);
  const removeReferenceImage = useAppStore((s) => s.removeReferenceImage);
  const loadDemo = useAppStore((s) => s.loadDemoData);
  const saved = useAppStore(selectWishlistIds);
  const productById = useAppStore(selectCatalogById);
  const resolveProducts = useAppStore((s) => s.resolveProducts);

  useEffect(() => {
    if (saved.length) void resolveProducts(saved);
  }, [saved, resolveProducts]);

  const startNewProfile = () => {
    beginDraft('New style');
    router.push('/onboarding' as never);
  };

  const updateSlider = (key: SliderKey, value: number) => {
    const sliders = { ...questionnaire.sliders, [key]: value };
    setSliders({ [key]: value });
    if (styleProfile) {
      setProfile({
        ...styleProfile,
        vector: composeStyleVector([], { ...questionnaire, sliders }),
        questionnaire: { ...questionnaire, sliders },
        updatedAt: new Date().toISOString(),
      });
    }
  };

  if (!styleProfile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
        <EmptyState
          title="No style profile yet"
          body="Answer a few questions and we’ll shape your wardrobe."
          action="Start onboarding"
          onAction={() => router.replace('/onboarding' as never)}
        />
        <PrimaryButton label="Load demo data" variant="ghost" onPress={loadDemo} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        <SectionHeader title="Profiles" />
        {profiles.map((record) => (
          <ProfileRow
            key={record.id}
            record={record}
            active={record.id === activeProfileId}
            onSelect={() => setActiveProfile(record.id)}
            onRename={(name) => renameProfile(record.id, name)}
            onDelete={() => confirmDelete(record.name, () => deleteProfile(record.id))}
          />
        ))}
        <PrimaryButton label="+ New profile" variant="ghost" onPress={startNewProfile} />

        <SectionHeader title="Your Style" />
        <Text style={[type.display, { color: base.textHi }]}>
          {activeRecord?.name ?? 'Your style'}
        </Text>
        <Text style={[type.body, { color: accent.bright, marginTop: 4 }]}>
          {styleProfile.tags.join(' · ')}
        </Text>

        <SectionHeader title="Palette" />
        <PaletteRow colors={styleProfile.dominantColors} />

        <SectionHeader title="Style signature" />
        <Surface level={2}>
          <RadarChart vector={styleProfile.vector} />
        </Surface>

        <SectionHeader title="Silhouettes" />
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {styleProfile.silhouettes.map((x) => (
            <Chip key={x} label={x} />
          ))}
        </View>

        <SectionHeader title="Materials" />
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {styleProfile.materials.map((x) => (
            <Chip key={x} label={x} />
          ))}
        </View>

        <SectionHeader title="Reference images" />
        <ImagePickerGrid
          max={8}
          uris={referenceImages.map((x) => x.uri)}
          onAdd={(uris) =>
            addReferenceImages(
              uris.map((uri) => ({
                id: `${Date.now()}-${uri}`,
                uri,
                attributes: null,
                uploadedAt: new Date().toISOString(),
              })),
            )
          }
          onRemove={(uri) => {
            const image = referenceImages.find((x) => x.uri === uri);
            if (image) removeReferenceImage(image.id);
          }}
        />

        <SectionHeader title="Retune" />
        {SLIDERS.map(([key, left, right]) => (
          <Slider
            key={key}
            value={questionnaire.sliders[key]}
            onChange={(value) => updateSlider(key, value)}
            leftLabel={left}
            rightLabel={right}
          />
        ))}
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}
        >
          {STYLE_WORDS.map((word) => (
            <Chip
              key={word}
              label={word}
              selected={questionnaire.words.includes(word)}
              onPress={() => toggleWord(word)}
            />
          ))}
        </View>

        <SectionHeader title="Theme" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Chip label="Auto" selected={mode === 'auto'} onPress={() => setMode('auto')} />
          {VIBE_NAMES.map((vibe) => (
            <Chip key={vibe} label={vibe} selected={mode === vibe} onPress={() => setMode(vibe)} />
          ))}
        </View>

        <SectionHeader title="Want" />
        {saved.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {saved.flatMap((id) => productById[id] ?? []).map((p) => (
              <View key={p.id}>
                <GarmentArt category={p.category} color={p.color} size={82} />
                <Text style={[type.caption, { color: base.textMid }]}>{p.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[type.body, { color: base.textLow }]}>
            Swipe right on pieces you like to find them here.
          </Text>
        )}

        <SectionHeader title="Saved outfits" />
        <Text style={[type.body, { color: base.textMid }]}>
          {savedOutfits.length} saved · see them in Closet
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { PaletteRow } from '@/components/PaletteRow';
import { RadarChart } from '@/components/RadarChart';
import { PrimaryButton } from '@/components/primitives';
import { buildStyleProfile } from '@/lib/profile';
import { analyzeInspiration, toDataUri } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { selectQuestionnaire, selectReferenceImages } from '@/store/selectors';
import { useTheme } from '@/theme/useTheme';

const stages = ['Reading your inspiration', 'Finding your palette', 'Mapping your style'];

export default function Analyzing() {
  const { base, accent, type, spacing, reduceMotion } = useTheme();
  const commitDraft = useAppStore((s) => s.commitDraft);
  // Snapshot the draft's answers on mount. `commitDraft` clears the draft, at
  // which point the selectors fall through to the freshly created profile —
  // new array identities that would otherwise re-run the analysis and commit
  // a second profile.
  const [input] = useState(() => ({
    questionnaire: selectQuestionnaire(useAppStore.getState()),
    images: selectReferenceImages(useAppStore.getState()),
  }));
  const { questionnaire, images } = input;
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [profile, setLocalProfile] = useState(() =>
    buildStyleProfile({
      attributes: images.flatMap((x) => (x.attributes ? [x.attributes] : [])),
      questionnaire,
    }),
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!reduceMotion) setStage(1);
      const dataUris = await Promise.all(
        images.map((image) => toDataUri(image.uri).catch(() => '')),
      );
      if (!active) return;
      if (!reduceMotion) setStage(2);
      else setStage(stages.length - 1);
      const result = await analyzeInspiration(dataUris.filter(Boolean));
      if (!active) return;
      setDegraded(result.degraded);
      const next = buildStyleProfile({
        attributes: result.attributes.length
          ? result.attributes
          : images.flatMap((x) => (x.attributes ? [x.attributes] : [])),
        questionnaire,
      });
      setLocalProfile(next);
      commitDraft(next);
      setDone(true);
    })();
    return () => {
      active = false;
    };
  }, [images, questionnaire, reduceMotion, commitDraft]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }}>
      <OnboardingProgress step={4} />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        {!done ? (
          <View style={{ gap: spacing.md }}>
            {stages.map((name, index) => (
              <Text
                key={name}
                style={[type.title, { color: index <= stage ? accent.bright : base.textLow }]}
              >
                {index <= stage ? '✓ ' : '○ '}
                {name}
              </Text>
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <Text style={[type.display, { color: base.textHi }]}>This is your style.</Text>
            {degraded ? (
              <Text style={[type.caption, { color: base.textLow }]}>
                Analysed offline — using your preferences only.
              </Text>
            ) : null}
            <Text style={[type.title, { color: accent.bright }]}>{profile.tags.join(' · ')}</Text>
            <PaletteRow colors={profile.dominantColors} />
            <RadarChart vector={profile.vector} />
            <PrimaryButton label="See your style" onPress={() => router.replace('/' as never)} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

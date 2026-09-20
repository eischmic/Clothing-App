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
import { createProfile as createBackendProfile, getProfile } from '@/lib/backend';
import { arrayToStyleVector } from '@/lib/catalog/backendMapper';
import { useAppStore } from '@/store/useAppStore';
import { selectQuestionnaire, selectReferenceImages } from '@/store/selectors';
import { useTheme } from '@/theme/useTheme';

const stages = ['Reading your inspiration', 'Finding your palette', 'Mapping your style'];

export default function Analyzing() {
  const { base, accent, type, spacing, reduceMotion } = useTheme();
  const commitDraft = useAppStore((s) => s.commitDraft);
  const setBackendProfileId = useAppStore((s) => s.setBackendProfileId);
  const rewriteReferenceUris = useAppStore((s) => s.rewriteReferenceUris);
  // Snapshot the draft's answers on mount. `commitDraft` clears the draft, at
  // which point the selectors fall through to the freshly created profile —
  // new array identities that would otherwise re-run the analysis and commit
  // a second profile.
  const [input] = useState(() => ({
    questionnaire: selectQuestionnaire(useAppStore.getState()),
    images: selectReferenceImages(useAppStore.getState()),
    profileName: useAppStore.getState().draft?.name?.trim() || 'My style',
  }));
  const { questionnaire, images, profileName } = input;
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [committedIds, setCommittedIds] = useState<
    { profileId: string; backendProfileId: string } | null
  >(null);
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

      const usable = dataUris.filter(Boolean);
      // Parallel, not sequential: the two calls hit different services and
      // neither needs the other's answer. Serialising them would roughly double
      // the wait on the slowest screen in onboarding.
      const [claude, backend] = await Promise.all([
        analyzeInspiration(usable),
        createBackendProfile(profileName, usable),
      ]);
      if (!active) return;

      setDegraded(claude.degraded);

      // No `clip` argument here, deliberately. POST /profiles returns n_refs
      // but no vector, and refetching GET /profiles/{id} purely for it would
      // put a second round trip on the critical path of the slowest onboarding
      // screen. The vector arrives via the follow-up effect in Step 4.
      const next = buildStyleProfile({
        attributes: claude.attributes.length
          ? claude.attributes
          : images.flatMap((x) => (x.attributes ? [x.attributes] : [])),
        questionnaire,
      });
      setLocalProfile(next);
      const profileId = commitDraft(next);

      if (backend.profile) {
        setBackendProfileId(profileId, backend.profile.profile_id);
        setCommittedIds({ profileId, backendProfileId: backend.profile.profile_id });
        // Reference photos now live on the server. Swapping the data URIs for
        // URLs is the AsyncStorage bloat fix, and it falls out of work already
        // being done rather than needing a separate upload service.
        rewriteReferenceUris(profileId, backend.profile.references.map((r) => r.image_url));
      }
      setDone(true);
    })();
    return () => {
      active = false;
    };
  }, [images, questionnaire, reduceMotion, commitDraft, profileName, setBackendProfileId, rewriteReferenceUris]);

  // Fetch the CLIP projection after the reveal is already on screen. Blocking
  // the slowest onboarding screen on a second round trip is not worth it, and
  // `setStyleProfile` re-renders the radar chart when it lands.
  useEffect(() => {
    if (!committedIds) return;
    let active = true;
    (async () => {
      const { detail } = await getProfile(committedIds.backendProfileId);
      if (!active || !detail) return;
      const blended = buildStyleProfile({
        attributes: images.flatMap((x) => (x.attributes ? [x.attributes] : [])),
        questionnaire,
        clip: {
          vector: arrayToStyleVector(detail.vector),
          nRefs: detail.n_refs,
          nSwipes: detail.n_swipes,
        },
      });
      setLocalProfile(blended);
      useAppStore.getState().setStyleProfile(blended);
    })();
    return () => {
      active = false;
    };
  }, [committedIds, images, questionnaire]);

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

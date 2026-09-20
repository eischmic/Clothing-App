import type { Questionnaire, StyleProfile } from '@/lib/types';

type PersistedState = {
  questionnaire?: Partial<Questionnaire>;
  styleProfile?: Partial<StyleProfile> | null;
  [key: string]: unknown;
};

/** Normalizes persisted data written by earlier app versions. */
export function normalizePersistedState(state: PersistedState): PersistedState {
  const profile = state.styleProfile;
  if (!profile) return state;
  return {
    ...state,
    questionnaire: {
      sliders: state.questionnaire?.sliders ?? {},
      words: Array.isArray(state.questionnaire?.words) ? state.questionnaire.words : [],
    } as Questionnaire,
    styleProfile: {
      ...profile,
      tags: Array.isArray(profile.tags) ? profile.tags : [],
      vibes: Array.isArray(profile.vibes) ? profile.vibes : [],
      dominantColors: Array.isArray(profile.dominantColors) ? profile.dominantColors : [],
      silhouettes: Array.isArray(profile.silhouettes) ? profile.silhouettes : [],
      materials: Array.isArray(profile.materials) ? profile.materials : [],
      influences: Array.isArray(profile.influences) ? profile.influences : [],
    } as StyleProfile,
  };
}

import type {
  InspoImage,
  ProfileDraft,
  ProfileRecord,
  Questionnaire,
  StyleProfile,
  WardrobeItem,
} from '@/lib/types';

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

const EPOCH = '1970-01-01T00:00:00.000Z';

export interface PersistedStateV1 {
  questionnaire?: Partial<Questionnaire>;
  inspoImages?: InspoImage[];
  wardrobeItems?: WardrobeItem[];
  styleProfile?: Partial<StyleProfile> | null;
  savedProductIds?: string[];
  themeMode?: unknown;
}

export interface PersistedStateV2 {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  draft: ProfileDraft | null;
  themeMode: unknown;
}

/**
 * Folds the single flat v1 profile into the v2 profiles list. Deterministic:
 * the id is fixed rather than time-derived, so the same blob always migrates
 * to the same result and the function is testable.
 */
export function migrateV1ToV2(state: PersistedStateV1): PersistedStateV2 {
  const themeMode = state.themeMode ?? 'auto';
  if (!state.styleProfile) {
    return { profiles: [], activeProfileId: null, draft: null, themeMode };
  }

  const normalized = normalizePersistedState(state as PersistedState);
  const profile = normalized.styleProfile as StyleProfile;

  const record: ProfileRecord = {
    id: 'profile-1',
    name: 'My style',
    profile,
    questionnaire: normalized.questionnaire as Questionnaire,
    referenceImages: state.inspoImages ?? [],
    wardrobeItems: state.wardrobeItems ?? [],
    wishlistIds: state.savedProductIds ?? [],
    rejectedIds: [],
    savedOutfits: [],
    createdAt: profile.createdAt ?? EPOCH,
    updatedAt: profile.updatedAt ?? EPOCH,
  };

  return { profiles: [record], activeProfileId: record.id, draft: null, themeMode };
}

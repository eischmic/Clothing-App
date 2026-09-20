// store/selectors.ts — referentially stable reads over the profiles list.

import type {
  InspoImage,
  Product,
  ProfileRecord,
  Questionnaire,
  SavedOutfit,
  StyleProfile,
  WardrobeItem,
} from '@/lib/types';
import { defaultSliders } from '@/lib/profileRecords';
import type { AppState } from '@/store/useAppStore';

// Stable identities. Returning a fresh `[]` here would hand every render a new
// reference and re-trigger the useMemo chains in ClosetPane on every keystroke.
const EMPTY_WARDROBE = Object.freeze([]) as unknown as WardrobeItem[];
const EMPTY_IMAGES = Object.freeze([]) as unknown as InspoImage[];
const EMPTY_IDS = Object.freeze([]) as unknown as string[];
const EMPTY_OUTFITS = Object.freeze([]) as unknown as SavedOutfit[];
const EMPTY_QUESTIONNAIRE = Object.freeze({
  sliders: defaultSliders(),
  words: [],
}) as unknown as Questionnaire;

export function selectActiveRecord(s: AppState): ProfileRecord | null {
  if (!s.activeProfileId) return null;
  return s.profiles.find((p) => p.id === s.activeProfileId) ?? null;
}

export function selectActiveProfile(s: AppState): StyleProfile | null {
  return selectActiveRecord(s)?.profile ?? null;
}

// The draft reads come first so that mid-onboarding the screens see what the
// user is entering rather than the previously active profile.

export function selectWardrobe(s: AppState): WardrobeItem[] {
  return s.draft?.wardrobeItems ?? selectActiveRecord(s)?.wardrobeItems ?? EMPTY_WARDROBE;
}

export function selectReferenceImages(s: AppState): InspoImage[] {
  return s.draft?.referenceImages ?? selectActiveRecord(s)?.referenceImages ?? EMPTY_IMAGES;
}

export function selectQuestionnaire(s: AppState): Questionnaire {
  return s.draft?.questionnaire ?? selectActiveRecord(s)?.questionnaire ?? EMPTY_QUESTIONNAIRE;
}

export function selectWishlistIds(s: AppState): string[] {
  return selectActiveRecord(s)?.wishlistIds ?? EMPTY_IDS;
}

export function selectRejectedIds(s: AppState): string[] {
  return selectActiveRecord(s)?.rejectedIds ?? EMPTY_IDS;
}

export function selectSavedOutfits(s: AppState): SavedOutfit[] {
  return selectActiveRecord(s)?.savedOutfits ?? EMPTY_OUTFITS;
}

const EMPTY_FEED = Object.freeze([]) as unknown as Product[];
const EMPTY_BY_ID = Object.freeze({}) as unknown as Record<string, Product>;

export function selectCatalogFeed(s: AppState): Product[] {
  return s.catalog?.feed ?? EMPTY_FEED;
}

export function selectCatalogById(s: AppState): Record<string, Product> {
  return s.catalog?.byId ?? EMPTY_BY_ID;
}

export function selectBackendProfileId(s: AppState): string | null {
  return selectActiveRecord(s)?.backendProfileId ?? null;
}

// lib/profileRecords.ts — pure helpers over ProfileRecord. No React, RN, or Expo.

import type { ProfileDraft, ProfileRecord, Questionnaire, StyleProfile } from '@/lib/types';
import { SLIDER_KEYS } from '@/lib/types';

export function defaultSliders(): Questionnaire['sliders'] {
  return Object.fromEntries(SLIDER_KEYS.map((k) => [k, 0.5])) as Questionnaire['sliders'];
}

export function emptyDraft(name: string): ProfileDraft {
  return {
    name,
    questionnaire: { sliders: defaultSliders(), words: [] },
    referenceImages: [],
    wardrobeItems: [],
  };
}

export function draftToRecord(
  draft: ProfileDraft,
  profile: StyleProfile,
  id: string,
  now: string,
): ProfileRecord {
  return {
    id,
    name: draft.name.trim() || 'New style',
    profile,
    questionnaire: draft.questionnaire,
    referenceImages: draft.referenceImages,
    wardrobeItems: draft.wardrobeItems,
    wishlistIds: [],
    rejectedIds: [],
    savedOutfits: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Which profile should be active once `deletedId` is removed. Picks whichever
 * profile slides into the deleted index so the selection stays visually put
 * rather than jumping to the head of the list.
 */
export function nextActiveId(
  profiles: ProfileRecord[],
  deletedId: string,
  currentActive: string | null,
): string | null {
  if (currentActive !== deletedId) return currentActive;
  const index = profiles.findIndex((p) => p.id === deletedId);
  const remaining = profiles.filter((p) => p.id !== deletedId);
  if (remaining.length === 0) return null;
  return remaining[Math.min(index, remaining.length - 1)].id;
}

export function withWishlistToggled(record: ProfileRecord, productId: string): ProfileRecord {
  const wanted = record.wishlistIds.includes(productId);
  return {
    ...record,
    wishlistIds: wanted
      ? record.wishlistIds.filter((id) => id !== productId)
      : [...record.wishlistIds, productId],
    rejectedIds: record.rejectedIds.filter((id) => id !== productId),
  };
}

export function withProductRejected(record: ProfileRecord, productId: string): ProfileRecord {
  return {
    ...record,
    wishlistIds: record.wishlistIds.filter((id) => id !== productId),
    rejectedIds: record.rejectedIds.includes(productId)
      ? record.rejectedIds
      : [...record.rejectedIds, productId],
  };
}

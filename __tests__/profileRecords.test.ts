import type { ProfileRecord, Questionnaire, StyleProfile } from '@/lib/types';
import { SLIDER_KEYS } from '@/lib/types';
import {
  draftToRecord,
  emptyDraft,
  nextActiveId,
  withProductRejected,
  withWishlistToggled,
} from '@/lib/profileRecords';

const QUESTIONNAIRE: Questionnaire = {
  sliders: Object.fromEntries(SLIDER_KEYS.map((k) => [k, 0.5])) as Questionnaire['sliders'],
  words: [],
};

const PROFILE: StyleProfile = {
  vector: {} as StyleProfile['vector'],
  vibes: [],
  vibe: 'noir',
  tags: [],
  dominantColors: [],
  silhouettes: [],
  materials: [],
  influences: [],
  questionnaire: null,
  createdAt: 'T0',
  updatedAt: 'T0',
};

function record(id: string, over: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id,
    name: id,
    profile: PROFILE,
    questionnaire: QUESTIONNAIRE,
    referenceImages: [],
    wardrobeItems: [],
    wishlistIds: [],
    rejectedIds: [],
    savedOutfits: [],
    backendProfileId: null,
    createdAt: 'T0',
    updatedAt: 'T0',
    ...over,
  };
}

describe('nextActiveId', () => {
  const list = [record('a'), record('b'), record('c')];

  it('activates the profile that shifts into the deleted slot', () => {
    expect(nextActiveId(list, 'b', 'b')).toBe('c');
  });

  it('falls back to the new last profile when the last was deleted', () => {
    expect(nextActiveId(list, 'c', 'c')).toBe('b');
  });

  it('leaves the active profile alone when a different one is deleted', () => {
    expect(nextActiveId(list, 'a', 'c')).toBe('c');
  });

  it('returns null when the only profile is deleted', () => {
    expect(nextActiveId([record('a')], 'a', 'a')).toBeNull();
  });
});

describe('withWishlistToggled', () => {
  it('adds then removes, returning to the original set', () => {
    const base = record('a');
    const once = withWishlistToggled(base, 'p1');
    expect(once.wishlistIds).toEqual(['p1']);
    expect(withWishlistToggled(once, 'p1').wishlistIds).toEqual([]);
  });

  it('clears a prior rejection so a product is never both', () => {
    const next = withWishlistToggled(record('a', { rejectedIds: ['p1'] }), 'p1');
    expect(next.wishlistIds).toEqual(['p1']);
    expect(next.rejectedIds).toEqual([]);
  });

  it('does not mutate the input', () => {
    const base = record('a');
    withWishlistToggled(base, 'p1');
    expect(base.wishlistIds).toEqual([]);
  });
});

describe('withProductRejected', () => {
  it('records the rejection and drops it from the wishlist', () => {
    const next = withProductRejected(record('a', { wishlistIds: ['p1', 'p2'] }), 'p1');
    expect(next.rejectedIds).toEqual(['p1']);
    expect(next.wishlistIds).toEqual(['p2']);
  });

  it('does not duplicate an existing rejection', () => {
    expect(withProductRejected(record('a', { rejectedIds: ['p1'] }), 'p1').rejectedIds).toEqual([
      'p1',
    ]);
  });
});

describe('draftToRecord', () => {
  it('carries the draft name, images and wardrobe onto the record', () => {
    const rec = draftToRecord(emptyDraft('Work'), PROFILE, 'profile-7', 'T1');
    expect(rec.id).toBe('profile-7');
    expect(rec.name).toBe('Work');
    expect(rec.createdAt).toBe('T1');
    expect(rec.updatedAt).toBe('T1');
    expect(rec.wishlistIds).toEqual([]);
    expect(rec.rejectedIds).toEqual([]);
    expect(rec.savedOutfits).toEqual([]);
  });

  it('falls back to a placeholder when the name is blank', () => {
    expect(draftToRecord(emptyDraft('   '), PROFILE, 'p', 'T1').name).toBe('New style');
  });
});

describe('emptyDraft', () => {
  it('starts every slider centred with no words chosen', () => {
    const draft = emptyDraft('Gym');
    expect(Object.values(draft.questionnaire.sliders)).toEqual(SLIDER_KEYS.map(() => 0.5));
    expect(draft.questionnaire.words).toEqual([]);
    expect(draft.referenceImages).toEqual([]);
    expect(draft.wardrobeItems).toEqual([]);
  });
});

// catalogSlice.test.ts — regression tests for the catalog slice actions that
// cannot live in persistV3.test.ts (which is scoped to persist
// migrate/merge/partialize). These tests exercise live store mutations.

import { useAppStore } from '@/store/useAppStore';
import { defaultSliders } from '@/lib/profileRecords';
import type { Product } from '@/lib/types';

const PRODUCT_A: Product = {
  id: 'top-classic-black',
  brand: 'H&M',
  name: 'Strap top',
  imageUri: 'http://example.test/a.jpg',
  url: 'http://example.test/buy',
  description: '',
  category: 'top',
  color: 'black',
  colorFamily: 'neutral',
  formality: 2,
  seasons: ['spring'],
  vector: {},
} as unknown as Product;

const PRODUCT_B: Product = {
  id: 'dress-floral-pink',
  brand: 'Zara',
  name: 'Floral dress',
  imageUri: 'http://example.test/b.jpg',
  url: 'http://example.test/buy2',
  description: '',
  category: 'dress',
  color: 'pink',
  colorFamily: 'warm',
  formality: 3,
  seasons: ['summer'],
  vector: {},
} as unknown as Product;

function resetStore() {
  useAppStore.setState({
    profiles: [
      {
        id: 'profile-1',
        name: 'Profile 1',
        backendProfileId: null,
        wishlistIds: [],
        rejectedIds: [],
        savedOutfits: [],
        referenceImages: [],
        wardrobeItems: [],
        questionnaire: { sliders: defaultSliders(), words: [] },
        profile: {} as never,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'profile-2',
        name: 'Profile 2',
        backendProfileId: null,
        wishlistIds: [],
        rejectedIds: [],
        savedOutfits: [],
        referenceImages: [],
        wardrobeItems: [],
        questionnaire: { sliders: defaultSliders(), words: [] },
        profile: {} as never,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    activeProfileId: 'profile-1',
    catalog: {
      feed: [PRODUCT_A],
      byId: { [PRODUCT_A.id]: PRODUCT_A, [PRODUCT_B.id]: PRODUCT_B },
      status: 'ready',
    },
  });
}

describe('setActiveProfile', () => {
  beforeEach(resetStore);

  it('clears feed and resets status to idle when switching to a different profile', () => {
    useAppStore.getState().setActiveProfile('profile-2');

    const { catalog, activeProfileId } = useAppStore.getState();
    expect(activeProfileId).toBe('profile-2');
    expect(catalog.feed).toEqual([]);
    expect(catalog.status).toBe('idle');
  });

  it('preserves byId when switching profiles so wishlists and saved outfits keep their data', () => {
    useAppStore.getState().setActiveProfile('profile-2');

    const { catalog } = useAppStore.getState();
    // byId is the cross-profile cache; clearing it would empty the closet
    expect(catalog.byId[PRODUCT_A.id]).toEqual(PRODUCT_A);
    expect(catalog.byId[PRODUCT_B.id]).toEqual(PRODUCT_B);
  });

  it('leaves feed and status untouched when switching to the already-active profile', () => {
    useAppStore.getState().setActiveProfile('profile-1');

    const { catalog, activeProfileId } = useAppStore.getState();
    expect(activeProfileId).toBe('profile-1');
    // Feed was correctly fetched for this profile — a no-op switch must not
    // discard it.
    expect(catalog.feed).toEqual([PRODUCT_A]);
    expect(catalog.status).toBe('ready');
  });
});

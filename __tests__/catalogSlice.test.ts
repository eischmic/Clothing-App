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

const IMG_A: import('@/lib/types').InspoImage = {
  id: 'img-1',
  uri: 'data:image/jpeg;base64,/abc',
  attributes: null,
  uploadedAt: '2024-01-01T00:00:00.000Z',
};

const IMG_B: import('@/lib/types').InspoImage = {
  id: 'img-2',
  uri: 'data:image/jpeg;base64,/def',
  attributes: null,
  uploadedAt: '2024-01-01T00:00:00.000Z',
};

const IMG_C: import('@/lib/types').InspoImage = {
  id: 'img-3',
  uri: 'data:image/jpeg;base64,/ghi',
  attributes: null,
  uploadedAt: '2024-01-01T00:00:00.000Z',
};

function resetStoreWithImages() {
  useAppStore.setState({
    profiles: [
      {
        id: 'profile-1',
        name: 'Profile 1',
        backendProfileId: null,
        wishlistIds: [],
        rejectedIds: [],
        savedOutfits: [],
        referenceImages: [IMG_A, IMG_B, IMG_C],
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
        referenceImages: [IMG_A],
        wardrobeItems: [],
        questionnaire: { sliders: defaultSliders(), words: [] },
        profile: {} as never,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    activeProfileId: 'profile-1',
    catalog: {
      feed: [],
      byId: {},
      status: 'idle',
    },
  });
}

describe('rewriteReferenceUris', () => {
  beforeEach(resetStoreWithImages);

  it('rewrites reference URIs positionally in order', () => {
    useAppStore.getState().rewriteReferenceUris('profile-1', [
      'https://cdn.example.com/ref-1.jpg',
      'https://cdn.example.com/ref-2.jpg',
      'https://cdn.example.com/ref-3.jpg',
    ]);

    const profile = useAppStore.getState().profiles.find((p) => p.id === 'profile-1')!;
    expect(profile.referenceImages[0].uri).toBe('https://cdn.example.com/ref-1.jpg');
    expect(profile.referenceImages[1].uri).toBe('https://cdn.example.com/ref-2.jpg');
    expect(profile.referenceImages[2].uri).toBe('https://cdn.example.com/ref-3.jpg');
    // id fields are preserved
    expect(profile.referenceImages[0].id).toBe('img-1');
    expect(profile.referenceImages[1].id).toBe('img-2');
    expect(profile.referenceImages[2].id).toBe('img-3');
  });

  it('leaves tail images on their original local URIs when the server returns fewer URLs than the profile has images', () => {
    useAppStore.getState().rewriteReferenceUris('profile-1', [
      'https://cdn.example.com/ref-1.jpg',
    ]);

    const profile = useAppStore.getState().profiles.find((p) => p.id === 'profile-1')!;
    expect(profile.referenceImages[0].uri).toBe('https://cdn.example.com/ref-1.jpg');
    // tail images retain original local data URIs
    expect(profile.referenceImages[1].uri).toBe(IMG_B.uri);
    expect(profile.referenceImages[2].uri).toBe(IMG_C.uri);
  });

  it('leaves other profiles untouched', () => {
    useAppStore.getState().rewriteReferenceUris('profile-1', [
      'https://cdn.example.com/ref-1.jpg',
      'https://cdn.example.com/ref-2.jpg',
      'https://cdn.example.com/ref-3.jpg',
    ]);

    const other = useAppStore.getState().profiles.find((p) => p.id === 'profile-2')!;
    expect(other.referenceImages[0].uri).toBe(IMG_A.uri);
  });
});

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

// The migrate chain and the custom merge are the two pieces of persistence that
// can silently empty a user's closet on upgrade, and neither is reachable from
// the pure-function migration tests: migrateV2ToV3 is covered in isolation
// there, but nothing pins how the chain composes, nor that merge keeps `byId`
// while refusing to restore the live `feed`.

import {
  PERSIST_VERSION,
  mergePersisted,
  migratePersisted,
  partializeState,
  useAppStore,
} from '@/store/useAppStore';
import type { AppStore } from '@/store/useAppStore';
import type { Product } from '@/lib/types';

const PRODUCT = {
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

const current = () => useAppStore.getState();

describe('persist version', () => {
  it('is 3', () => {
    expect(PERSIST_VERSION).toBe(3);
  });
});

describe('migrate chain', () => {
  it('carries a v1 blob through both hops to v3', () => {
    const out = migratePersisted(
      {
        themeMode: 'dark',
        savedProductIds: ['top-classic-black'],
        styleProfile: { createdAt: 'T0', updatedAt: 'T0', tags: [], vibes: [] },
        questionnaire: { sliders: {}, words: [] },
      },
      1,
    ) as unknown as {
      profiles: Array<{ backendProfileId: string | null; wishlistIds: string[] }>;
      catalog: { byId: Record<string, Product> };
      themeMode: unknown;
    };

    // v1->v2 created the profile; v2->v3 then added the new fields to it.
    expect(out.profiles).toHaveLength(1);
    expect(out.profiles[0].backendProfileId).toBeNull();
    expect(out.profiles[0].wishlistIds).toEqual(['top-classic-black']);
    expect(out.catalog).toEqual({ byId: {} });
    expect(out.themeMode).toBe('dark');
  });

  it('runs only the second hop on a v2 blob', () => {
    const out = migratePersisted(
      {
        profiles: [{ id: 'p1', name: 'Mine', wishlistIds: ['x'] }],
        activeProfileId: 'p1',
        draft: null,
        themeMode: 'auto',
      },
      2,
    ) as unknown as {
      profiles: Array<{ id: string; backendProfileId: string | null }>;
      catalog: { byId: Record<string, Product> };
      activeProfileId: string | null;
    };

    expect(out.profiles[0].id).toBe('p1');
    expect(out.profiles[0].backendProfileId).toBeNull();
    expect(out.activeProfileId).toBe('p1');
    expect(out.catalog).toEqual({ byId: {} });
  });
});

describe('merge', () => {
  it('restores the persisted byId cache', () => {
    const merged = mergePersisted(
      { profiles: [], activeProfileId: null, catalog: { byId: { [PRODUCT.id]: PRODUCT } } },
      current(),
    );
    // This is the whole reason byId is persisted: wishlists and saved outfits
    // hold only ids, so losing the cache empties the closet on a cold start
    // with the backend unreachable.
    expect(merged.catalog.byId[PRODUCT.id]).toEqual(PRODUCT);
  });

  it('never restores feed or status from disk', () => {
    const merged = mergePersisted(
      { catalog: { byId: {}, feed: [PRODUCT], status: 'ready' } },
      current(),
    );
    // A stale ranked feed belongs to whichever profile was active last; a stale
    // 'ready' would tell the UI a load succeeded this session when none ran.
    expect(merged.catalog.feed).toEqual([]);
    expect(merged.catalog.status).toBe('idle');
  });

  it('survives a persisted blob with no catalog key at all', () => {
    // Every v1/v2 blob in the wild looks like this, as does a truncated one.
    const merged = mergePersisted({ profiles: [], activeProfileId: null }, current());
    expect(merged.catalog.byId).toEqual({});
    expect(merged.catalog.feed).toEqual([]);
    expect(merged.catalog.status).toBe('idle');
  });

  it('survives a null persisted blob', () => {
    const merged = mergePersisted(null, current());
    expect(merged.catalog.byId).toEqual({});
  });

  it('keeps the actions callable after merging', () => {
    // merge returns the object the store becomes. Dropping the actions would
    // leave every button in the app calling undefined.
    const merged = mergePersisted({ profiles: [] }, current());
    expect(typeof merged.loadFeed).toBe('function');
    expect(typeof merged.resolveProducts).toBe('function');
    expect(typeof merged.setBackendProfileId).toBe('function');
  });
});

describe('partialize', () => {
  it('writes byId but neither feed nor status', () => {
    const slice = partializeState({
      ...current(),
      catalog: { feed: [PRODUCT], byId: { [PRODUCT.id]: PRODUCT }, status: 'ready' },
    } as AppStore);

    expect(slice.catalog).toEqual({ byId: { [PRODUCT.id]: PRODUCT } });
    expect('feed' in slice.catalog).toBe(false);
    expect('status' in slice.catalog).toBe(false);
  });

  it('round-trips byId through partialize and back through merge', () => {
    const saved = partializeState({
      ...current(),
      catalog: { feed: [PRODUCT], byId: { [PRODUCT.id]: PRODUCT }, status: 'ready' },
    } as AppStore);

    const restored = mergePersisted(JSON.parse(JSON.stringify(saved)), current());
    expect(restored.catalog.byId[PRODUCT.id]).toEqual(PRODUCT);
    expect(restored.catalog.feed).toEqual([]);
  });
});

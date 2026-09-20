// store/useAppStore.ts — Zustand store holding every style profile, persisted
// to AsyncStorage. Profiles are fully independent; only `themeMode` is shared.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

import type {
  InspoImage,
  Product,
  ProfileDraft,
  ProfileRecord,
  SliderKey,
  StyleProfile,
  StyleWord,
  VibeName,
  WardrobeItem,
} from '@/lib/types';
import { DEMO_PROFILE, DEMO_WARDROBE } from '@/lib/fixtures';
import {
  defaultSliders,
  draftToRecord,
  emptyDraft,
  nextActiveId,
  withProductRejected,
  withWishlistToggled,
} from '@/lib/profileRecords';
import { activeProvider, FALLBACK_PRODUCTS } from '@/lib/catalog/index';
import { getCatalogItem, swipe as backendSwipe } from '@/lib/backend';
import { mapProfileItemToProduct } from '@/lib/catalog/backendMapper';
import { migrateV1ToV2, migrateV2ToV3 } from '@/lib/stateMigration';
import type { PersistedStateV1, PersistedStateV2 } from '@/lib/stateMigration';

// ---- State ----

type ThemeMode = 'auto' | VibeName;

export interface CatalogSlice {
  /** Current ranked pool. NOT persisted — it is profile-specific and live. */
  feed:   Product[];
  /** Every product ever resolved. PERSISTED: ids alone are insufficient state
   *  against a remote catalog, so a cold start with the backend down would
   *  otherwise empty the user's closet. */
  byId:   Record<string, Product>;
  status: 'idle' | 'loading' | 'ready' | 'degraded';
}

export interface AppState {
  profiles:        ProfileRecord[];
  activeProfileId: string | null;
  draft:           ProfileDraft | null;
  themeMode:       ThemeMode;
  hydrated:        boolean;
  catalog:         CatalogSlice;
}

// ---- Actions ----

export interface AppActions {
  beginDraft:        (name: string) => void;
  updateDraftName:   (name: string) => void;
  commitDraft:       (profile: StyleProfile) => string;
  discardDraft:      () => void;

  setActiveProfile:  (id: string) => void;
  renameProfile:     (id: string, name: string) => void;
  deleteProfile:     (id: string) => void;

  setSliders:        (sliders: Partial<Record<SliderKey, number>>) => void;
  toggleWord:        (word: StyleWord) => void;
  addReferenceImages:(images: InspoImage[]) => void;
  removeReferenceImage: (id: string) => void;
  addWardrobeItems:  (items: WardrobeItem[]) => void;
  removeWardrobeItem:(id: string) => void;
  setStyleProfile:   (profile: StyleProfile) => void;

  toggleWishlist:    (productId: string) => void;
  rejectProduct:     (productId: string) => void;
  clearRejections:   () => void;
  saveOutfit:        (productIds: string[]) => void;
  removeSavedOutfit: (id: string) => void;

  setThemeMode:        (mode: ThemeMode) => void;
  resetEverything:     () => void;
  loadDemoData:        () => void;

  setBackendProfileId: (profileId: string, backendProfileId: string | null) => void;
  rewriteReferenceUris: (profileId: string, uris: string[]) => void;
  loadFeed:            () => Promise<void>;
  resolveProducts:     (ids: string[]) => Promise<void>;
}

export type AppStore = AppState & AppActions;

// ---- SSR-safe storage ----
// On the server (Node render), window is not defined and AsyncStorage uses
// window.localStorage under the hood — importing it crashes the SSR bundle.
// We gate the import and return a no-op storage when not on a client.

const IS_CLIENT = typeof window !== 'undefined';

/** A do-nothing storage used during SSR so persist never touches window. */
const noopStorage: StateStorage = {
  getItem:    () => null,
  setItem:    () => undefined,
  removeItem: () => undefined,
};

function buildStorage(): StateStorage {
  if (!IS_CLIENT) return noopStorage;
  // Dynamic require keeps the AsyncStorage import out of the SSR bundle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: AsyncStorage } = require('@react-native-async-storage/async-storage') as {
    default: StateStorage;
  };
  return AsyncStorage;
}

// ---- Mutation routing ----

/** Applies `fn` to the active profile and stamps `updatedAt`. */
function mutateActive(
  s: AppState,
  fn: (record: ProfileRecord) => ProfileRecord,
): Partial<AppState> {
  if (!s.activeProfileId) return {};
  const now = new Date().toISOString();
  return {
    profiles: s.profiles.map((p) =>
      p.id === s.activeProfileId ? { ...fn(p), updatedAt: now } : p,
    ),
  };
}

/**
 * Routes a mutation to the open draft when there is one, otherwise to the
 * active profile. This is what lets the onboarding screens keep calling the
 * same action names without knowing a draft exists.
 */
function mutateDraftOrActive(
  s: AppState,
  onDraft: (draft: ProfileDraft) => ProfileDraft,
  onRecord: (record: ProfileRecord) => ProfileRecord,
): Partial<AppState> {
  if (s.draft) return { draft: onDraft(s.draft) };
  return mutateActive(s, onRecord);
}

// ---- Helpers ----

/** Adds products to `byId` without dropping anything already cached. */
function mergeById(
  byId: Record<string, Product>,
  products: Product[],
): Record<string, Product> {
  if (products.length === 0) return byId;
  const next = { ...byId };
  for (const p of products) next[p.id] = p;
  return next;
}

// ---- Persistence ----
// The three pure halves of the persist config live here as named exports
// rather than inline in the options object. They are the code that can
// silently empty a user's closet on upgrade, and zustand does not expose the
// options object at runtime under jest-expo -- inline, they are untestable.

export const PERSIST_VERSION = 3;

export function migratePersisted(persisted: unknown, version: number): AppStore {
  let state = persisted;
  if (version < 2) state = migrateV1ToV2(state as PersistedStateV1);
  if (version < 3) state = migrateV2ToV3(state as PersistedStateV2);
  return state as AppStore;
}

/**
 * Only `byId` of the catalog slice is written. `feed` is a live ranked slice
 * belonging to one profile and `status` describes the current session, so
 * neither survives a restart.
 */
export function partializeState(state: AppStore) {
  return {
    profiles:        state.profiles,
    activeProfileId: state.activeProfileId,
    draft:           state.draft,
    themeMode:       state.themeMode,
    catalog:         { byId: state.catalog.byId },
  };
}

/**
 * zustand's default merge is a shallow spread, which would replace the whole
 * `catalog` object with the partialized `{ byId }` and leave `feed` and
 * `status` undefined. Merge the slice explicitly.
 */
export function mergePersisted(persisted: unknown, current: AppStore): AppStore {
  const p = (persisted ?? {}) as Partial<AppStore> & {
    catalog?: { byId?: Record<string, Product> };
  };
  return {
    ...current,
    ...p,
    catalog: {
      feed:   current.catalog.feed,
      status: current.catalog.status,
      byId:   p.catalog?.byId ?? current.catalog.byId,
    },
  } as AppStore;
}

// ---- Swipe write-back ----

/**
 * Fire-and-forget. A lost swipe costs a little ranking quality; a swipe that
 * blocks or throws costs the user their gesture, so the result is deliberately
 * dropped. `backendSwipe` already never rejects; the catch is belt-and-braces.
 */
function reportSwipe(
  state: AppState,
  productId: string,
  liked: boolean,
): void {
  const record = state.profiles.find((p) => p.id === state.activeProfileId);
  if (!record?.backendProfileId) return;
  void backendSwipe(record.backendProfileId, productId, liked).catch(() => undefined);
}

// ---- Store ----

const initialState: AppState = {
  profiles:        [],
  activeProfileId: null,
  draft:           null,
  themeMode:       'auto',
  hydrated:        false,
  catalog:         { feed: [], byId: {}, status: 'idle' },
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      beginDraft: (name) => set({ draft: emptyDraft(name) }),

      updateDraftName: (name) =>
        set((s) => (s.draft ? { draft: { ...s.draft, name } } : {})),

      commitDraft: (profile) => {
        const draft = get().draft ?? emptyDraft('New style');
        const id = `profile-${Date.now()}`;
        const record = draftToRecord(draft, profile, id, new Date().toISOString());
        set((s) => ({
          profiles: [...s.profiles, record],
          activeProfileId: id,
          draft: null,
        }));
        return id;
      },

      discardDraft: () => set({ draft: null }),

      setActiveProfile: (id) =>
        set((s) => {
          // A no-op switch must not discard a feed that was correctly fetched
          // for the already-active profile.
          if (id === s.activeProfileId) return {};
          // The feed is ranked by the backend for one specific profile. A stale
          // 'ready' status would fool the idle-guard effect in ExplorePane into
          // skipping the fetch, so the user would see the previous profile's
          // recommendations. Reset to idle so the effect refetches on the next
          // render. byId is left intact: it is the cross-profile product cache
          // that backs wishlists and saved outfits, which store only ids.
          return {
            activeProfileId: id,
            catalog: { ...s.catalog, feed: [], status: 'idle' },
          };
        }),

      renameProfile: (id, name) =>
        set((s) => {
          const trimmed = name.trim();
          if (!trimmed) return {};
          return {
            profiles: s.profiles.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
          };
        }),

      deleteProfile: (id) =>
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id),
          activeProfileId: nextActiveId(s.profiles, id, s.activeProfileId),
        })),

      setSliders: (sliders) =>
        set((s) =>
          mutateDraftOrActive(
            s,
            (d) => ({
              ...d,
              questionnaire: {
                ...d.questionnaire,
                sliders: { ...d.questionnaire.sliders, ...sliders },
              },
            }),
            (r) => ({
              ...r,
              questionnaire: {
                ...r.questionnaire,
                sliders: { ...r.questionnaire.sliders, ...sliders },
              },
            }),
          ),
        ),

      toggleWord: (word) =>
        set((s) => {
          const toggle = (words: StyleWord[]) =>
            words.includes(word) ? words.filter((w) => w !== word) : [...words, word];
          return mutateDraftOrActive(
            s,
            (d) => ({
              ...d,
              questionnaire: { ...d.questionnaire, words: toggle(d.questionnaire.words) },
            }),
            (r) => ({
              ...r,
              questionnaire: { ...r.questionnaire, words: toggle(r.questionnaire.words) },
            }),
          );
        }),

      addReferenceImages: (images) =>
        set((s) =>
          mutateDraftOrActive(
            s,
            (d) => ({ ...d, referenceImages: [...d.referenceImages, ...images] }),
            (r) => ({ ...r, referenceImages: [...r.referenceImages, ...images] }),
          ),
        ),

      removeReferenceImage: (id) =>
        set((s) =>
          mutateDraftOrActive(
            s,
            (d) => ({ ...d, referenceImages: d.referenceImages.filter((i) => i.id !== id) }),
            (r) => ({ ...r, referenceImages: r.referenceImages.filter((i) => i.id !== id) }),
          ),
        ),

      addWardrobeItems: (items) =>
        set((s) =>
          mutateDraftOrActive(
            s,
            (d) => ({ ...d, wardrobeItems: [...d.wardrobeItems, ...items] }),
            (r) => ({ ...r, wardrobeItems: [...r.wardrobeItems, ...items] }),
          ),
        ),

      removeWardrobeItem: (id) =>
        set((s) =>
          mutateDraftOrActive(
            s,
            (d) => ({ ...d, wardrobeItems: d.wardrobeItems.filter((i) => i.id !== id) }),
            (r) => ({ ...r, wardrobeItems: r.wardrobeItems.filter((i) => i.id !== id) }),
          ),
        ),

      setStyleProfile: (profile) => set((s) => mutateActive(s, (r) => ({ ...r, profile }))),

      toggleWishlist: (productId) =>
        set((s) => {
          const record = s.profiles.find((p) => p.id === s.activeProfileId);
          // Only report the transition into the wishlist, not out of it — the
          // backend has no un-swipe, and re-reporting would double-count.
          if (record && !record.wishlistIds.includes(productId)) {
            reportSwipe(s, productId, true);
          }
          return mutateActive(s, (r) => withWishlistToggled(r, productId));
        }),

      rejectProduct: (productId) =>
        set((s) => {
          reportSwipe(s, productId, false);
          return mutateActive(s, (r) => withProductRejected(r, productId));
        }),

      clearRejections: () => set((s) => mutateActive(s, (r) => ({ ...r, rejectedIds: [] }))),

      saveOutfit: (productIds) =>
        set((s) =>
          mutateActive(s, (r) => ({
            ...r,
            savedOutfits: [
              ...r.savedOutfits,
              { id: `outfit-${Date.now()}`, productIds, createdAt: new Date().toISOString() },
            ],
          })),
        ),

      removeSavedOutfit: (id) =>
        set((s) =>
          mutateActive(s, (r) => ({
            ...r,
            savedOutfits: r.savedOutfits.filter((o) => o.id !== id),
          })),
        ),

      setThemeMode: (mode) => set({ themeMode: mode }),

      resetEverything: () =>
        set({ profiles: [], activeProfileId: null, draft: null, themeMode: 'auto', catalog: { feed: [], byId: {}, status: 'idle' } }),

      loadDemoData: () =>
        set((s) => {
          const now = new Date().toISOString();
          const demo: ProfileRecord = {
            id: 'profile-demo',
            name: 'Demo',
            profile: DEMO_PROFILE,
            questionnaire: DEMO_PROFILE.questionnaire ?? { sliders: defaultSliders(), words: [] },
            referenceImages: [],
            wardrobeItems: DEMO_WARDROBE,
            wishlistIds: [],
            rejectedIds: [],
            savedOutfits: [],
            backendProfileId: null,
            createdAt: now,
            updatedAt: now,
          };
          // Replace rather than append, so repeated taps don't pile up copies.
          return {
            profiles: [...s.profiles.filter((p) => p.id !== demo.id), demo],
            activeProfileId: demo.id,
            draft: null,
          };
        }),

      setBackendProfileId: (profileId, backendProfileId) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === profileId ? { ...p, backendProfileId } : p,
          ),
          catalog: profileId === s.activeProfileId
            ? { ...s.catalog, feed: [], status: 'idle' }
            : s.catalog,
        })),

      rewriteReferenceUris: (profileId, uris) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === profileId
              ? {
                  ...p,
                  // Positional: the server returns one reference per uploaded
                  // photo, in upload order. A short response leaves the tail on
                  // its original local URI, which still renders.
                  referenceImages: p.referenceImages.map((img, i) =>
                    uris[i] ? { ...img, uri: uris[i] } : img,
                  ),
                }
              : p,
          ),
        })),

      loadFeed: async () => {
        const state = get();
        // Captured, not re-read after the await. The feed is ranked FOR one
        // profile, so if the user switches while the fetch is in flight, the
        // response that lands belongs to the profile they left -- publishing it
        // would show them someone else's recommendations marked 'ready'.
        const requestedFor = state.activeProfileId;
        const record = state.profiles.find((p) => p.id === requestedFor);
        set((s) => ({ catalog: { ...s.catalog, status: 'loading' } }));

        const products = await activeProvider(record?.backendProfileId ?? null).all();

        if (get().activeProfileId !== requestedFor) return;

        // An empty pool is a degraded backend, not a real empty catalogue:
        // fall back so the deck keeps working rather than showing nothing.
        if (products.length === 0) {
          set((s) => ({
            catalog: {
              feed:   FALLBACK_PRODUCTS,
              byId:   mergeById(s.catalog.byId, FALLBACK_PRODUCTS),
              status: 'degraded',
            },
          }));
          return;
        }

        set((s) => ({
          catalog: {
            feed:   products,
            byId:   mergeById(s.catalog.byId, products),
            status: 'ready',
          },
        }));
      },

      resolveProducts: async (ids) => {
        const { catalog } = get();
        const missing = ids.filter((id) => !catalog.byId[id]);
        if (missing.length === 0) return;

        const resolved = await Promise.all(
          missing.map(async (id) => {
            const { item } = await getCatalogItem(id);
            return item ? mapProfileItemToProduct(item) : null;
          }),
        );

        const found = resolved.filter((p): p is Product => p !== null);
        if (found.length === 0) return;
        set((s) => ({ catalog: { ...s.catalog, byId: mergeById(s.catalog.byId, found) } }));
      },
    }),
    {
      name: 'fitlab-store',
      version: PERSIST_VERSION,
      migrate: migratePersisted,
      storage: createJSONStorage(buildStorage),
      partialize: partializeState,
      merge: mergePersisted,
      onRehydrateStorage: () => (_state, _error) => {
        // Mark hydration complete once AsyncStorage rehydration finishes (or errors).
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

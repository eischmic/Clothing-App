// store/useAppStore.ts — Zustand store holding every style profile, persisted
// to AsyncStorage. Profiles are fully independent; only `themeMode` is shared.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

import type {
  InspoImage,
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
import { migrateV1ToV2 } from '@/lib/stateMigration';
import type { PersistedStateV1 } from '@/lib/stateMigration';

// ---- State ----

type ThemeMode = 'auto' | VibeName;

export interface AppState {
  profiles:        ProfileRecord[];
  activeProfileId: string | null;
  draft:           ProfileDraft | null;
  themeMode:       ThemeMode;
  hydrated:        boolean;
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

  setThemeMode:      (mode: ThemeMode) => void;
  resetEverything:   () => void;
  loadDemoData:      () => void;
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

// ---- Store ----

const initialState: AppState = {
  profiles:        [],
  activeProfileId: null,
  draft:           null,
  themeMode:       'auto',
  hydrated:        false,
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

      setActiveProfile: (id) => set({ activeProfileId: id }),

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
        set((s) => mutateActive(s, (r) => withWishlistToggled(r, productId))),

      rejectProduct: (productId) =>
        set((s) => mutateActive(s, (r) => withProductRejected(r, productId))),

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
        set({ profiles: [], activeProfileId: null, draft: null, themeMode: 'auto' }),

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
    }),
    {
      name: 'fitlab-store',
      version: 2,
      migrate: (persisted, version) =>
        (version < 2
          ? migrateV1ToV2(persisted as PersistedStateV1)
          : persisted) as unknown as AppStore,
      storage: createJSONStorage(buildStorage),
      partialize: (state) => ({
        profiles:        state.profiles,
        activeProfileId: state.activeProfileId,
        draft:           state.draft,
        themeMode:       state.themeMode,
      }),
      onRehydrateStorage: () => (_state, _error) => {
        // Mark hydration complete once AsyncStorage rehydration finishes (or errors).
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

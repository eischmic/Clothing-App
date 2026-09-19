// store/useAppStore.ts — single Zustand store with AsyncStorage persistence.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

import type {
  Questionnaire,
  InspoImage,
  WardrobeItem,
  SliderKey,
  StyleWord,
  VibeName,
} from '@/lib/types';
import { SLIDER_KEYS } from '@/lib/types';
import { DEMO_PROFILE, DEMO_WARDROBE } from '@/lib/fixtures';
import type { StyleProfile } from '@/lib/types';

// ---- State ----

type ThemeMode = 'auto' | VibeName;

function defaultSliders(): Record<SliderKey, number> {
  return Object.fromEntries(SLIDER_KEYS.map((k) => [k, 0.5])) as Record<SliderKey, number>;
}

export interface AppState {
  questionnaire:    Questionnaire;
  inspoImages:      InspoImage[];
  wardrobeItems:    WardrobeItem[];
  styleProfile:     StyleProfile | null;
  savedProductIds:  string[];
  themeMode:        ThemeMode;
  hydrated:         boolean;
}

// ---- Actions ----

export interface AppActions {
  setSliders:        (sliders: Partial<Record<SliderKey, number>>) => void;
  toggleWord:        (word: StyleWord) => void;
  addInspoImages:    (images: InspoImage[]) => void;
  removeInspoImage:  (id: string) => void;
  addWardrobeItems:  (items: WardrobeItem[]) => void;
  removeWardrobeItem:(id: string) => void;
  setStyleProfile:   (profile: StyleProfile) => void;
  toggleSaved:       (productId: string) => void;
  setThemeMode:      (mode: ThemeMode) => void;
  resetOnboarding:   () => void;
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

// ---- Store ----

const initialState: AppState = {
  questionnaire:   { sliders: defaultSliders(), words: [] },
  inspoImages:     [],
  wardrobeItems:   [],
  styleProfile:    null,
  savedProductIds: [],
  themeMode:       'auto',
  hydrated:        false,
};

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialState,

      setSliders: (sliders) =>
        set((s) => ({
          questionnaire: {
            ...s.questionnaire,
            sliders: { ...s.questionnaire.sliders, ...sliders },
          },
        })),

      toggleWord: (word) =>
        set((s) => {
          const words = s.questionnaire.words.includes(word)
            ? s.questionnaire.words.filter((w) => w !== word)
            : [...s.questionnaire.words, word];
          return { questionnaire: { ...s.questionnaire, words } };
        }),

      addInspoImages: (images) =>
        set((s) => ({ inspoImages: [...s.inspoImages, ...images] })),

      removeInspoImage: (id) =>
        set((s) => ({ inspoImages: s.inspoImages.filter((i) => i.id !== id) })),

      addWardrobeItems: (items) =>
        set((s) => ({ wardrobeItems: [...s.wardrobeItems, ...items] })),

      removeWardrobeItem: (id) =>
        set((s) => ({ wardrobeItems: s.wardrobeItems.filter((i) => i.id !== id) })),

      setStyleProfile: (profile) => set({ styleProfile: profile }),

      toggleSaved: (productId) =>
        set((s) => ({
          savedProductIds: s.savedProductIds.includes(productId)
            ? s.savedProductIds.filter((id) => id !== productId)
            : [...s.savedProductIds, productId],
        })),

      setThemeMode: (mode) => set({ themeMode: mode }),

      resetOnboarding: () =>
        set({
          questionnaire:  { sliders: defaultSliders(), words: [] },
          inspoImages:    [],
          wardrobeItems:  [],
          styleProfile:   null,
          savedProductIds:[],
          themeMode:      'auto',
        }),

      loadDemoData: () =>
        set({ styleProfile: DEMO_PROFILE, wardrobeItems: DEMO_WARDROBE }),
    }),
    {
      name: 'fitlab-store',
      storage: createJSONStorage(buildStorage),
      partialize: (state) => ({
        questionnaire:   state.questionnaire,
        inspoImages:     state.inspoImages,
        wardrobeItems:   state.wardrobeItems,
        styleProfile:    state.styleProfile,
        savedProductIds: state.savedProductIds,
        themeMode:       state.themeMode,
      }),
      onRehydrateStorage: () => (_state, _error) => {
        // Mark hydration complete once AsyncStorage rehydration finishes (or errors).
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

# Swipe-to-Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace FitLab's scrolling Explore feed with a one-outfit-at-a-time swipe deck backed by multiple independent style profiles.

**Architecture:** Three layers, built bottom-up. Pure logic lands in `lib/` first and gets real unit tests (`lib/` is the only tested layer in this repo and must stay free of React/RN/Expo imports). The Zustand store is restructured from one flat profile to `profiles[] + activeProfileId`, with selectors shielding components from the shape change. Only then does UI change: navigation first (to remove a gesture conflict), then the card deck.

**Tech Stack:** Expo SDK 57, Expo Router, React Native 0.86, React 19.2.3, Zustand 5 + AsyncStorage, react-native-reanimated 4.5.1, react-native-gesture-handler 2.32, Jest via jest-expo.

**Source specs:**
- `docs/superpowers/specs/2026-09-19-multi-profile-foundation-design.md` (spec 1)
- `docs/superpowers/specs/2026-09-19-explore-card-stack-design.md` (spec 2)
- `docs/superpowers/specs/2026-09-19-pill-navigation-design.md` (spec 3)

## Global Constraints

- **`lib/` purity.** `__tests__/purity.test.ts` walks every `.ts` under `lib/` and fails on any import matching `react`, `react-native`, or `expo*`. All new `lib/` modules must be plain TypeScript. A `'worklet';` string directive is allowed — it is not an import.
- **Test surface.** Only `lib/` and `theme/` have unit tests. There is no React renderer in devDependencies. Do not add component tests; verify UI in the browser.
- **Commands.** `npm test` (jest), `npm run typecheck` (`tsc --noEmit`). Both must pass before every commit.
- **Determinism.** Migrations and deck assembly must never call `Date.now()` or `Math.random()`. Ties break on `product.id` ascending.
- **Catalog only in the deck.** Every garment in the Explore deck is a `Product` from `ALL_PRODUCTS` (`@/lib/catalog/seeded`). Owned `WardrobeItem`s never appear.
- **Profiles are fully separate.** No data is shared between profiles except `themeMode`.
- **Route-file style.** Files under `app/` are written in the repo's dense single-line-per-statement style. Files under `components/` and `lib/` are conventionally formatted. Match whichever file you are editing.
- **Import alias.** `@/` maps to the repo root.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/types.ts` | + `SavedOutfit`, `ProfileRecord`, `ProfileDraft` |
| `lib/profileRecords.ts` | new — pure record helpers (`nextActiveId`, `withWishlistToggled`, `withProductRejected`, `emptyDraft`, `draftToRecord`) |
| `lib/stateMigration.ts` | + `migrateV1ToV2` |
| `lib/deck.ts` | new — pure deck assembly (`candidatesForSlot`, `buildOutfit`, `refillSlot`) |
| `lib/pager.ts` | + `FLICK_VELOCITY`, `settleIndex`, `dragIndex`; worklet directives |
| `store/useAppStore.ts` | rewritten around `profiles[]` |
| `store/selectors.ts` | new — referentially stable selectors |
| `app/_layout.tsx` | `GestureHandlerRootView`; gate on `profiles.length` |
| `app/index.tsx` | translated row instead of paging ScrollView |
| `components/SwipeTabBar.tsx` | + pan gesture |
| `components/GarmentSwipeCard.tsx` | new — one swipeable garment row |
| `components/StylePill.tsx` | new — pill + profile switcher modal |
| `components/panes/ExplorePane.tsx` | rewritten as the deck |
| `components/panes/ProfilePane.tsx` | + profiles management, reference images |
| `components/panes/ClosetPane.tsx` | + Want, Saved outfits |
| `components/ProductCard.tsx` | wishlist actions instead of `toggleSaved` |
| `app/product/[id].tsx` | selectors instead of flat fields |
| `app/onboarding/*.tsx` | draft-scoped |

**Task order matters.** Task 5 (navigation) lands *before* task 6 (cards) so the card pan never has to fight a horizontally-paging ScrollView. Building them in the other order requires a `scrollEnabled={false}` stopgap that then has to be undone.

---

### Task 1: Pure profile-record layer

Types and pure helpers only. Nothing imports these yet, so the app keeps working and `npm run typecheck` stays green throughout.

**Files:**
- Modify: `lib/types.ts` (append)
- Create: `lib/profileRecords.ts`
- Modify: `lib/stateMigration.ts`
- Create: `__tests__/profileRecords.test.ts`
- Modify: `__tests__/stateMigration.test.ts`

**Interfaces:**
- Consumes: existing `StyleProfile`, `Questionnaire`, `InspoImage`, `WardrobeItem`, `SliderKey`, `StyleWord` from `lib/types.ts`
- Produces: `SavedOutfit`, `ProfileRecord`, `ProfileDraft`, `nextActiveId`, `withWishlistToggled`, `withProductRejected`, `emptyDraft`, `draftToRecord`, `migrateV1ToV2`

- [ ] **Step 1: Add the new types**

Append to `lib/types.ts`:

```ts
export interface SavedOutfit {
  id: string;
  productIds: string[];
  createdAt: string;
}

export interface ProfileRecord {
  id: string;
  name: string;
  profile: StyleProfile;
  questionnaire: Questionnaire;
  referenceImages: InspoImage[];
  wardrobeItems: WardrobeItem[];
  wishlistIds: string[];
  rejectedIds: string[];
  savedOutfits: SavedOutfit[];
  createdAt: string;
  updatedAt: string;
}

/** Onboarding answers accumulated before a ProfileRecord exists. */
export interface ProfileDraft {
  name: string;
  questionnaire: Questionnaire;
  referenceImages: InspoImage[];
  wardrobeItems: WardrobeItem[];
}
```

`StyleProfile` is unchanged. It keeps its own `questionnaire: Questionnaire | null` snapshot; `ProfileRecord.questionnaire` is the live editable copy the Retune sliders write to. That duplication exists today and is preserved deliberately.

- [ ] **Step 2: Write the failing tests for the record helpers**

Create `__tests__/profileRecords.test.ts`:

```ts
import type { ProfileRecord, StyleProfile, Questionnaire } from '@/lib/types';
import { SLIDER_KEYS } from '@/lib/types';
import {
  nextActiveId,
  withWishlistToggled,
  withProductRejected,
  emptyDraft,
  draftToRecord,
} from '@/lib/profileRecords';

const QUESTIONNAIRE: Questionnaire = {
  sliders: Object.fromEntries(SLIDER_KEYS.map((k) => [k, 0.5])) as Questionnaire['sliders'],
  words: [],
};

const PROFILE = {
  vector: {} as StyleProfile['vector'],
  vibes: [], vibe: 'noir', tags: [], dominantColors: [],
  silhouettes: [], materials: [], influences: [],
  questionnaire: null, createdAt: 'T0', updatedAt: 'T0',
} satisfies StyleProfile;

function record(id: string, over: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id, name: id, profile: PROFILE, questionnaire: QUESTIONNAIRE,
    referenceImages: [], wardrobeItems: [], wishlistIds: [], rejectedIds: [],
    savedOutfits: [], createdAt: 'T0', updatedAt: 'T0', ...over,
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
    const base = record('a', { rejectedIds: ['p1'] });
    const next = withWishlistToggled(base, 'p1');
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
    const base = record('a', { wishlistIds: ['p1', 'p2'] });
    const next = withProductRejected(base, 'p1');
    expect(next.rejectedIds).toEqual(['p1']);
    expect(next.wishlistIds).toEqual(['p2']);
  });

  it('does not duplicate an existing rejection', () => {
    const base = record('a', { rejectedIds: ['p1'] });
    expect(withProductRejected(base, 'p1').rejectedIds).toEqual(['p1']);
  });
});

describe('draftToRecord', () => {
  it('carries the draft name, images and wardrobe onto the record', () => {
    const draft = { ...emptyDraft('Work'), wardrobeItems: [] };
    const rec = draftToRecord(draft, PROFILE, 'profile-7', 'T1');
    expect(rec.id).toBe('profile-7');
    expect(rec.name).toBe('Work');
    expect(rec.createdAt).toBe('T1');
    expect(rec.wishlistIds).toEqual([]);
    expect(rec.rejectedIds).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm test -- profileRecords`
Expected: FAIL — `Cannot find module '@/lib/profileRecords'`

- [ ] **Step 4: Implement `lib/profileRecords.ts`**

```ts
// lib/profileRecords.ts — pure helpers over ProfileRecord. No React/RN/Expo.

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
 * Which profile should be active after `deletedId` is removed. Picks the
 * profile that slides into the deleted index so the selection stays visually
 * put, rather than jumping to the head of the list.
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
```

`nextActiveId` takes `index` from the *pre-deletion* list and indexes into the *post-deletion* list, which is what makes "delete b from [a,b,c]" yield `c` and "delete c" yield `b`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test -- profileRecords`
Expected: PASS

- [ ] **Step 6: Write the failing migration tests**

Append to `__tests__/stateMigration.test.ts` (keep the existing `normalizePersistedState` test):

```ts
import { migrateV1ToV2 } from '@/lib/stateMigration';

describe('migrateV1ToV2', () => {
  const v1 = {
    questionnaire: { sliders: { minimalExpressive: 0.2 }, words: ['Bold'] },
    inspoImages: [{ id: 'i1', uri: 'file://a', attributes: null, uploadedAt: 'T0' }],
    wardrobeItems: [{ id: 'w1' }],
    styleProfile: { vibe: 'sage', vector: {}, tags: ['Relaxed'], createdAt: 'T1', updatedAt: 'T2' },
    savedProductIds: ['p1', 'p2'],
    themeMode: 'auto',
  };

  it('produces exactly one profile carrying the old fields across', () => {
    const next = migrateV1ToV2(v1 as never);
    expect(next.profiles).toHaveLength(1);
    const [record] = next.profiles;
    expect(record.id).toBe('profile-1');
    expect(record.name).toBe('My style');
    expect(record.wishlistIds).toEqual(['p1', 'p2']);
    expect(record.referenceImages).toHaveLength(1);
    expect(record.wardrobeItems).toHaveLength(1);
    expect(record.rejectedIds).toEqual([]);
    expect(record.savedOutfits).toEqual([]);
    expect(record.createdAt).toBe('T1');
    expect(next.activeProfileId).toBe('profile-1');
    expect(next.draft).toBeNull();
    expect(next.themeMode).toBe('auto');
  });

  it('yields no profiles when onboarding never finished', () => {
    const next = migrateV1ToV2({ ...v1, styleProfile: null } as never);
    expect(next.profiles).toEqual([]);
    expect(next.activeProfileId).toBeNull();
  });

  it('is deterministic — no Date.now or randomness', () => {
    expect(migrateV1ToV2(v1 as never)).toEqual(migrateV1ToV2(v1 as never));
  });

  it('array-fills a profile missing its list fields', () => {
    const next = migrateV1ToV2(v1 as never);
    const { profile } = next.profiles[0];
    expect(profile.silhouettes).toEqual([]);
    expect(profile.materials).toEqual([]);
    expect(profile.dominantColors).toEqual([]);
    expect(profile.vibes).toEqual([]);
  });

  it('falls back to the epoch when the profile carries no timestamps', () => {
    const next = migrateV1ToV2({ ...v1, styleProfile: { vibe: 'sage', vector: {} } } as never);
    expect(next.profiles[0].createdAt).toBe('1970-01-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 7: Run and confirm failure**

Run: `npm test -- stateMigration`
Expected: FAIL — `migrateV1ToV2 is not a function`

- [ ] **Step 8: Implement `migrateV1ToV2`**

Append to `lib/stateMigration.ts`, keeping `normalizePersistedState` exactly as it is:

```ts
import type { InspoImage, ProfileDraft, ProfileRecord, WardrobeItem } from '@/lib/types';

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

/** Folds the single flat v1 profile into the v2 profiles list. Deterministic. */
export function migrateV1ToV2(state: PersistedStateV1): PersistedStateV2 {
  const themeMode = state.themeMode ?? 'auto';
  if (!state.styleProfile) {
    return { profiles: [], activeProfileId: null, draft: null, themeMode };
  }

  const normalized = normalizePersistedState(state as PersistedState);
  const profile = normalized.styleProfile as StyleProfile;
  const questionnaire = normalized.questionnaire as Questionnaire;

  const record: ProfileRecord = {
    id: 'profile-1',
    name: 'My style',
    profile,
    questionnaire,
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
```

Merge the new type-only imports into the file's existing `import type { Questionnaire, StyleProfile } from '@/lib/types';` line rather than adding a second import statement.

- [ ] **Step 9: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS, PASS

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/profileRecords.ts lib/stateMigration.ts __tests__/profileRecords.test.ts __tests__/stateMigration.test.ts
git commit -m "feat: add pure profile-record layer and v1 to v2 migration"
```

---

### Task 2: Multi-profile store and selectors

Rewrites the store and updates every consumer in one commit. This cannot be split — the store shape change breaks every call site simultaneously.

**Files:**
- Rewrite: `store/useAppStore.ts`
- Create: `store/selectors.ts`
- Modify: `app/_layout.tsx`, `app/product/[id].tsx`, `components/ProductCard.tsx`
- Modify: `components/panes/ExplorePane.tsx`, `components/panes/ClosetPane.tsx`, `components/panes/ProfilePane.tsx`
- Modify: `app/onboarding/index.tsx`, `app/onboarding/personality.tsx`, `app/onboarding/wardrobe.tsx`, `app/onboarding/analyzing.tsx`

**Interfaces:**
- Consumes: Task 1's `ProfileRecord`, `ProfileDraft`, `emptyDraft`, `draftToRecord`, `nextActiveId`, `withWishlistToggled`, `withProductRejected`, `migrateV1ToV2`
- Produces: the `AppState` / `AppActions` below, plus `selectActiveRecord`, `selectActiveProfile`, `selectWardrobe`, `selectQuestionnaire`, `selectWishlistIds`, `selectSavedOutfits`, `selectReferenceImages`

- [ ] **Step 1: Rewrite the store**

`store/useAppStore.ts`. Keep the SSR-safe `buildStorage` / `noopStorage` block verbatim — it is load-bearing for the web build and must not be touched.

```ts
export interface AppState {
  profiles:        ProfileRecord[];
  activeProfileId: string | null;
  draft:           ProfileDraft | null;
  themeMode:       ThemeMode;
  hydrated:        boolean;
}

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
```

`clearRejections` is spec 2's, but it is one line and belongs with its siblings; including it here avoids a second pass over this file in task 6.

Implement two private helpers inside the module to keep the actions short:

```ts
/**
 * Applies `fn` to the active profile. When a draft is open the mutation is
 * routed there instead, which is what lets the onboarding screens keep calling
 * the same action names with no changes to their call sites.
 */
function mutateActive(
  s: AppState,
  fn: (record: ProfileRecord) => ProfileRecord,
): Partial<AppState> {
  if (!s.activeProfileId) return {};
  return {
    profiles: s.profiles.map((p) =>
      p.id === s.activeProfileId ? { ...fn(p), updatedAt: new Date().toISOString() } : p,
    ),
  };
}

function mutateDraftOrActive(
  s: AppState,
  onDraft: (draft: ProfileDraft) => ProfileDraft,
  onRecord: (record: ProfileRecord) => ProfileRecord,
): Partial<AppState> {
  if (s.draft) return { draft: onDraft(s.draft) };
  return mutateActive(s, onRecord);
}
```

The six draft-routed actions (`setSliders`, `toggleWord`, `addReferenceImages`, `removeReferenceImage`, `addWardrobeItems`, `removeWardrobeItem`) go through `mutateDraftOrActive`. `setStyleProfile`, the wishlist actions, and the outfit actions go through `mutateActive` only.

`commitDraft(profile)` — generates `id` as `` `profile-${Date.now()}` ``, calls `draftToRecord(draft, profile, id, new Date().toISOString())`, appends it, sets `activeProfileId`, clears `draft`, and returns the id. `Date.now()` is fine here (this is runtime, not a migration).

`deleteProfile(id)` — computes `nextActiveId(profiles, id, activeProfileId)` **before** filtering, then sets both `profiles` and `activeProfileId`.

`renameProfile(id, name)` — ignores a name that trims to empty.

`saveOutfit(productIds)` — appends `{ id: \`outfit-${Date.now()}\`, productIds, createdAt: new Date().toISOString() }`.

`resetEverything()` — `set({ profiles: [], activeProfileId: null, draft: null, themeMode: 'auto' })`.

`loadDemoData()` — builds one record from `DEMO_PROFILE` / `DEMO_WARDROBE` named `'Demo'`, replacing any existing profile named `'Demo'` rather than appending, and makes it active.

Persist config:

```ts
version: 2,
migrate: (persisted, version) =>
  (version < 2
    ? migrateV1ToV2(persisted as PersistedStateV1)
    : persisted) as unknown as AppStore,
partialize: (state) => ({
  profiles:        state.profiles,
  activeProfileId: state.activeProfileId,
  draft:           state.draft,
  themeMode:       state.themeMode,
}),
```

`name`, `storage` and `onRehydrateStorage` are unchanged.

- [ ] **Step 2: Create `store/selectors.ts`**

```ts
// store/selectors.ts — referentially stable reads over the profiles list.

import type { InspoImage, ProfileRecord, Questionnaire, SavedOutfit, StyleProfile, WardrobeItem } from '@/lib/types';
import { defaultSliders } from '@/lib/profileRecords';
import type { AppState } from '@/store/useAppStore';

// Stable identities. Returning a fresh [] here would give every render a new
// reference and re-trigger the useMemo chains in ClosetPane on every keystroke.
const EMPTY_WARDROBE: WardrobeItem[] = Object.freeze([]) as WardrobeItem[];
const EMPTY_IMAGES: InspoImage[] = Object.freeze([]) as InspoImage[];
const EMPTY_IDS: string[] = Object.freeze([]) as string[];
const EMPTY_OUTFITS: SavedOutfit[] = Object.freeze([]) as SavedOutfit[];
const EMPTY_QUESTIONNAIRE: Questionnaire = Object.freeze({
  sliders: defaultSliders(),
  words: [],
}) as Questionnaire;

export function selectActiveRecord(s: AppState): ProfileRecord | null {
  if (!s.activeProfileId) return null;
  return s.profiles.find((p) => p.id === s.activeProfileId) ?? null;
}

export function selectActiveProfile(s: AppState): StyleProfile | null {
  return selectActiveRecord(s)?.profile ?? null;
}

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

export function selectSavedOutfits(s: AppState): SavedOutfit[] {
  return selectActiveRecord(s)?.savedOutfits ?? EMPTY_OUTFITS;
}
```

`selectWardrobe`, `selectReferenceImages` and `selectQuestionnaire` read the draft first, mirroring the store's write routing — during onboarding the screens must see what they are entering, not the previous profile.

- [ ] **Step 3: Update the root gate**

`app/_layout.tsx`:
- `const profileCount = useAppStore((s) => s.profiles.length);`
- `const styleProfile = useAppStore(selectActiveProfile);`
- redirect condition becomes `if (profileCount === 0 && segments[0] !== 'onboarding')`
- `profileVibe` still reads `styleProfile?.vibe ?? null`

- [ ] **Step 4: Update the onboarding screens**

- `app/onboarding/index.tsx`: read images via `useAppStore(selectReferenceImages)`; `add` becomes `addReferenceImages`, `remove` becomes `removeReferenceImage`. Add an effect that calls `beginDraft('New style')` when `draft === null`, and a `TextInput` above the image grid bound to `draft?.name` writing through `updateDraftName`, labelled "Name this style".
- `app/onboarding/personality.tsx`: `questionnaire` comes from `useAppStore(selectQuestionnaire)`. `setSliders` / `toggleWord` are unchanged — the store routes them to the draft.
- `app/onboarding/wardrobe.tsx`: unchanged. It already holds URIs in local state and calls `addWardrobeItems` once.
- `app/onboarding/analyzing.tsx`: `questionnaire` from `selectQuestionnaire`, `images` from `selectReferenceImages`; replace `setProfile` with `commitDraft`. Guard the effect so it commits once — the existing `active` flag already covers the async race, but `commitDraft` must not be in the dependency array in a way that re-fires.

- [ ] **Step 5: Update the panes and product screen**

- `ExplorePane`: `selectActiveProfile`, `selectWardrobe`, `selectReferenceImages`. Behaviour otherwise unchanged (it is rewritten in task 6).
- `ClosetPane`: `selectWardrobe`, `selectActiveProfile`.
- `ProfilePane`: `selectActiveProfile`, `selectQuestionnaire`, `selectWishlistIds`; `resetOnboarding` → `resetEverything`.
- `app/product/[id].tsx`: `selectActiveProfile`, `selectWardrobe`; `savedProductIds.includes(id)` → `useAppStore((s) => selectWishlistIds(s).includes(id))`; `toggleSaved` → `toggleWishlist`.
- `components/ProductCard.tsx`: same two swaps. **This file is not in spec 1's table but reads `savedProductIds` — it must be updated or the build breaks.**

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS, PASS. No file outside `store/` should still reference `styleProfile`, `savedProductIds`, `inspoImages`, `toggleSaved`, or `resetOnboarding`:

```bash
grep -rn "savedProductIds\|toggleSaved\|resetOnboarding\|addInspoImages" --include=*.tsx --include=*.ts app components store lib
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add -A app components store lib
git commit -m "feat: hold multiple independent style profiles in the store"
```

---

### Task 3: Profile pane becomes the style screen

**Files:**
- Modify: `components/panes/ProfilePane.tsx`

**Interfaces:**
- Consumes: task 2's `profiles`, `activeProfileId`, `setActiveProfile`, `renameProfile`, `deleteProfile`, `beginDraft`, `addReferenceImages`, `removeReferenceImage`, `selectReferenceImages`, `selectSavedOutfits`
- Produces: nothing consumed elsewhere

- [ ] **Step 1: Add the Profiles section**

Above the existing "Your Style" heading, render a `Profiles` section:
- One row per profile. The row is a `Pressable` calling `setActiveProfile(p.id)`, showing a filled dot when active.
- Tapping the *name* of the already-active profile swaps it for a `TextInput`. On blur or submit, call `renameProfile(id, value)`; if the value trims to empty, revert to the previous name locally and do not call the store.
- A delete control per row calling `Alert.alert` with Cancel / Delete, `style: 'destructive'`, confirming before `deleteProfile(p.id)`.
- A `PrimaryButton` "+ New profile" that calls `beginDraft('New style')` then `router.push('/onboarding')`.

`Alert` is imported from `react-native`. On web, `Alert.alert` renders nothing in react-native-web — fall back to `window.confirm` when `Platform.OS === 'web'` so the delete path is testable in the browser.

- [ ] **Step 2: Replace "Redo onboarding" with "+ New profile"**

Remove the `resetEverything`-then-redirect button. Keep `loadDemoData` on the empty state.

- [ ] **Step 3: Add the Reference images section**

Between "Materials" and "Retune", an `ImagePickerGrid` with `max={8}`, `uris` from `selectReferenceImages`, `onAdd` mapping URIs into `InspoImage`s exactly as `app/onboarding/index.tsx` does, `onRemove` resolving the URI back to an id and calling `removeReferenceImage`.

Editing reference images does **not** re-run style analysis — that is explicitly out of scope in spec 1.

- [ ] **Step 4: Rename "Saved" to "Want" and add Saved outfits**

The existing "Saved" section becomes "Want", reading `selectWishlistIds`. Add a "Saved outfits" line showing `selectSavedOutfits(s).length`. Both are summary counts here; the full listings live in Closet (task 7).

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck`

```bash
git add components/panes/ProfilePane.tsx
git commit -m "feat: manage style profiles from the profile pane"
```

---

### Task 4: Pure deck logic

**Files:**
- Create: `lib/deck.ts`
- Create: `__tests__/deck.test.ts`

**Interfaces:**
- Consumes: `Product`, `StyleVector`, `Category` from `lib/types`; `styleScore`, `priceScore` from `lib/scoring`; `areCompatible` from `lib/compatibility`
- Produces: `Slot`, `REQUIRED_SLOTS`, `OPTIONAL_SLOTS`, `DECK_SLOT_ORDER`, `DeckOutfit`, `DeckContext`, `candidatesForSlot`, `buildOutfit`, `refillSlot`, `outfitProducts`, `outfitTotal`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/deck.test.ts`. Build a small fixture catalog (3–4 products per category, deliberately including one incompatible pairing) rather than using `ALL_PRODUCTS`, so the assertions are readable and stable.

```ts
import { buildOutfit, candidatesForSlot, refillSlot, outfitProducts, type DeckContext } from '@/lib/deck';
import { areCompatible } from '@/lib/compatibility';
```

Cases, one `it` each:
- `buildOutfit` fills `top`, `bottom` and `footwear`
- every pair in a built outfit satisfies `areCompatible`
- no product in `rejectedIds` appears in a built outfit
- `buildOutfit` is deterministic: two calls with the same context are deeply equal
- `refillSlot` changes only the named slot — the other slots are identical **by reference**
- `refillSlot` returns a different product in that slot than the one replaced
- `refillSlot` on an optional slot with no compatible candidate drops the slot and still returns a valid outfit
- `buildOutfit` returns `null` when the pool has no footwear at all
- `candidatesForSlot` returns only the requested category
- `candidatesForSlot` is a total order: ties break on `id` ascending

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- deck`
Expected: FAIL — `Cannot find module '@/lib/deck'`

- [ ] **Step 3: Implement `lib/deck.ts`**

```ts
// lib/deck.ts — pure outfit assembly for the Explore deck. No React/RN/Expo.

import type { Product, StyleVector } from '@/lib/types';
import { areCompatible } from '@/lib/compatibility';
import { priceScore, styleScore } from '@/lib/scoring';

export type Slot = 'top' | 'bottom' | 'footwear' | 'outerwear' | 'knitwear';

export const REQUIRED_SLOTS: readonly Slot[] = ['top', 'bottom', 'footwear'];
export const OPTIONAL_SLOTS: readonly Slot[] = ['outerwear', 'knitwear'];

/** Top-down render order. Absent slots collapse. */
export const DECK_SLOT_ORDER: readonly Slot[] = ['outerwear', 'top', 'knitwear', 'bottom', 'footwear'];

export interface DeckOutfit {
  slots: Partial<Record<Slot, Product>>;
}

export interface DeckContext {
  products: Product[];
  userVector: StyleVector;
  rejectedIds: string[];
  budgetCenter: number;
}

export function outfitProducts(outfit: DeckOutfit): Product[] {
  return DECK_SLOT_ORDER.flatMap((slot) => {
    const product = outfit.slots[slot];
    return product ? [product] : [];
  });
}

export function outfitTotal(outfit: DeckOutfit): number {
  return outfitProducts(outfit).reduce((sum, p) => sum + p.price, 0);
}

export function candidatesForSlot(ctx: DeckContext, slot: Slot): Product[] {
  const rejected = new Set(ctx.rejectedIds);
  return ctx.products
    .filter((p) => p.category === slot && !rejected.has(p.id))
    .sort((a, b) => {
      const scoreB = rank(ctx, b);
      const scoreA = rank(ctx, a);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

function rank(ctx: DeckContext, p: Product): number {
  return styleScore(ctx.userVector, p) + 0.2 * priceScore(p.price, ctx.budgetCenter);
}

function fitsWith(candidate: Product, placed: Product[]): boolean {
  return placed.every((other) => areCompatible(candidate, other));
}

export function buildOutfit(ctx: DeckContext): DeckOutfit | null {
  const slots: Partial<Record<Slot, Product>> = {};
  const placed: Product[] = [];

  for (const slot of REQUIRED_SLOTS) {
    const pick = candidatesForSlot(ctx, slot).find((p) => fitsWith(p, placed));
    if (!pick) return null;
    slots[slot] = pick;
    placed.push(pick);
  }

  for (const slot of OPTIONAL_SLOTS) {
    const pick = candidatesForSlot(ctx, slot).find((p) => fitsWith(p, placed));
    if (pick) {
      slots[slot] = pick;
      placed.push(pick);
    }
  }

  return { slots };
}

export function refillSlot(ctx: DeckContext, outfit: DeckOutfit, slot: Slot): DeckOutfit | null {
  const current = outfit.slots[slot];
  const others = DECK_SLOT_ORDER.filter((s) => s !== slot).flatMap((s) => {
    const p = outfit.slots[s];
    return p ? [p] : [];
  });

  const pick = candidatesForSlot(ctx, slot).find(
    (p) => p.id !== current?.id && fitsWith(p, others),
  );

  if (pick) return { slots: { ...outfit.slots, [slot]: pick } };
  if (REQUIRED_SLOTS.includes(slot)) return null;

  const next = { ...outfit.slots };
  delete next[slot];
  return { slots: next };
}
```

`buildOutfit` is greedy, not exhaustive: it can fail to find a valid outfit a full search would find. That is the accepted trade-off from spec 2 — the catalog is ~150–200 items with permissive rules, and a deck must feel instant. The `null` return is handled as an explicit empty state, not pretended away.

The `0.2` price weight keeps style dominant while still breaking ties toward sensible prices; it is not a tunable knob and should not be exposed.

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- deck && npm run typecheck`
Expected: PASS, PASS. `npm test -- purity` must also stay green.

- [ ] **Step 5: Commit**

```bash
git add lib/deck.ts __tests__/deck.test.ts
git commit -m "feat: assemble compatible catalog outfits for the explore deck"
```

---

### Task 5: Pill-driven pane navigation

Lands before the card deck so the card pan never competes with a paging ScrollView.

**Files:**
- Modify: `lib/pager.ts`
- Modify: `__tests__/pager.test.ts`
- Modify: `app/_layout.tsx`
- Rewrite: `app/index.tsx`
- Modify: `components/SwipeTabBar.tsx`

**Interfaces:**
- Consumes: existing `PANES`, `INITIAL_PANE_INDEX`, `clampIndex`
- Produces: `FLICK_VELOCITY`, `settleIndex(index, velocity, from)`, `dragIndex(from, translationX, slot)`

- [ ] **Step 1: Write the failing geometry tests**

Append to `__tests__/pager.test.ts`:

```ts
import { dragIndex, settleIndex } from '@/lib/pager';

describe('settleIndex', () => {
  it('rounds to the nearest pane below the flick threshold', () => {
    expect(settleIndex(1.4, 0, 1)).toBe(1);
    expect(settleIndex(1.6, 0, 1)).toBe(2);
  });

  it('advances on a rightward flick even from a short drag', () => {
    expect(settleIndex(1.1, 900, 1)).toBe(2);
  });

  it('goes back on a leftward flick', () => {
    expect(settleIndex(0.9, -900, 1)).toBe(0);
  });

  it('clamps flicks at either end', () => {
    expect(settleIndex(2, 900, 2)).toBe(2);
    expect(settleIndex(0, -900, 0)).toBe(0);
  });

  it('falls back to the initial pane when the position is unknown', () => {
    expect(settleIndex(Number.NaN, 0, 1)).toBe(INITIAL_PANE_INDEX);
  });
});

describe('dragIndex', () => {
  it('returns the origin for no movement', () => {
    expect(dragIndex(1, 0, 40)).toBe(1);
  });

  it('advances one pane per tab-slot dragged right', () => {
    expect(dragIndex(1, 40, 40)).toBe(2);
  });

  it('clamps at both ends', () => {
    expect(dragIndex(0, -400, 40)).toBe(0);
    expect(dragIndex(2, 400, 40)).toBe(2);
  });

  it('returns the origin before first layout', () => {
    expect(dragIndex(1, 80, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- pager`
Expected: FAIL — `dragIndex is not a function`

- [ ] **Step 3: Implement the geometry**

In `lib/pager.ts`, add `'worklet';` as the first statement of `clampIndex`, then append:

```ts
export const FLICK_VELOCITY = 500;

/**
 * Pane index a release settles on. `index` is the fractional position the drag
 * ended at, `velocity` is horizontal px/s (positive to the right), `from` is
 * the pane the drag started on. A fast flick commits to the adjacent pane even
 * when the drag covered less than half a slot.
 */
export function settleIndex(index: number, velocity: number, from: number): number {
  'worklet';
  if (!Number.isFinite(index)) return INITIAL_PANE_INDEX;
  if (velocity >= FLICK_VELOCITY) return clampIndex(from + 1);
  if (velocity <= -FLICK_VELOCITY) return clampIndex(from - 1);
  return clampIndex(index);
}

/**
 * Fractional pane position during a drag, clamped so the row cannot overscroll.
 * The pill follows the finger: dragging right selects a later pane. `slot` is
 * the tab-slot width, so a finger crossing one tab moves one full pane.
 */
export function dragIndex(from: number, translationX: number, slot: number): number {
  'worklet';
  if (slot <= 0) return from;
  return Math.min(PANES.length - 1, Math.max(0, from + translationX / slot));
}
```

The `'worklet'` directives are required: Reanimated's Babel plugin does not workletize functions imported across module boundaries, and these are called from the pan gesture's `onUpdate` / `onEnd` on the UI thread. Without them the first drag throws `Tried to synchronously call a non-worklet function on the UI thread`. The directive is a bare string literal, so `__tests__/purity.test.ts` stays green and Jest can still call the functions directly.

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- pager`
Expected: PASS

- [ ] **Step 5: Mount `GestureHandlerRootView`**

In `app/_layout.tsx`, wrap the contents of `RootLayout` — outside `RootLayoutInner`, so it also wraps the pre-hydration placeholder and the root view's layout does not shift when hydration flips:

```tsx
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutInner />
    </GestureHandlerRootView>
  );
}
```

Import from `react-native-gesture-handler`. The package is already a dependency but was never mounted, so every pan gesture in the app has been silently inert.

- [ ] **Step 6: Replace the pager's ScrollView with a translated row**

Rewrite `app/index.tsx`. Remove `useAnimatedRef`, `useAnimatedScrollHandler` and the `landOnExplore`/`scrollTo` dance.

```tsx
const PANE_SPRING = { damping: 22, stiffness: 190, mass: 0.7 } as const;
```

- `scrollX = useSharedValue(0)` — content offset in px, still passed to `SwipeTabBar` unchanged so its pill and glyph interpolations need no edits.
- `dragFrom = useSharedValue(INITIAL_PANE_INDEX)` — passed down so the gesture can record its origin without a JS round-trip.
- `selected` stays React state for `aria-selected`.
- `rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -scrollX.value }] }))`.
- The row is `<Animated.View style={[{ flex: 1, flexDirection: 'row', width: width * PANES.length }, rowStyle]}>` inside a `<View style={{ flex: 1, overflow: 'hidden' }}>`. The `overflow: 'hidden'` matters on web — without it the off-screen panes extend the document and produce a horizontal scrollbar.
- Landing effect: a `landed` ref guard, `scrollX.value = INITIAL_PANE_INDEX * width` on the first non-zero width. The ref exists so a window resize does not yank the user back to the middle pane.
- Resize effect: when `landed.current && width > 0`, `scrollX.value = selected * width`. Re-deriving from `selected` avoids tracking the previous width.
- `onSelect(index)`: `clampIndex`, `setSelected`, then `scrollX.value = reduceMotion ? next * width : withSpring(next * width, PANE_SPRING)`. Signature unchanged, so task 6's `onNavigateToPane` handoff needs no adjustment.

- [ ] **Step 7: Add the pan gesture to the tab bar**

`components/SwipeTabBar.tsx` gains `dragFrom: SharedValue<number>` and `reduceMotion: boolean` props. `reduceMotion` is passed from the pager rather than read from a second `useTheme()` call, so the two cannot diverge.

```tsx
const pan = Gesture.Pan()
  .activeOffsetX([-8, 8])
  .failOffsetY([-12, 12])
  .onBegin(() => {
    dragFrom.value = width > 0 ? scrollX.value / width : INITIAL_PANE_INDEX;
  })
  .onUpdate((e) => {
    scrollX.value = dragIndex(dragFrom.value, e.translationX, slot) * width;
  })
  .onEnd((e) => {
    const at = width > 0 ? scrollX.value / width : INITIAL_PANE_INDEX;
    runOnJS(onSelect)(settleIndex(at, e.velocityX, Math.round(dragFrom.value)));
  });
```

Wrap the existing container `View` (the one holding the pill and the tab row) in `<GestureDetector gesture={pan}>`. Do not put the gesture on the individual `Pressable`s — it must be able to start anywhere along the bar.

`activeOffsetX([-8, 8])` is what lets a tap fall through to the `Pressable` underneath: a tap never travels 8px, so the pan never activates and `onPress` fires normally. `failOffsetY([-12, 12])` releases the gesture when the user is actually scrolling the pane.

The drag is **not** disabled under `reduceMotion` — a drag is direct manipulation, not decoration, and disabling it would leave a reduced-motion user with no drag affordance. Only the settle spring in `onSelect` is suppressed.

Accessibility is unchanged: `accessibilityRole="tab"`, `accessibilityLabel`, `aria-selected`. The gesture adds no new interactive target and screen-reader users continue to tap.

- [ ] **Step 8: Verify and commit**

Run: `npm test && npm run typecheck`

```bash
git add lib/pager.ts __tests__/pager.test.ts app/_layout.tsx app/index.tsx components/SwipeTabBar.tsx
git commit -m "feat: drive pane changes from the tab bar so swipe is free for cards"
```

---

### Task 6: Explore card deck

**Files:**
- Create: `components/GarmentSwipeCard.tsx`
- Create: `components/StylePill.tsx`
- Rewrite: `components/panes/ExplorePane.tsx`
- Modify: `app/index.tsx` (pass `onNavigateToPane`)

**Interfaces:**
- Consumes: task 4's `lib/deck` exports; task 2's `toggleWishlist`, `rejectProduct`, `clearRejections`, `saveOutfit`, `setActiveProfile`, `selectActiveProfile`; task 5's `onSelect`
- Produces: `GarmentSwipeCard`, `StylePill`

- [ ] **Step 1: Build `GarmentSwipeCard`**

One swipeable garment row. Props:

```tsx
{
  product: Product;
  height: number;
  isCommitting: SharedValue<boolean>;
  reduceMotion: boolean;
  onSwipe: (direction: 'yes' | 'no') => void;
  onPress: () => void;
}
```

Layout mirrors `ProductCard`'s row: `GarmentArt` at `size={height - 16}`, name, brand, price.

Gesture:
- `Gesture.Pan().activeOffsetX([-12, 12])`, refusing to begin when `isCommitting.value` is true. A single pane-level `isCommitting` flag prevents two slots refilling against a stale outfit.
- Live: `translateX` follows the finger; rotation interpolates to ±8°; a YES badge (right, accent) and NO badge (left, muted) fade in past 25% of the threshold.
- `SWIPE_THRESHOLD = screenWidth * 0.28`, or `|velocityX| > 800`.
- Commit: animate off-screen over 180ms, then `runOnJS(onSwipe)(direction)`.
- Below threshold: spring back to 0.
- Under `reduceMotion`, the exit is an immediate swap rather than a 180ms slide; the drag itself still tracks the finger.

Tapping (not swiping) calls `onPress`, which opens `/product/[id]` — the existing detail screen is preserved.

- [ ] **Step 2: Build `StylePill`**

A centred pill showing the active profile's name with a chevron. Tapping opens a `Modal` (`transparent`, `animationType={reduceMotion ? 'none' : 'fade'}`) listing every profile with a dot on the active one, then a divider, then "Manage profiles".

- Selecting a profile calls `setActiveProfile(id)` and closes.
- "Manage profiles" closes, then calls `onNavigateToPane(PANES.findIndex((p) => p.id === 'profile'))`.

The panes are siblings inside the pager, not routes, so this cannot use `router.push`. Use `PANES.findIndex` rather than a bare `0` so the call survives a reorder.

- [ ] **Step 3: Rewrite `ExplorePane`**

Props: `{ onNavigateToPane?: (index: number) => void }`.

- Build `DeckContext` with `useMemo` from `ALL_PRODUCTS`, `profile.vector`, the active record's `rejectedIds`, and `budgetCenter: 120` (the constant already used across the app).
- Hold `outfit: DeckOutfit | null` in state, seeded from `buildOutfit(ctx)`. Rebuild when the active profile id changes.
- Render `DECK_SLOT_ORDER.filter((s) => outfit.slots[s])` as `GarmentSwipeCard`s.
- Row height: measured pane height divided by the number of visible slots, clamped to `[96, 140]`. No vertical scrolling — a card stack that scrolls reintroduces exactly the gesture ambiguity task 5 removed. If the clamp cannot fit every row, drop `knitwear` from display first, then `outerwear`.
- Footer: total price, `Save outfit`, `Shuffle`.
  - `Save outfit` calls `saveOutfit(outfitProducts(outfit).map((p) => p.id))` and swaps its label to "Saved" for ~1.2s.
  - `Shuffle` rebuilds the whole outfit without recording any judgement.
- Swipe handlers: left calls `rejectProduct(id)` then `refillSlot`; right calls `toggleWishlist(id)` then `refillSlot`. A right swipe does not reject, but the slot refills so the product will not immediately reappear.
- When `buildOutfit` or `refillSlot` returns `null`, render an `EmptyState` titled "You've seen everything for this style" with an action calling `clearRejections()`. Without this escape hatch a user who swipes left enough times bricks their own Explore pane.
- The intent chips, price chips and search box are removed. `rankProducts` and `INTENTS` stay in `lib/scoring.ts` — `app/product/[id].tsx` and ClosetPane's gap analysis still use the scoring module.

- [ ] **Step 4: Wire the pager**

In `app/index.tsx`, pass `<ExplorePane onNavigateToPane={onSelect} />`.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck`

```bash
git add components/GarmentSwipeCard.tsx components/StylePill.tsx components/panes/ExplorePane.tsx app/index.tsx
git commit -m "feat: swipe individual garments to build an outfit on explore"
```

---

### Task 7: Closet Want and Saved outfits

**Files:**
- Modify: `components/panes/ClosetPane.tsx`

**Interfaces:**
- Consumes: `selectWishlistIds`, `selectSavedOutfits`, `toggleWishlist`, `removeSavedOutfit`, `ALL_PRODUCTS`
- Produces: nothing consumed elsewhere

- [ ] **Step 1: Add the Want section**

After "Your pieces". Resolve `wishlistIds` against `ALL_PRODUCTS`; render each with the existing `ProductCard` and a remove action calling `toggleWishlist`. Header shows the count; when empty, explain that swiping right on Explore fills it.

A product id that no longer resolves is **skipped**, not thrown on. The catalog is generated deterministically from code, so this only happens if archetypes change between builds — but a stale persisted id must not crash the pane.

- [ ] **Step 2: Add the Saved outfits section**

Each `SavedOutfit` as a row of `GarmentArt` thumbnails with the total price and a remove action calling `removeSavedOutfit(id)`. This sits alongside the existing wardrobe-derived "Your outfits" grid, which is unchanged and still built from owned pieces.

- [ ] **Step 3: Confirm the analytics stay honest**

`outfitCount`, `categoryCoverage`, `colorBalance`, `formalitySpread` and `analyzeGaps` must continue to read `wardrobeItems` only. Wishlist items are wanted, not owned — folding them in would inflate every number on this pane. Verify by inspection that no `useMemo` in this file takes `wishlistIds` as an input.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run typecheck`

```bash
git add components/panes/ClosetPane.tsx
git commit -m "feat: show wanted pieces and saved outfits in the closet"
```

---

### Task 8: End-to-end browser verification

No unit tests cover gesture or animation behaviour — the repo has no React renderer. This task is the substitute, and it is not optional.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

The worktree has no local `node_modules`; a symlink to the main repo's is required or Metro emits an escaping `../../../` bundle path that 404s:

```bash
ls node_modules >/dev/null 2>&1 || ln -s ../../../node_modules node_modules
```

Then start the preview server on the worktree root.

- [ ] **Step 2: Walk a cold first run**

Clear persisted storage, reload. Expect a redirect to `/onboarding`. Name the profile, upload 3 images, answer the questionnaire, skip the wardrobe step, and land on Explore with a built outfit.

- [ ] **Step 3: Exercise the deck**

- Swipe a row right; confirm the row refills and the product appears under Want in Closet.
- Swipe a row left; confirm it refills and that product does not reappear after a Shuffle.
- Tap a row; confirm `/product/[id]` opens and Back returns to the deck.
- Save outfit; confirm the label flips to "Saved" and the outfit appears in Closet.
- Confirm the whole stack fits without vertical scrolling.

- [ ] **Step 4: Exercise navigation**

- Tap each tab; the row settles and `aria-selected` follows.
- Drag along the tab bar; panes track the finger and settle on release. **Dragging right must move toward Closet** — if it moves toward Profile, the sign in `dragIndex` is inverted.
- A short fast flick that never reaches the midpoint still commits to the next pane.
- A horizontal drag in the content area does nothing to the pager.
- No horizontal scrollbar on the document.

- [ ] **Step 5: Exercise multi-profile**

- Create a second profile from the Profile pane; confirm onboarding runs and returns to Explore with the new profile active.
- Switch profiles from the style pill; confirm the deck, wardrobe, Want list and saved outfits all change.
- Rename a profile inline; confirm an empty name reverts.
- Delete a profile; confirm the adjacent one becomes active. Delete the last one; confirm the redirect to onboarding.

- [ ] **Step 6: Check the console and the suite**

`npm test && npm run typecheck`, plus a console-log read for errors and warnings. Capture a screenshot of the deck for the user.

- [ ] **Step 7: Complete the branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work."
**REQUIRED SUB-SKILL:** superpowers:finishing-a-development-branch

---

## Notes carried from the specs

**Out of scope across all three specs.** Undoing a swipe. Vector learning from swipes. Re-running style analysis when reference images change. Redoing onboarding for an existing profile. Reordering profiles. Accessory slots in the deck. Checkout. Cloud sync. Keyboard arrow navigation between panes.

**Known accepted risks.** Greedy assembly can dead-end (mitigated by the exhaustion empty state). The v1→v2 migration is one-way. Image URIs live in the app cache and can be evicted by the OS — already true today, and components already fall back to procedural `GarmentArt`. Aggressive swiping can exhaust a category in one session; growing the catalog is a separate concern.

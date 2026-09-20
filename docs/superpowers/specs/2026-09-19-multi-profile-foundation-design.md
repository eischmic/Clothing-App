# Multi-Profile Foundation — Design

**Status:** approved for planning
**Date:** 2026-09-19
**Sequence:** spec 1 of 3. Specs 2 (Explore card stack) and 3 (pill-driven navigation) build on this one.

## Goal

Replace the app's single `styleProfile` with a list of independent style profiles. Each profile owns its own style vector, reference images, wardrobe, wishlist and saved outfits. The Profile pane becomes the style screen where profiles are created, renamed, edited and deleted.

## Why

The user wants to switch between distinct styles ("Work", "Weekend", "Gym") from the Explore screen. They chose **fully separate** profiles: switching changes not just recommendations but the whole world — wardrobe included. This is the foundation; nothing in specs 2 or 3 can be built until the store holds more than one profile.

## Decisions already made

These were settled during brainstorming and are not open for reinterpretation:

1. Profiles are **fully separate**, including the wardrobe. No data is shared between profiles except `themeMode`.
2. Creating a profile **runs the existing onboarding flow** scoped to that new profile.
3. The **Profile pane is the style screen** — list, create, edit, delete, reference images.
4. The style pill on Explore is built in spec 2, but the store API it needs is defined here.

## Data model

### New types

Added to `lib/types.ts`:

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
```

`StyleProfile` itself is **unchanged**. It keeps its own `questionnaire: Questionnaire | null` field; `ProfileRecord.questionnaire` is the live, editable copy that the Retune sliders write to, while `StyleProfile.questionnaire` remains the snapshot taken at analysis time. This duplication already exists today and is preserved rather than fixed, to keep this spec's blast radius small.

`wishlistIds` and `rejectedIds` hold **catalog product IDs** (`Product['id']`), not wardrobe item IDs.

### Store shape

`store/useAppStore.ts` becomes:

```ts
export interface AppState {
  profiles:        ProfileRecord[];
  activeProfileId: string | null;
  draft:           ProfileDraft | null;
  themeMode:       ThemeMode;
  hydrated:        boolean;
}
```

`themeMode` stays global — it is a device preference, not a style preference.

`activeProfileId` is `null` only when `profiles` is empty. Any action that deletes the active profile must reassign it (see Deletion below).

### Draft state

Onboarding needs somewhere to accumulate answers before a profile exists. Today it writes directly into the global store fields; with multiple profiles that would corrupt the active profile.

```ts
export interface ProfileDraft {
  name: string;
  questionnaire: Questionnaire;
  referenceImages: InspoImage[];
  wardrobeItems: WardrobeItem[];
}
```

`draft` is persisted, so a user who backgrounds the app mid-onboarding does not lose their uploads.

### Actions

```ts
export interface AppActions {
  // profile lifecycle
  beginDraft:        (name: string) => void;
  updateDraftName:   (name: string) => void;
  commitDraft:       (profile: StyleProfile) => string;  // returns new profile id
  discardDraft:      () => void;

  setActiveProfile:  (id: string) => void;
  renameProfile:     (id: string, name: string) => void;
  deleteProfile:     (id: string) => void;

  // active-profile mutations
  setSliders:        (sliders: Partial<Record<SliderKey, number>>) => void;
  toggleWord:        (word: StyleWord) => void;
  addReferenceImages:(images: InspoImage[]) => void;
  removeReferenceImage: (id: string) => void;
  addWardrobeItems:  (items: WardrobeItem[]) => void;
  removeWardrobeItem:(id: string) => void;
  setStyleProfile:   (profile: StyleProfile) => void;

  toggleWishlist:    (productId: string) => void;
  rejectProduct:     (productId: string) => void;
  saveOutfit:        (productIds: string[]) => void;
  removeSavedOutfit: (id: string) => void;

  setThemeMode:      (mode: ThemeMode) => void;
  resetEverything:   () => void;
  loadDemoData:      () => void;
}
```

**Routing rule for mutations.** Every action in the "active-profile mutations" block writes to the profile identified by `activeProfileId` — *unless* `draft !== null`, in which case `setSliders`, `toggleWord`, `addReferenceImages`, `removeReferenceImage`, `addWardrobeItems` and `removeWardrobeItem` write to the draft instead. This lets the existing onboarding screens keep calling the same action names with no changes to their call sites.

`commitDraft(profile)` turns the draft into a `ProfileRecord`, appends it to `profiles`, sets it active, clears `draft`, and returns the new ID.

`toggleWishlist`, `rejectProduct`, `saveOutfit` and `removeSavedOutfit` are defined here but only consumed in spec 2. Spec 2 adds one further action, `clearRejections()`, which is deliberately left out of this spec — it exists only to serve that spec's deck-exhaustion empty state and has no meaning without it.

`rejectProduct` also removes the ID from `wishlistIds` if present, so a product cannot be both wanted and rejected. `toggleWishlist` likewise removes it from `rejectedIds`.

`resetEverything` replaces today's `resetOnboarding`: it clears all profiles, the draft and `activeProfileId`, returning the app to first-run.

`loadDemoData` creates a single profile named "Demo" from `DEMO_PROFILE` / `DEMO_WARDROBE` and makes it active. If a profile named "Demo" already exists it is replaced, so repeated taps don't accumulate duplicates.

### Selectors

To keep components from repeatedly writing `profiles.find(p => p.id === activeProfileId)`, add `store/selectors.ts`:

```ts
export function selectActiveRecord(s: AppState): ProfileRecord | null;
export function selectActiveProfile(s: AppState): StyleProfile | null;
export function selectWardrobe(s: AppState): WardrobeItem[];
export function selectQuestionnaire(s: AppState): Questionnaire;
export function selectWishlistIds(s: AppState): string[];
export function selectSavedOutfits(s: AppState): SavedOutfit[];
```

These are plain functions over `AppState`, used as `useAppStore(selectActiveProfile)`.

**Referential stability matters.** `selectWardrobe` must return the stored array reference (`record?.wardrobeItems ?? EMPTY`) and never a fresh `[]` literal, or every render produces a new identity and re-triggers the `useMemo` chains in ClosetPane. Export a module-level frozen `EMPTY` array and return that for the null case. The same rule applies to `selectWishlistIds` and `selectSavedOutfits`.

## Migration

Store `version` goes from `1` to `2`.

`lib/stateMigration.ts` gains:

```ts
export function migrateV1ToV2(state: PersistedStateV1): PersistedStateV2;
```

Behaviour:

- If `state.styleProfile` is null or absent → `{ profiles: [], activeProfileId: null, draft: null, themeMode }`. The user lands on onboarding, which is correct for someone who never finished it.
- Otherwise build exactly one `ProfileRecord`:
  - `id`: `'profile-1'` (deterministic — a migration must not depend on `Date.now()` or randomness, so the same persisted blob always migrates to the same result and the function is testable)
  - `name`: `'My style'`
  - `profile`: the existing `styleProfile`, passed through today's `normalizePersistedState` array-filling logic
  - `questionnaire`: the existing top-level `questionnaire`
  - `referenceImages`: the existing `inspoImages`
  - `wardrobeItems`: the existing `wardrobeItems`
  - `wishlistIds`: the existing `savedProductIds`
  - `rejectedIds`: `[]`
  - `savedOutfits`: `[]`
  - `createdAt` / `updatedAt`: `styleProfile.createdAt` / `styleProfile.updatedAt`, falling back to the epoch string `'1970-01-01T00:00:00.000Z'` if absent
- `activeProfileId` is set to that record's ID.

The existing `normalizePersistedState` is retained and called *by* `migrateV1ToV2` for the inner profile, so the array-filling defences are not lost.

Zustand's `migrate` receives `(persistedState, version)`. Dispatch on version: `version === 0 || version === 1` → run `migrateV1ToV2`; anything else passes through.

## Screens

### Profile pane becomes the style screen

`components/panes/ProfilePane.tsx` gains a profiles section at the top, above the existing "Your Style" content:

```
Profiles
  ( * Work     )  [rename] [delete]
  (   Weekend  )  [rename] [delete]
  (   Gym      )  [rename] [delete]
  [ + New profile ]

--- everything below operates on the active profile ---
Your Style          tags
Palette             dominant colours
Style signature     radar
Reference images    <- new, grid with add/remove
Silhouettes
Materials
Retune              sliders + words
Theme               auto + vibes
Want                wishlist count, links to Closet
Saved outfits       count, links to Closet
```

- Tapping a profile row makes it active.
- Rename is inline: tapping the name turns it into a `TextInput`. Empty names are rejected — the field reverts to the previous name on blur.
- Delete asks for confirmation via `Alert.alert`. Deleting the last profile is allowed and drops the user back to onboarding through the root gate.
- **Reference images** is a new section using the existing `ImagePickerGrid`, wired to `addReferenceImages` / `removeReferenceImage`, capped at 8 to match onboarding.

Editing reference images does **not** re-run style analysis in this spec. The images are stored and displayed; recomputing the vector from them is explicitly out of scope (see Out of scope).

The existing "Redo onboarding" button is replaced by "+ New profile", which starts a draft and navigates to `/onboarding`. Redoing onboarding for an *existing* profile is out of scope.

### Deletion

When `deleteProfile(id)` removes the active profile:
- If other profiles remain, the one at the same index (or the last one, if the deleted profile was last) becomes active.
- If none remain, `activeProfileId` becomes `null` and the root gate sends the user to onboarding.

### Onboarding

`app/onboarding/*` screens keep their current structure. Changes:

- `app/onboarding/index.tsx` calls `beginDraft('New style')` on mount **if `draft === null`**, so re-entering mid-flow does not wipe progress.
- `app/onboarding/analyzing.tsx` calls `commitDraft(profile)` instead of `setStyleProfile(profile)`, then `router.replace('/')`.
- A name field is added to the first onboarding step so the profile is named before it is created. It is pre-filled with `'New style'` and writes through `updateDraftName`.
- Abandoning onboarding leaves the draft in place; it resumes next time.

### Root gate

`app/_layout.tsx` changes its redirect condition from `styleProfile === null` to `profiles.length === 0`.

The theme currently reads `styleProfile?.vibe`; it now reads the active record's `profile.vibe` via `selectActiveProfile`.

## Components touched

Every component that reads `styleProfile`, `wardrobeItems`, `questionnaire`, `inspoImages` or `savedProductIds` must move to the selectors:

| File | Reads today | Becomes |
|---|---|---|
| `app/_layout.tsx` | `styleProfile` | `selectActiveProfile` |
| `components/panes/ExplorePane.tsx` | `styleProfile`, `wardrobeItems`, `inspoImages` | selectors |
| `components/panes/ProfilePane.tsx` | `styleProfile`, `questionnaire`, `savedProductIds` | selectors + profiles list |
| `components/panes/ClosetPane.tsx` | `wardrobeItems`, `styleProfile` | selectors |
| `app/product/[id].tsx` | `styleProfile`, `wardrobeItems`, `savedProductIds` | selectors |
| `app/onboarding/index.tsx` | `inspoImages` | draft-routed actions |
| `app/onboarding/personality.tsx` | `questionnaire` | draft-routed actions |
| `app/onboarding/wardrobe.tsx` | `wardrobeItems` | draft-routed actions |
| `app/onboarding/analyzing.tsx` | `inspoImages`, `questionnaire`, `setStyleProfile` | draft + `commitDraft` |

ExplorePane is rewritten wholesale in spec 2; here it only needs the minimal selector swap to keep compiling and working.

## Testing

`lib/` must stay free of React/RN/Expo imports (`__tests__/purity.test.ts`). The migration lives in `lib/stateMigration.ts` and is pure, so it is fully unit-testable.

New tests in `__tests__/stateMigration.test.ts`:

- v1 state with a profile produces exactly one record, named "My style", with `savedProductIds` landing in `wishlistIds` and `inspoImages` in `referenceImages`
- v1 state with `styleProfile: null` produces zero profiles and a null `activeProfileId`
- migration is deterministic: the same input twice produces deeply equal output, including IDs
- a v1 profile missing `tags` / `vibes` / `dominantColors` arrays still yields those as empty arrays

New tests in `__tests__/profileRecords.test.ts` for pure helpers extracted to `lib/profileRecords.ts`:

```ts
export function nextActiveId(profiles: ProfileRecord[], deletedId: string, currentActive: string | null): string | null;
export function withWishlistToggled(record: ProfileRecord, productId: string): ProfileRecord;
export function withProductRejected(record: ProfileRecord, productId: string): ProfileRecord;
```

Keeping this logic in `lib/` rather than inline in the store is what makes it testable — the store itself has no test coverage today and this spec does not add a store test harness.

Cases: deleting a middle profile activates the next one; deleting the last profile in the list activates the new last; deleting the only profile yields `null`; toggling wishlist twice returns to the original ID set; rejecting a wishlisted product removes it from the wishlist.

## Out of scope

- The Explore card stack, the style pill, and Want / Saved-outfit rendering in Closet (spec 2)
- Pill-driven pane navigation (spec 3)
- Re-running style analysis when reference images change
- Redoing onboarding for an existing profile
- Cloud sync or any backend involvement; reference images stay as local URIs
- Reordering profiles

## Risks

**Image URIs across profiles.** `expo-image-picker` returns file URIs into the app's cache directory. These can be evicted by the OS. This is already true today for wardrobe and inspiration images; multiplying profiles multiplies the exposure but introduces no new failure mode. Components already handle `uri: null` by rendering procedural `GarmentArt`, and broken URIs degrade to the same empty box they do today.

**Migration is one-way.** A user who migrates to v2 and then installs an older build will find their profile gone, because v1 reads `styleProfile` which no longer exists. Acceptable for a hackathon project with no release channel.

**Store size.** Every profile carries a full wardrobe. Five profiles with twenty items each is well within AsyncStorage's practical limits, since only URIs and metadata are stored, never image bytes.

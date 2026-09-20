# Three-Tab Swipe Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace FitLab's five-tab bar with three swipeable panes — Profile, Explore, Closet — behind an icon-only tab bar.

**Architecture:** One route (`app/index.tsx`) hosts a horizontal `Animated.ScrollView` with `pagingEnabled`, holding three pane components side by side at window width. A shared `scrollX` value drives both the pane position and the tab bar's indicator, so the bar tracks the finger mid-drag. The `app/(tabs)` route group is deleted; the panes are components, not routes.

**Tech Stack:** Expo SDK 57, Expo Router 57, React Native 0.86, `react-native-reanimated` 4.5, `react-native-safe-area-context`, `react-native-svg`, `expo-haptics`, Zustand. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-19-three-tab-swipe-design.md`

## Global Constraints

- **No new dependencies.** Everything needed is already in `package.json`.
- **`lib/` stays pure.** `__tests__/purity.test.ts` fails the build if any file under `lib/` imports `react`, `react-native`, or anything starting with `expo`. `lib/pager.ts` must import nothing.
- **Imports use the `@/` alias**, e.g. `@/lib/pager`, `@/theme/useTheme`. Configured in `tsconfig.json` paths and understood by Jest.
- **Tab bar shows icons only.** No visible text labels. Labels exist only as `accessibilityLabel`.
- **Tab order is fixed:** Profile (index 0, person icon), Explore (index 1, compass icon), Closet (index 2, hanger icon). Explore is the landing pane.
- **Only `lib/` and `theme/` are unit-tested** in this repo — all 18 existing test files are pure-function tests and there is no React renderer in `devDependencies`. Component tasks are gated on `npm run typecheck` plus browser verification, not on unit tests. Do not add a component test framework.
- **Existing tests must stay green and unmodified.** Run `npm test` at every commit.
- **Read the versioned Expo docs** at https://docs.expo.dev/versions/v57.0.0/ before changing router or Expo API usage (project rule in `AGENTS.md`).

---

### Task 1: Pager geometry module

Pure constants and index math for the pager, kept out of the component so they can be tested.

**Files:**
- Create: `lib/pager.ts`
- Test: `__tests__/pager.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Pane { id: PaneId; label: string }`
  - `type PaneId = 'profile' | 'explore' | 'closet'`
  - `const PANES: readonly Pane[]` — length 3, in tab order
  - `const INITIAL_PANE_INDEX: number` — `1`
  - `function clampIndex(index: number): number` — rounds, clamps to `0..PANES.length - 1`, and returns `INITIAL_PANE_INDEX` for non-finite input

- [ ] **Step 1: Write the failing test**

Create `__tests__/pager.test.ts`:

```ts
import { PANES, INITIAL_PANE_INDEX, clampIndex } from '@/lib/pager';

describe('PANES', () => {
  it('is profile, explore, closet in tab order', () => {
    expect(PANES.map((pane) => pane.id)).toEqual(['profile', 'explore', 'closet']);
  });

  it('gives every pane a screen-reader label', () => {
    expect(PANES.map((pane) => pane.label)).toEqual(['Profile', 'Explore', 'Closet']);
  });
});

describe('INITIAL_PANE_INDEX', () => {
  it('lands on the middle pane', () => {
    expect(INITIAL_PANE_INDEX).toBe(1);
    expect(PANES[INITIAL_PANE_INDEX].id).toBe('explore');
  });
});

describe('clampIndex', () => {
  it('rounds to the nearest pane', () => {
    expect(clampIndex(0.4)).toBe(0);
    expect(clampIndex(0.6)).toBe(1);
    expect(clampIndex(1.5)).toBe(2);
  });

  it('clamps past either end', () => {
    expect(clampIndex(-3)).toBe(0);
    expect(clampIndex(9)).toBe(2);
  });

  it('falls back to the initial pane when width is unknown', () => {
    expect(clampIndex(Number.NaN)).toBe(INITIAL_PANE_INDEX);
    expect(clampIndex(Number.POSITIVE_INFINITY)).toBe(INITIAL_PANE_INDEX);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/pager.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pager'`.

- [ ] **Step 3: Write the implementation**

Create `lib/pager.ts`:

```ts
export type PaneId = 'profile' | 'explore' | 'closet';

export interface Pane {
  id: PaneId;
  /** Spoken by screen readers. The tab bar renders icons only. */
  label: string;
}

export const PANES: readonly Pane[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'explore', label: 'Explore' },
  { id: 'closet', label: 'Closet' },
];

export const INITIAL_PANE_INDEX = 1;

/**
 * Scroll offset divided by window width is NaN before the first layout on web,
 * so a non-finite index falls back to the landing pane rather than 0.
 */
export function clampIndex(index: number): number {
  if (!Number.isFinite(index)) return INITIAL_PANE_INDEX;
  return Math.min(PANES.length - 1, Math.max(0, Math.round(index)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/pager.test.ts && npm run typecheck`
Expected: PASS, 6 tests. Typecheck exits 0.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. `purity.test.ts` still passes — `lib/pager.ts` imports nothing.

- [ ] **Step 6: Commit**

```bash
git add lib/pager.ts __tests__/pager.test.ts
git commit -m "feat: add pager geometry module"
```

---

### Task 2: Compass icon and the swipe tab bar

The icon-only bar. Its indicator and icon colours read `scrollX` directly so they animate continuously while the user drags, rather than snapping when the gesture ends.

**Files:**
- Modify: `components/TabIcons.tsx` — add `CompassIcon`, update the file header comment
- Create: `components/SwipeTabBar.tsx`

**Interfaces:**
- Consumes: `PANES` from `@/lib/pager`; `ProfileIcon` and `WardrobeIcon`, which already exist in `components/TabIcons.tsx` unchanged.
- Produces: `function SwipeTabBar(props: { scrollX: SharedValue<number>; width: number; selected: number; onSelect: (index: number) => void }): React.JSX.Element`
  - `scrollX` — live horizontal scroll offset in px
  - `width` — one pane's width in px
  - `selected` — settled pane index, used only for `accessibilityState`
  - `onSelect` — called with the tapped index

Note: `HomeIcon`, `FitsIcon`, and `ExploreIcon` are still imported by `app/(tabs)/_layout.tsx` at this point. They are deleted in Task 6, not here.

- [ ] **Step 1: Add `CompassIcon` to `components/TabIcons.tsx`**

Change the file header comment from:

```tsx
// components/TabIcons.tsx — simple SVG glyphs for the five tab bar items.
```

to:

```tsx
// components/TabIcons.tsx — simple SVG glyphs for the three tab bar items.
```

Then append this function to the end of the file:

```tsx
export function CompassIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={1.75} />
      <Path
        d="M15.4 8.6l-2 4.8-4.8 2 2-4.8 4.8-2z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
```

`Svg`, `Path`, and `Circle` are already imported at the top of the file, and `IconProps` is already declared there. Do not re-declare them.

- [ ] **Step 2: Create `components/SwipeTabBar.tsx`**

```tsx
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { PANES, type PaneId } from '@/lib/pager';
import { useTheme } from '@/theme/useTheme';
import { CompassIcon, ProfileIcon, WardrobeIcon } from '@/components/TabIcons';

type Glyph = (props: { color: string; size?: number }) => React.JSX.Element;

const GLYPHS: Record<PaneId, Glyph> = {
  profile: ProfileIcon,
  explore: CompassIcon,
  closet: WardrobeIcon,
};

const ICON_SIZE = 24;
const BAR_HEIGHT = 52;
const PILL_WIDTH = 26;
const PILL_HEIGHT = 3;

function TabGlyph({
  index,
  scrollX,
  width,
  Icon,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  Icon: Glyph;
}) {
  const { base, accent } = useTheme();

  // The active copy fades in as its pane approaches, so the colour crossfades
  // with the drag instead of flipping when the gesture settles.
  const activeStyle = useAnimatedStyle(() => {
    const progress = width > 0 ? scrollX.value / width : index;
    return {
      opacity: interpolate(
        progress,
        [index - 1, index, index + 1],
        [0, 1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <View style={{ width: ICON_SIZE, height: ICON_SIZE }}>
      <Icon color={base.textLow} size={ICON_SIZE} />
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, activeStyle]}>
        <Icon color={accent.base} size={ICON_SIZE} />
      </Animated.View>
    </View>
  );
}

export function SwipeTabBar({
  scrollX,
  width,
  selected,
  onSelect,
}: {
  scrollX: SharedValue<number>;
  width: number;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { base, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const slot = width / PANES.length;

  const pillStyle = useAnimatedStyle(() => {
    const progress = width > 0 ? scrollX.value / width : 0;
    return { transform: [{ translateX: progress * slot + (slot - PILL_WIDTH) / 2 }] };
  });

  return (
    <View
      style={{
        backgroundColor: base.elev1,
        borderTopColor: base.hairline,
        borderTopWidth: 1,
        paddingBottom: insets.bottom,
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: PILL_WIDTH,
            height: PILL_HEIGHT,
            borderRadius: PILL_HEIGHT,
            backgroundColor: accent.base,
          },
          pillStyle,
        ]}
      />
      <View style={{ flexDirection: 'row' }}>
        {PANES.map((pane, index) => (
          <Pressable
            key={pane.id}
            accessibilityRole="tab"
            accessibilityLabel={pane.label}
            accessibilityState={{ selected: selected === index }}
            onPress={() => {
              if (Platform.OS !== 'web') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              onSelect(index);
            }}
            style={{ flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
          >
            <TabGlyph index={index} scrollX={scrollX} width={width} Icon={GLYPHS[pane.id]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck && npm test`
Expected: both exit 0. `SwipeTabBar` is not rendered by anything yet, so the app is unchanged.

If TypeScript rejects `Extrapolation` or `interpolate` from `react-native-reanimated`, check the installed version's exports rather than guessing — Reanimated 4.5 exports both from the package root.

- [ ] **Step 4: Commit**

```bash
git add components/TabIcons.tsx components/SwipeTabBar.tsx
git commit -m "feat: add compass icon and icon-only swipe tab bar"
```

---

### Task 3: Explore pane

The smallest of the three conversions: the existing Explore screen becomes a named component and drops its route parameters, because the intent chips now live on the same screen as everything that used to link to them.

**Files:**
- Create: `components/panes/ExplorePane.tsx`
- Leave `app/(tabs)/explore.tsx` in place — Task 6 deletes it.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `function ExplorePane(): React.JSX.Element`, a default-intent (`'surprise'`) Explore screen with no props.

- [ ] **Step 1: Create `components/panes/ExplorePane.tsx`**

This is `app/(tabs)/explore.tsx` with three changes: a named export instead of a default one, `useLocalSearchParams` and its syncing `useEffect` removed, and `intentId` initialised to `'surprise'`.

```tsx
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { INTENTS, type IntentId, rankProducts } from '@/lib/scoring';
import { Chip, EmptyState, SectionHeader } from '@/components/primitives';
import { ProductCard } from '@/components/ProductCard';

export function ExplorePane() {
  const { base, type, spacing } = useTheme();
  const inspoImages = useAppStore((s) => s.inspoImages);
  const profile = useAppStore((s) => s.styleProfile);
  const wardrobe = useAppStore((s) => s.wardrobeItems);
  const [intentId, setIntentId] = useState<IntentId>('surprise');
  const [search, setSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  const results = useMemo(() => {
    if (!profile) return [];
    const candidates = ALL_PRODUCTS.filter(
      (p) =>
        (!maxPrice || p.price <= maxPrice) &&
        `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
    );
    return rankProducts({
      userVector: profile.vector,
      wardrobe,
      inspoImages,
      products: candidates,
      intentId,
      budgetCenter: 120,
      limit: 12,
    });
  }, [profile, wardrobe, inspoImages, intentId, search, maxPrice]);

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
        <EmptyState
          title="No style profile yet"
          body="Finish onboarding so we can rank pieces for you."
          action="Start onboarding"
          onAction={() => router.replace('/onboarding' as never)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        stickyHeaderIndices={[0]}
      >
        <View style={{ backgroundColor: base.canvas, paddingBottom: spacing.sm }}>
          <Text style={[type.display, { color: base.textHi }]}>Explore</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search pieces, brands, styles"
            placeholderTextColor={base.textLow}
            accessibilityLabel="Search products"
            style={[
              type.body,
              {
                color: base.textHi,
                borderColor: base.hairline,
                borderWidth: 1,
                borderRadius: 14,
                padding: spacing.sm,
                marginTop: spacing.sm,
              },
            ]}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}
          >
            {INTENTS.map((x) => (
              <Chip
                key={x.id}
                label={x.label}
                selected={intentId === x.id}
                onPress={() => setIntentId(x.id)}
              />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Chip
              label="Under $100"
              selected={maxPrice === 100}
              onPress={() => setMaxPrice(maxPrice === 100 ? null : 100)}
            />
            <Chip
              label="Under $200"
              selected={maxPrice === 200}
              onPress={() => setMaxPrice(maxPrice === 200 ? null : 200)}
            />
            <Chip label="Any" selected={maxPrice === null} onPress={() => setMaxPrice(null)} />
          </View>
        </View>
        <SectionHeader title={`${results.length} recommendations`} />
        {results.length ? (
          results.map((rec) => (
            <ProductCard
              key={rec.product.id}
              recommendation={rec}
              onPress={() => router.push(`/product/${rec.product.id}` as never)}
            />
          ))
        ) : (
          <EmptyState title="No pieces found" body="Try a different intent, search, or price range." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm test`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/panes/ExplorePane.tsx
git commit -m "feat: extract explore pane from the explore route"
```

---

### Task 4: Profile pane

Merges the old Home screen (style identity) and the old Profile screen (controls) into one scroll: who you are on top, the knobs underneath. The old Home screen's intent chips and its "N pieces · N possible outfits" link are dropped — Explore and Closet now own that data.

**Files:**
- Create: `components/panes/ProfilePane.tsx`
- Leave `app/(tabs)/index.tsx` and `app/(tabs)/profile.tsx` in place — Task 6 deletes both.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `function ProfilePane(): React.JSX.Element`, no props.

- [ ] **Step 1: Create `components/panes/ProfilePane.tsx`**

```tsx
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { Chip, EmptyState, PrimaryButton, SectionHeader, Slider, Surface } from '@/components/primitives';
import { STYLE_WORDS, VIBE_NAMES, type SliderKey } from '@/lib/types';
import { composeStyleVector } from '@/lib/vector';
import { RadarChart } from '@/components/RadarChart';
import { PaletteRow } from '@/components/PaletteRow';
import { GarmentArt } from '@/components/GarmentArt';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';

const SLIDERS: Array<[SliderKey, string, string]> = [
  ['minimalExpressive', 'Minimal', 'Expressive'],
  ['classicTrendy', 'Classic', 'Trendy'],
  ['formalCasual', 'Formal', 'Casual'],
  ['practicalFashion', 'Practical', 'Fashion-forward'],
  ['neutralColorful', 'Neutral', 'Colourful'],
];

export function ProfilePane() {
  const { base, accent, type, spacing, mode, setMode } = useTheme();
  const styleProfile = useAppStore((s) => s.styleProfile);
  const questionnaire = useAppStore((s) => s.questionnaire);
  const setSliders = useAppStore((s) => s.setSliders);
  const toggleWord = useAppStore((s) => s.toggleWord);
  const setProfile = useAppStore((s) => s.setStyleProfile);
  const reset = useAppStore((s) => s.resetOnboarding);
  const loadDemo = useAppStore((s) => s.loadDemoData);
  const saved = useAppStore((s) => s.savedProductIds);

  const updateSlider = (key: SliderKey, value: number) => {
    const sliders = { ...questionnaire.sliders, [key]: value };
    setSliders({ [key]: value });
    if (styleProfile) {
      setProfile({
        ...styleProfile,
        vector: composeStyleVector([], { ...questionnaire, sliders }),
        questionnaire: { ...questionnaire, sliders },
        updatedAt: new Date().toISOString(),
      });
    }
  };

  if (!styleProfile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
        <EmptyState
          title="No style profile yet"
          body="Answer a few questions and we’ll shape your wardrobe."
          action="Start onboarding"
          onAction={() => router.replace('/onboarding' as never)}
        />
        <PrimaryButton label="Load demo data" variant="ghost" onPress={loadDemo} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        <Text style={[type.display, { color: base.textHi }]}>Your Style</Text>
        <Text style={[type.body, { color: accent.bright, marginTop: 4 }]}>
          {styleProfile.tags.join(' · ')}
        </Text>

        <SectionHeader title="Palette" />
        <PaletteRow colors={styleProfile.dominantColors} />

        <SectionHeader title="Style signature" />
        <Surface level={2}>
          <RadarChart vector={styleProfile.vector} />
        </Surface>

        <SectionHeader title="Silhouettes" />
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {styleProfile.silhouettes.map((x) => (
            <Chip key={x} label={x} />
          ))}
        </View>

        <SectionHeader title="Materials" />
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {styleProfile.materials.map((x) => (
            <Chip key={x} label={x} />
          ))}
        </View>

        <SectionHeader title="Retune" />
        {SLIDERS.map(([key, left, right]) => (
          <Slider
            key={key}
            value={questionnaire.sliders[key]}
            onChange={(value) => updateSlider(key, value)}
            leftLabel={left}
            rightLabel={right}
          />
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
          {STYLE_WORDS.map((word) => (
            <Chip
              key={word}
              label={word}
              selected={questionnaire.words.includes(word)}
              onPress={() => toggleWord(word)}
            />
          ))}
        </View>

        <SectionHeader title="Theme" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Chip label="Auto" selected={mode === 'auto'} onPress={() => setMode('auto')} />
          {VIBE_NAMES.map((vibe) => (
            <Chip key={vibe} label={vibe} selected={mode === vibe} onPress={() => setMode(vibe)} />
          ))}
        </View>

        <SectionHeader title="Saved" />
        {saved.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {ALL_PRODUCTS.filter((p) => saved.includes(p.id)).map((p) => (
              <View key={p.id}>
                <GarmentArt category={p.category} color={p.color} size={82} />
                <Text style={[type.caption, { color: base.textMid }]}>{p.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[type.body, { color: base.textLow }]}>
            Save recommendations to find them here.
          </Text>
        )}

        <PrimaryButton
          label="Redo onboarding"
          variant="ghost"
          onPress={() => {
            reset();
            router.replace('/onboarding' as never);
          }}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm test`
Expected: both exit 0.

If `PrimaryButton` does not accept a `variant` or `style` prop, read `components/primitives/PrimaryButton.tsx` and match its real signature — `app/(tabs)/profile.tsx` uses both today, so they should exist.

- [ ] **Step 3: Commit**

```bash
git add components/panes/ProfilePane.tsx
git commit -m "feat: merge home and profile screens into the profile pane"
```

---

### Task 5: Closet pane

Merges Wardrobe and Fits. The outfit count leads, because that is the number the demo points at.

**Files:**
- Create: `components/panes/ClosetPane.tsx`
- Leave `app/(tabs)/wardrobe.tsx` and `app/(tabs)/fits.tsx` in place — Task 6 deletes both.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `function ClosetPane(): React.JSX.Element`, no props.

- [ ] **Step 1: Create `components/panes/ClosetPane.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { analyzeGaps, categoryCoverage, colorBalance, formalitySpread } from '@/lib/gaps';
import { buildEdges, countOutfits, enumerateOutfits } from '@/lib/outfits';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { COLOR_FAMILIES, type ColorFamily } from '@/lib/types';
import { wardrobeItemsFromAnalysis } from '@/lib/wardrobeImport';
import { CoverageBars } from '@/components/CoverageBars';
import { GapCard } from '@/components/GapCard';
import { GarmentArt } from '@/components/GarmentArt';
import { ImagePickerGrid } from '@/components/ImagePickerGrid';
import { OutfitGraph } from '@/components/OutfitGraph';
import { Chip, EmptyState, SectionHeader, Surface } from '@/components/primitives';
import { WardrobeItemCard } from '@/components/WardrobeItemCard';

const FAMILY_HEX: Record<ColorFamily, string> = {
  neutral: '#8C8A86',
  warm: '#D87834',
  cool: '#52759B',
  earth: '#697A46',
  bold: '#B04383',
};

const FORMALITY_LABELS = ['Athleisure', 'Casual', 'Smart', 'Dressy', 'Formal'] as const;

export function ClosetPane() {
  const { base, accent, type, spacing, radii } = useTheme();
  const wardrobeItems = useAppStore((s) => s.wardrobeItems);
  const profile = useAppStore((s) => s.styleProfile);
  const remove = useAppStore((s) => s.removeWardrobeItem);
  const addWardrobeItems = useAppStore((s) => s.addWardrobeItems);
  const [adding, setAdding] = useState(false);
  const [draftUris, setDraftUris] = useState<string[]>([]);
  const [highlightId, setHighlightId] = useState<string>();

  const gaps = useMemo(
    () =>
      profile
        ? analyzeGaps({
            wardrobe: wardrobeItems,
            userVector: profile.vector,
            products: ALL_PRODUCTS,
            budgetCenter: 120,
          })
        : [],
    [profile, wardrobeItems],
  );
  const coverage = useMemo(() => categoryCoverage(wardrobeItems), [wardrobeItems]);
  const balance = useMemo(() => colorBalance(wardrobeItems), [wardrobeItems]);
  const spread = useMemo(() => formalitySpread(wardrobeItems), [wardrobeItems]);
  const presentLevels = useMemo(
    () => new Set(wardrobeItems.map((item) => item.formality)),
    [wardrobeItems],
  );
  const outfitCount = useMemo(() => countOutfits(wardrobeItems), [wardrobeItems]);
  const edges = useMemo(() => buildEdges(wardrobeItems), [wardrobeItems]);
  const outfits = useMemo(() => enumerateOutfits(wardrobeItems).slice(0, 12), [wardrobeItems]);

  const commitPhotos = () => {
    if (!draftUris.length) return;
    addWardrobeItems(wardrobeItemsFromAnalysis(draftUris, []));
    setDraftUris([]);
    setAdding(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={[type.display, { color: accent.bright }]}>{outfitCount}</Text>
            <Text style={[type.body, { color: base.textMid }]}>
              possible outfits · {wardrobeItems.length} pieces
            </Text>
          </View>
          <Text
            onPress={() => setAdding((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={adding ? 'Hide photo importer' : 'Add wardrobe photos'}
            style={[type.caption, { color: accent.bright, padding: spacing.sm }]}
          >
            {adding ? 'Done' : 'Add'}
          </Text>
        </View>

        {adding ? (
          <Surface level={2} style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={[type.body, { color: base.textHi }]}>Import photos</Text>
            <ImagePickerGrid
              max={8}
              uris={draftUris}
              onAdd={(uris) => setDraftUris((current) => [...current, ...uris].slice(0, 8))}
              onRemove={(uri) => setDraftUris((current) => current.filter((item) => item !== uri))}
            />
            <Text
              onPress={commitPhotos}
              accessibilityRole="button"
              accessibilityLabel="Save imported photos to wardrobe"
              style={[type.caption, { color: draftUris.length ? accent.bright : base.textLow }]}
            >
              Save {draftUris.length || ''} {draftUris.length === 1 ? 'piece' : 'pieces'}
            </Text>
          </Surface>
        ) : null}

        {wardrobeItems.length === 0 ? (
          <EmptyState
            title="Your wardrobe is empty"
            body="Add pieces during onboarding or import photos to see how they work together."
            action="Start onboarding"
            onAction={() => router.replace('/onboarding' as never)}
          />
        ) : (
          <>
            <SectionHeader title="Coverage" />
            <CoverageBars coverage={coverage} />

            <SectionHeader title="Colour balance" />
            <View
              style={{
                height: 12,
                borderRadius: 6,
                overflow: 'hidden',
                flexDirection: 'row',
                backgroundColor: base.hairline,
              }}
            >
              {COLOR_FAMILIES.map((family) =>
                balance[family] > 0 ? (
                  <View
                    key={family}
                    style={{ width: `${balance[family] * 100}%`, backgroundColor: FAMILY_HEX[family] }}
                  />
                ) : null,
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
              {COLOR_FAMILIES.map((family) => (
                <View key={family} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: FAMILY_HEX[family] }} />
                  <Text style={[type.caption, { color: base.textMid }]}>
                    {family} {Math.round(balance[family] * 100)}%
                  </Text>
                </View>
              ))}
            </View>

            <SectionHeader title="Formality" />
            <Text style={[type.caption, { color: base.textLow, marginBottom: spacing.sm }]}>
              Span {spread.min || '—'}–{spread.max || '—'} · {spread.levels} levels
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {FORMALITY_LABELS.map((label, index) => {
                const level = (index + 1) as 1 | 2 | 3 | 4 | 5;
                const active = presentLevels.has(level);
                return (
                  <View
                    key={label}
                    style={{
                      flex: 1,
                      minHeight: 54,
                      borderRadius: radii.tile,
                      borderWidth: 1,
                      borderColor: active ? accent.base : base.hairline,
                      backgroundColor: active ? accent.glow : base.elev2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                    }}
                  >
                    <Text
                      style={[type.caption, { color: active ? accent.bright : base.textLow, textAlign: 'center' }]}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <SectionHeader title="Gaps in your wardrobe" />
            {gaps.length ? (
              gaps.slice(0, 4).map((gap) => (
                <GapCard
                  key={gap.id}
                  gap={gap}
                  onPressSuggestion={
                    gap.suggestion
                      ? () => router.push(`/product/${gap.suggestion!.product.id}` as never)
                      : undefined
                  }
                />
              ))
            ) : (
              <Text style={[type.body, { color: base.textMid }]}>No major gaps right now.</Text>
            )}

            <SectionHeader title="Your pieces" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {wardrobeItems.map((item) => (
                <WardrobeItemCard key={item.id} item={item} onRemove={() => remove(item.id)} />
              ))}
            </View>

            {wardrobeItems.length < 3 ? (
              <EmptyState
                title="Add a few pieces first"
                body="Fits appear once we can combine a top, bottom, and footwear."
              />
            ) : (
              <>
                <SectionHeader title="Connections" />
                <Surface level={2}>
                  <OutfitGraph items={wardrobeItems} edges={edges} highlightId={highlightId} />
                </Surface>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
                  {wardrobeItems.map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      selected={highlightId === item.id}
                      onPress={() => setHighlightId(highlightId === item.id ? undefined : item.id)}
                    />
                  ))}
                </View>

                <SectionHeader title="Your outfits" />
                {outfits.map((outfit, index) => (
                  <Surface
                    key={index}
                    level={2}
                    style={{
                      flexDirection: 'row',
                      gap: spacing.sm,
                      marginBottom: spacing.sm,
                      padding: spacing.sm,
                    }}
                  >
                    {outfit.map((item) => (
                      <View key={item.id} style={{ flex: 1, alignItems: 'center' }}>
                        <GarmentArt category={item.category} color={item.color} size={54} />
                        <Text numberOfLines={1} style={[type.caption, { color: base.textMid }]}>
                          {item.name}
                        </Text>
                      </View>
                    ))}
                  </Surface>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck && npm test`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/panes/ClosetPane.tsx
git commit -m "feat: merge wardrobe and fits screens into the closet pane"
```

---

### Task 6: Switch over to the pager

The cutover. Creates the pager route, deletes the `(tabs)` group, repoints the onboarding hand-off, and removes the icons nothing uses any more. These must land together: typecheck only passes once every route reference is consistent.

**Files:**
- Create: `app/index.tsx`
- Delete: `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/fits.tsx`, `app/(tabs)/wardrobe.tsx`, `app/(tabs)/profile.tsx`
- Modify: `app/onboarding/analyzing.tsx:93`
- Modify: `components/TabIcons.tsx` — delete `HomeIcon`, `FitsIcon`, `ExploreIcon`

**Interfaces:**
- Consumes: `INITIAL_PANE_INDEX` and `clampIndex` from `@/lib/pager` (Task 1); `SwipeTabBar` from `@/components/SwipeTabBar` (Task 2); `ExplorePane` (Task 3), `ProfilePane` (Task 4), `ClosetPane` (Task 5).
- Produces: the app's only main route, `/`.

- [ ] **Step 1: Create `app/index.tsx`**

```tsx
import React, { useCallback, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { SwipeTabBar } from '@/components/SwipeTabBar';
import { ClosetPane } from '@/components/panes/ClosetPane';
import { ExplorePane } from '@/components/panes/ExplorePane';
import { ProfilePane } from '@/components/panes/ProfilePane';
import { INITIAL_PANE_INDEX, clampIndex } from '@/lib/pager';
import { useTheme } from '@/theme/useTheme';

export default function PagerScreen() {
  const { base, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const lastIndex = useSharedValue(INITIAL_PANE_INDEX);
  const [selected, setSelected] = useState(INITIAL_PANE_INDEX);
  const landed = useRef(false);

  const selectIndex = useCallback((index: number) => setSelected(clampIndex(index)), []);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
    const next = width > 0 ? Math.round(event.contentOffset.x / width) : INITIAL_PANE_INDEX;
    if (next !== lastIndex.value) {
      lastIndex.value = next;
      runOnJS(selectIndex)(next);
    }
  });

  // contentOffset only honours an initial offset on iOS, so land on Explore
  // from a one-shot layout pass instead. The ref guard keeps a resize from
  // yanking the user back to the middle pane.
  const landOnExplore = useCallback(() => {
    if (landed.current || width === 0) return;
    landed.current = true;
    scrollRef.current?.scrollTo({ x: INITIAL_PANE_INDEX * width, animated: false });
  }, [scrollRef, width]);

  const onSelect = useCallback(
    (index: number) => {
      scrollRef.current?.scrollTo({ x: clampIndex(index) * width, animated: !reduceMotion });
    },
    [reduceMotion, scrollRef, width],
  );

  return (
    <View style={{ flex: 1, backgroundColor: base.canvas }}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={landOnExplore}
        style={{ flex: 1 }}
      >
        <View style={{ width }}>
          <ProfilePane />
        </View>
        <View style={{ width }}>
          <ExplorePane />
        </View>
        <View style={{ width }}>
          <ClosetPane />
        </View>
      </Animated.ScrollView>
      <SwipeTabBar scrollX={scrollX} width={width} selected={selected} onSelect={onSelect} />
    </View>
  );
}
```

- [ ] **Step 2: Repoint the onboarding hand-off**

In `app/onboarding/analyzing.tsx`, line 93, change:

```tsx
<PrimaryButton label="See your style" onPress={() => router.replace('/(tabs)' as never)} />
```

to:

```tsx
<PrimaryButton label="See your style" onPress={() => router.replace('/' as never)} />
```

- [ ] **Step 3: Delete the tabs route group**

```bash
git rm -r "app/(tabs)"
```

- [ ] **Step 4: Delete the unused icons**

In `components/TabIcons.tsx`, delete the entire `HomeIcon`, `ExploreIcon`, and `FitsIcon` functions. Keep `WardrobeIcon`, `ProfileIcon`, and `CompassIcon`.

`Line` was only used by `ExploreIcon`, so the import line becomes:

```tsx
import Svg, { Path, Rect, Circle } from 'react-native-svg';
```

- [ ] **Step 5: Verify nothing still references the old routes**

Run: `npx tsc --noEmit && grep -rn "(tabs)\|HomeIcon\|FitsIcon\|ExploreIcon" app components lib theme store`
Expected: typecheck exits 0, and grep prints nothing (exit code 1).

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS, all 19 test files including the new `pager.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/index.tsx app/onboarding/analyzing.tsx components/TabIcons.tsx
git commit -m "feat: replace the five-tab bar with a three-pane swipe pager"
```

---

### Task 7: Browser verification

The change is structural and visual, so the real gate is exercising it. Use the `preview_*` tools, not a manual hand-off to the user.

**Files:** none — this task only verifies.

- [ ] **Step 1: Start the dev server**

Start the Expo web dev server with `preview_start` and wait for it to serve.

- [ ] **Step 2: Check for console and server errors**

Run `preview_console_logs` and `preview_logs`.
Expected: no Reanimated warnings about calling non-worklet functions on the UI thread, and no missing-route warnings from Expo Router.

- [ ] **Step 3: Confirm the landing pane and pane height**

Run `preview_snapshot`.
Expected: Explore's content is visible — the "Explore" heading, the search field, and the intent chips. If the panes are collapsed to zero height, give each pane wrapper in `app/index.tsx` an explicit `height: '100%'` alongside `width`, and re-check.

- [ ] **Step 4: Confirm the tab bar renders three icons with no labels**

Run `preview_snapshot` and confirm three elements with role `tab` and accessible names "Profile", "Explore", "Closet", and that no visible text label sits under any icon.

- [ ] **Step 5: Test tab taps in both directions**

`preview_click` the Profile tab, then `preview_snapshot` — expected: "Your Style" heading, palette, radar chart, Retune sliders.
`preview_click` the Closet tab, then `preview_snapshot` — expected: the outfit count as the headline, then "possible outfits · N pieces", coverage bars, gap cards.
`preview_click` the Explore tab to return.

- [ ] **Step 6: Test swiping**

Use `preview_eval` to drive the pager's scroll container horizontally (set `scrollLeft` on the scrolling element, or dispatch wheel events with `deltaX`), then `preview_snapshot` to confirm the pane changed and that the tab bar's `selected` state followed.

- [ ] **Step 7: Test vertical scrolling inside a pane**

On Closet, `preview_eval` a vertical scroll and `preview_snapshot`. Expected: the pane scrolls down to the gap cards without changing pane.

- [ ] **Step 8: Test the product round trip**

From Explore, `preview_click` a product card. Expected: the product detail screen. Go back, then `preview_snapshot`. Expected: still on Explore, at the same scroll position.
Repeat from a Closet gap card's suggestion. Expected: back returns to Closet, not Explore.

- [ ] **Step 9: Test the onboarding hand-off**

Trigger "Redo onboarding" from Profile, complete the funnel, and press "See your style". Expected: the pager appears on Explore, and the theme has reskinned to the new palette.

- [ ] **Step 10: Capture proof and commit**

Take `preview_screenshot` of each of the three panes.
If any step required a fix, commit it:

```bash
git add -A
git commit -m "fix: address swipe pager issues found in browser verification"
```

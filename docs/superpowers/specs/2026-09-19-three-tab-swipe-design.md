# Three-Tab Swipe Navigation — Design Spec

**Date:** 2026-09-19
**Supersedes:** the Navigation section of `2026-09-19-fitlab-design.md`. Everything else in that spec still holds.
**Platform:** Expo (React Native), primary target web via `npx expo start` → `w`

## One-sentence change

Collapse the five-tab bar into three swipeable panes — Profile, Explore, Closet — behind an icon-only tab bar.

## Why

Five tabs across a phone-width bar leaves no room for the content to breathe, and two of the five (Home, Fits) are readings of data that already belongs to another tab. Three panes on a pager make the whole app reachable by dragging a thumb, and the demo can move between style, recommendations, and wardrobe without anyone hunting for a tab.

---

## 1. Tabs

| Index | Tab | Icon | Was |
|---|---|---|---|
| 0 | Profile | person | Home + Profile |
| 1 | Explore | compass | Explore |
| 2 | Closet | hanger | Wardrobe + Fits |

Explore is the middle pane and the landing pane, so either neighbour is one swipe away.

The bar shows icons only. No text labels.

---

## 2. Routes

```
app/
  _layout.tsx          unchanged in structure; the onboarding gate now lands on "/"
  index.tsx            NEW — the pager host
  onboarding/
    _layout.tsx        unchanged
    index.tsx          unchanged
    personality.tsx    unchanged
    wardrobe.tsx       unchanged
    analyzing.tsx      router.replace('/(tabs)') → router.replace('/')
  product/[id].tsx     unchanged — still pushed onto the root Stack
  api/
    analyze+api.ts     unchanged
    explain+api.ts     unchanged
```

Deleted: `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/fits.tsx`, `app/(tabs)/wardrobe.tsx`, `app/(tabs)/profile.tsx`. The `(tabs)` group directory goes with them.

The three panes are not routes. They are components mounted side by side inside a single screen, so there is exactly one app route (`/`) plus onboarding and product detail.

### Consequences for navigation

- **No per-tab URLs.** `/explore`, `/wardrobe`, `/fits`, `/profile` stop existing. This is accepted, not deferred.
- **The `?intent=` deep link disappears.** Today `(tabs)/index.tsx` pushes `/explore?intent=jacket` and `explore.tsx` reads it with `useLocalSearchParams` plus a syncing `useEffect`. In the new layout the intent chips live on Explore itself, so `intentId` is plain `useState` and both the param read and the effect are deleted.
- **`router.push('/fits')` disappears.** The outfit count becomes Closet's own headline.
- **`product/[id]` is unaffected.** It is pushed onto the root Stack; the pager screen stays mounted underneath, so going back restores the pane the user was on along with its vertical scroll position.
- **`router.replace('/onboarding')` from empty states is unaffected.**

---

## 3. New and changed files

```
app/index.tsx                    NEW   pager host, ~60 lines
components/SwipeTabBar.tsx       NEW   icon-only bar with a scroll-linked indicator
components/panes/ProfilePane.tsx NEW   merge of (tabs)/index.tsx + (tabs)/profile.tsx
components/panes/ExplorePane.tsx NEW   (tabs)/explore.tsx minus the route params
components/panes/ClosetPane.tsx  NEW   merge of (tabs)/wardrobe.tsx + (tabs)/fits.tsx
components/TabIcons.tsx          EDIT  add CompassIcon; delete HomeIcon and FitsIcon
```

`WardrobeIcon` (hanger) and `ProfileIcon` (person) already exist and are reused unchanged. `ExploreIcon` is a magnifying glass and is replaced by `CompassIcon` — a circle with a needle — because the magnifier now reads as the search field inside the pane rather than the tab itself.

No new dependencies. `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-svg` and `expo-haptics` are already installed.

---

## 4. The pager host

`app/index.tsx`:

```tsx
const { width } = useWindowDimensions();
const scrollX = useSharedValue(0);
const ref = useAnimatedRef<Animated.ScrollView>();
const onScroll = useAnimatedScrollHandler((e) => { scrollX.value = e.contentOffset.x; });
const progress = useDerivedValue(() => scrollX.value / width); // 0–2

<Animated.ScrollView
  ref={ref} horizontal pagingEnabled
  showsHorizontalScrollIndicator={false}
  scrollEventThrottle={16}
  onScroll={onScroll}
  onLayout={landOnExploreOnce}
>
  <View style={{ width }}><ProfilePane /></View>
  <View style={{ width }}><ExplorePane /></View>
  <View style={{ width }}><ClosetPane /></View>
</Animated.ScrollView>
<SwipeTabBar progress={progress} onSelect={(i) => ref.current?.scrollTo({ x: i * width, animated: !reduceMotion })} />
```

The host owns only geometry and scroll position. It holds no product state and reads nothing from `useAppStore`.

### Landing on the middle pane

`contentOffset` only honours an initial offset on iOS. Instead, an `onLayout` handler fires a one-shot `scrollTo(width, animated: false)` guarded by a ref, so it runs once per mount on every platform and does not fight the user if the layout re-fires on window resize.

Because `app/_layout.tsx` blocks rendering until `mounted && hydrated`, `useWindowDimensions()` always returns a real width by the time the pager mounts. There is no server-render pass to guard against.

---

## 5. The tab bar

`components/SwipeTabBar.tsx` takes `progress` (a shared value in the range 0–2) and an `onSelect` callback. It renders three pressables on `base.elev1` with a `base.hairline` top border and a safe-area bottom inset, matching the dimensions and colours of today's `tabBarStyle`.

Two things animate off `progress` rather than off a selected index, so they track the finger continuously during a drag instead of snapping at the end:

- Each icon's colour interpolates between `base.textLow` and `accent.base` by its distance from `progress`.
- A pill indicator translates horizontally by `progress * slotWidth`.

Accessibility: each pressable is `accessibilityRole="tab"` with `accessibilityLabel` of "Profile", "Explore", or "Closet" and `accessibilityState={{ selected }}`, where `selected` is the rounded `progress`. The labels are visually hidden, not absent — a screen reader still announces a named tab.

A light haptic fires on tap, skipped when `Platform.OS === 'web'`.

`reduceMotion` from `useTheme()` controls only the tap-to-scroll animation, which becomes an instant jump. Swipe is direct manipulation and is unaffected.

---

## 6. Pane contents

Each pane is a `SafeAreaView edges={['top']}` wrapping its own vertical `ScrollView`, exactly as the screens are structured today. RN locks a gesture to one axis, so vertical scrolling inside a pane and horizontal paging between panes do not conflict.

### ProfilePane

Identity first, controls second, in one scroll:

1. "Your Style" display heading, style tags, palette row
2. Radar chart of the 9-dimension style vector
3. Silhouettes and materials chips
4. **Retune** — 5 sliders, 9 word chips
5. **Theme** — Auto plus the pinned vibe chips
6. **Saved** — saved product art, or the "Save recommendations to find them here" line
7. "Redo onboarding" ghost button

The "What are you looking for?" intent chips and the "N pieces · N possible outfits" link from the old Home screen are **not** carried over; both now live on the panes that own that data.

Empty state (`styleProfile === null`): "No style profile yet" with a "Start onboarding" action.

### ExplorePane

Unchanged from `(tabs)/explore.tsx` other than dropping `useLocalSearchParams` and its syncing effect: sticky header with the "Explore" heading, search field, horizontally scrolling intent chips, and the Under $100 / Under $200 / Any price chips; then `N recommendations` and the ranked `ProductCard` list into `/product/[id]`.

The intent chip row is a nested horizontal `ScrollView`. It sits inside the horizontal pager, so horizontal drags starting on that row scroll the chips rather than changing pane. This is correct — it is how the row already behaves — but it means the chip row is a dead zone for the pane swipe, and the pane must not be so full of horizontal rows that swiping becomes hard to land. Explore has exactly one.

Empty state: unchanged.

### ClosetPane

The Fits headline leads, because the outfit count is the number the demo points at:

1. `{countOutfits(items)}` as the display number, with "possible outfits" and `{items.length} pieces` beneath, and the "Add" photo-import toggle on the right
2. Photo importer surface when toggled
3. Coverage bars
4. Colour balance bar and legend
5. Formality spread
6. Gap cards (top 4) into `/product/[id]`
7. "Your pieces" item grid with remove
8. "Connections" — outfit graph with tap-a-piece-to-highlight
9. "Your outfits" — the generated outfit rows (top 12)

Empty states keep their current split: zero items shows "Your wardrobe is empty" in place of everything below the header, and fewer than 3 items shows the Fits "Add a few pieces first" copy in place of sections 8 and 9.

---

## 7. What is cut

- Per-tab URLs and deep links, including `?intent=`
- Text labels under the tab icons
- The Home and Fits screens as destinations
- Keyboard arrow-key paging on web
- Any tab-state persistence across app launches — the app always lands on Explore

---

## 8. Verification

All 18 existing test files cover `lib/` and `theme/` only and reference no routes, so they must stay green untouched. `__tests__/purity.test.ts` keeps `lib/` free of React imports; this change adds no pure logic to `lib/`, so nothing new is asserted there.

The change is structural and visual, so verification is:

1. `npm run typecheck` — catches the deleted route references
2. `npm test` — confirms no lib regression
3. Browser verification on the web target: swipe between all three panes, confirm the indicator tracks mid-drag, tap each icon, scroll vertically inside each pane, open a product from Explore and from a Closet gap card and confirm back returns to the same pane, and confirm a fresh onboarding run lands on Explore

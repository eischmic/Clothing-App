# Pill-Driven Pane Navigation — Design

**Date:** 2026-09-19
**Status:** Approved
**Depends on:** `2026-09-19-explore-card-stack-design.md` (spec 2) for `GestureHandlerRootView`

## Problem

The three panes live inside a horizontally paging `Animated.ScrollView` in `app/index.tsx`. Spec 2 puts a horizontal pan gesture on every card row inside the Explore pane. A horizontal drag on a card is indistinguishable from a horizontal drag on the pager, so the two fight: either the card never swipes or the pane slides away mid-swipe.

The user's rule resolves it:

> the user can drag on the bottom pill or tap in the bottom pill to change tabs; swiping should be reserved for changing between items

So the content area stops responding to horizontal drags entirely. Pane changes come from the tab bar only — tap a tab, or drag along the bar.

## Approach

Replace the `ScrollView` with a plain row of three full-width panes, translated by a shared value. Nothing about the pane components changes; only what moves them.

The tab bar gains a `Gesture.Pan()`. Dragging along the bar scrubs the row in real time — a drag of one tab-slot's width moves the row one pane's width, so the pill tracks the finger and the panes follow proportionally. Releasing settles to the nearest pane with a spring.

`SwipeTabBar`'s existing `scrollX: SharedValue<number>` prop stays, and stays in **pixels of content offset**, so its glyph-crossfade and pill-translate interpolations are untouched. The pager writes `scrollX` directly instead of receiving it from a scroll handler.

### Why not keep the ScrollView with `scrollEnabled={false}`

It would work, and spec 2 names it as the stopgap if spec 2 ships first. But a disabled `ScrollView` cannot be driven by a gesture without `scrollTo` calls on every frame, which defeats the point of running the drag on the UI thread. A translated row is simpler and gives the pill drag a direct, uninterrupted mapping.

### Why not a library pager

`react-native-pager-view` is not a dependency, and adding one to get *less* gesture behaviour than we already have is backwards. The row is roughly thirty lines.

## Geometry — `lib/pager.ts`

`lib/pager.ts` remains the pure geometry layer and keeps `PANES`, `PaneId`, `Pane`, `INITIAL_PANE_INDEX`, and `clampIndex` exactly as they are. `clampIndex` still exists and is still used by `onSelect`; its non-finite guard still matters because `width` is 0 before first layout on web.

Two pure functions are added:

```ts
/**
 * Pane index a release should settle on. `index` is the fractional position
 * the drag ended at; `velocity` is horizontal pixels/second, positive to the
 * right. A fast flick commits to the adjacent pane even when the drag covered
 * less than half a slot.
 */
export const FLICK_VELOCITY = 500;

export function settleIndex(index: number, velocity: number, from: number): number {
  if (!Number.isFinite(index)) return INITIAL_PANE_INDEX;
  if (velocity >= FLICK_VELOCITY) return clampIndex(from + 1);
  if (velocity <= -FLICK_VELOCITY) return clampIndex(from - 1);
  return clampIndex(index);
}

/** Fractional pane position for a drag, clamped so the row cannot overscroll. */
export function dragIndex(from: number, translationX: number, slot: number): number {
  if (slot <= 0) return from;
  return Math.min(PANES.length - 1, Math.max(0, from + translationX / slot));
}
```

**Sign convention: the pill follows the finger.** The user asked to "drag on the bottom pill", so the pill is the thing being manipulated, not the content. Dragging **right** moves the pill right, which selects a **later** pane, which translates the row **left**. So `dragIndex` adds `translationX`, and a positive (rightward) `velocityX` maps to `from + 1`. This is the opposite of a `ScrollView`'s content-dragging convention — getting it backwards is the easiest mistake to make here, and it will feel obviously wrong in the browser.

The row translation is `-scrollX`, which is where the inversion actually happens; `dragIndex` and `settleIndex` both stay in pane-index space and never deal with it.

`slot` is the tab-slot width (`width / PANES.length`), not the pane width. A finger crossing one tab moves the row one full pane. This is what makes the pill feel like it is under the finger.

Both functions are pure and belong in the existing `__tests__/pager.test.ts`.

### Worklet directives

`dragIndex` and `settleIndex` are called from inside the pan gesture's `onUpdate` / `onEnd`, which run on the UI thread. Reanimated's Babel plugin does not automatically workletize functions imported from another module, so each needs an explicit directive as the first statement in its body:

```ts
export function dragIndex(from: number, translationX: number, slot: number): number {
  'worklet';
  // ...
}
```

`clampIndex` needs it too, because `settleIndex` calls it. Without the directives the gesture throws `Tried to synchronously call a non-worklet function on the UI thread` on first drag.

The directive is a bare string literal, so `__tests__/purity.test.ts` still passes — nothing under `lib/` gains an import of react, react-native or expo. The functions remain directly callable from Jest.

## Pager — `app/index.tsx`

```tsx
const PANE_SPRING = { damping: 22, stiffness: 190, mass: 0.7 } as const;
```

State:

- `scrollX: SharedValue<number>` — content offset in pixels, `index * width`. Passed to `SwipeTabBar` unchanged.
- `selected: number` — React state, for `aria-selected` on the tabs.
- `dragFrom: SharedValue<number>` — the pane index a drag started from.

The row:

```tsx
const rowStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: -scrollX.value }],
}));

<View style={{ flex: 1, overflow: 'hidden' }}>
  <Animated.View style={[{ flex: 1, flexDirection: 'row', width: width * PANES.length }, rowStyle]}>
    <View style={{ width }}><ProfilePane /></View>
    <View style={{ width }}><ExplorePane onNavigateToPane={onSelect} /></View>
    <View style={{ width }}><ClosetPane /></View>
  </Animated.View>
</View>
```

`overflow: 'hidden'` on the clip parent matters on web, where the off-screen panes would otherwise extend the document and produce a horizontal scrollbar.

### Landing on Explore

The `onLayout`/`scrollTo` dance in the current file goes away. `scrollX` is initialised to `INITIAL_PANE_INDEX * width` on first non-zero width:

```tsx
const landed = useRef(false);
useEffect(() => {
  if (landed.current || width === 0) return;
  landed.current = true;
  scrollX.value = INITIAL_PANE_INDEX * width;
}, [scrollX, width]);
```

The `landed` ref is kept for the same reason it exists today: a window resize must not yank the user back to the middle pane.

### Resize

When `width` changes after landing, `scrollX` is stale by the ratio of old to new width. Rather than track the previous width, re-derive from `selected`:

```tsx
useEffect(() => {
  if (!landed.current || width === 0) return;
  scrollX.value = selected * width;
}, [scrollX, selected, width]);
```

This runs on every `selected` change too, which is harmless — `onSelect` has already animated `scrollX` to that same value, so the assignment is a no-op in practice. Ordering the two effects so landing runs first is not required; both converge on the same value.

### `onSelect`

```tsx
const onSelect = useCallback(
  (index: number) => {
    const next = clampIndex(index);
    setSelected(next);
    if (reduceMotion) scrollX.value = next * width;
    else scrollX.value = withSpring(next * width, PANE_SPRING);
  },
  [reduceMotion, scrollX, width],
);
```

Signature is unchanged, so spec 2's `onNavigateToPane` handoff needs no adjustment.

## Tab bar drag — `components/SwipeTabBar.tsx`

`SwipeTabBar`'s props gain two:

```tsx
export function SwipeTabBar({
  scrollX,      // unchanged: content offset in px
  width,        // unchanged
  selected,     // unchanged
  onSelect,     // unchanged
  dragFrom,     // new: SharedValue<number>
  reduceMotion, // new: boolean
}: { /* ... */ })
```

`dragFrom` is owned by the pager so the gesture can record its origin without a JS round-trip. `reduceMotion` comes from `useTheme()` in the pager; passing it avoids a second `useTheme()` call diverging.

The gesture sits on the bar container, not on the individual `Pressable` tabs, so it can start anywhere along the bar:

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

`onSelect` does the settling animation, so the release path is identical whether the user tapped or dragged — one spring, one `setSelected`.

`activeOffsetX([-8, 8])` lets a tap fall through to the `Pressable` beneath: a tap never translates 8px, so the pan never activates and `onPress` fires normally. `failOffsetY([-12, 12])` releases the gesture if the user is actually scrolling the pane below, which matters on the Closet pane where the tab bar sits right under a vertical list.

The bar's existing children are wrapped:

```tsx
<GestureDetector gesture={pan}>
  <View style={{ /* existing container style */ }}>
    {/* pill + tab row, unchanged */}
  </View>
</GestureDetector>
```

The pill and glyph interpolations are untouched. Because the drag writes `scrollX` continuously, they already track the finger for free.

### Reduced motion

`reduceMotion` disables the settle spring in `onSelect`, as shown above. The drag itself is **not** disabled — a drag is direct manipulation, not an animation, and suppressing it would leave a reduced-motion user with no drag affordance at all. This matches how spec 2 treats card drags.

## Accessibility

Unchanged from today: `accessibilityRole="tab"`, `accessibilityLabel={pane.label}`, `aria-selected={selected === index}` per tab. The pan gesture adds no new interactive target — every pane remains reachable by tapping a tab, which is the path assistive tech uses. Screen-reader users never depend on the drag.

## Files touched

| File | Change |
| --- | --- |
| `lib/pager.ts` | + `FLICK_VELOCITY`, `settleIndex`, `dragIndex` |
| `app/index.tsx` | `ScrollView` → translated row; spring-driven `onSelect`; landing and resize effects |
| `components/SwipeTabBar.tsx` | + `GestureDetector` with `Gesture.Pan()`; + `dragFrom` and `reduceMotion` props |
| `__tests__/pager.test.ts` | + cases for `settleIndex` and `dragIndex` |

`app/_layout.tsx` is **not** listed: spec 2 already adds `GestureHandlerRootView` there. If spec 3 is implemented first, it must add it — the pan gesture silently no-ops without it.

## Testing

`__tests__/pager.test.ts` gains, alongside the existing `clampIndex` cases:

`settleIndex`
- rounds to nearest when velocity is below the flick threshold: `settleIndex(1.4, 0, 1) === 1`, `settleIndex(1.6, 0, 1) === 2`
- a rightward flick advances a pane even on a short drag: `settleIndex(1.1, 900, 1) === 2`
- a leftward flick goes back: `settleIndex(0.9, -900, 1) === 0`
- flicks clamp at the ends: `settleIndex(2, 900, 2) === 2`, `settleIndex(0, -900, 0) === 0`
- non-finite input falls back to `INITIAL_PANE_INDEX`

`dragIndex`
- zero translation returns the origin: `dragIndex(1, 0, 40) === 1`
- one slot of rightward drag advances one pane: `dragIndex(1, 40, 40) === 2`
- clamps at both ends: `dragIndex(0, -400, 40) === 0`, `dragIndex(2, 400, 40) === 2`
- `slot <= 0` returns the origin unchanged, covering the pre-layout case

Gesture behaviour itself is not unit-tested — the repo has no React renderer in devDependencies, and only `lib/` and `theme/` are covered. Interaction is verified in the browser, consistent with how the pager was verified originally.

Browser checks after implementation:
1. Land on Explore on a cold load.
2. Tap each tab; the row settles on the right pane and `aria-selected` follows.
3. Drag along the tab bar; the panes track the finger and settle on release.
4. A short, fast flick that never reaches the midpoint still commits to the next pane.
5. Horizontal drag in the content area does nothing to the pager.
6. No horizontal scrollbar on the document.

## Out of scope

- Keyboard arrow navigation between panes.
- Edge-swipe-from-screen-border as an alternate pane gesture; the user explicitly reserved swipe for cards.
- Animating pane content (parallax, scale) during the drag.

## Risks

**Tap and drag on the same surface.** The 8px activation window is the whole mitigation. If taps start getting swallowed in practice, raising it to 12px is the fix; going the other way — moving the gesture onto a dedicated drag handle — would cost the "drag anywhere on the bar" feel the user asked for.

**Vertical scroll interference.** `failOffsetY([-12, 12])` handles the common case, but the tab bar overlaps nothing scrollable today, so this is precautionary rather than load-bearing.

**Ordering against spec 2.** Spec 2's cards fight a scrollable pager; this spec removes the fight. Implementing this one first is safe and leaves the app fully working — the panes just stop responding to content-area swipes, which is the intended end state anyway.

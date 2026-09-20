# Explore Card Stack — Design

**Status:** approved for planning
**Date:** 2026-09-19
**Sequence:** spec 2 of 3. Depends on spec 1 (multi-profile foundation). Spec 3 (pill-driven navigation) is independent but complementary.

## Goal

Replace the Explore pane's ranked product list with a Tinder-style swipe experience: one outfit on screen at a time, built from catalog products. The user swipes individual garments left (no) or right (yes). Liked pieces go to a wishlist; whole outfits can be saved. A style pill at the top switches between profiles.

## Why

The current Explore pane is a scrolling grid of scored product cards — information-dense and requires reading. The user wants something simple: look at a look, react to it, move on.

## Decisions already made

Settled during brainstorming, not open for reinterpretation:

1. **Catalog only.** Every garment shown is a `Product` from `ALL_PRODUCTS`. Owned wardrobe items never appear in the deck.
2. **Slot refill in place.** Swiping one garment replaces *that garment only* with the next candidate for the same slot. The rest of the outfit is untouched.
3. **Right = wishlist.** Liked products land in a "Want" section of Closet, kept separate from owned pieces so outfit counts and gap analysis stay honest.
4. **Save Outfit** stores the whole current combination.
5. **The pill switches; the Profile pane manages.** Tapping the pill opens a compact switcher listing profiles plus a "Manage profiles" link that routes to the Profile pane.

## Prerequisite: GestureHandlerRootView

`react-native-gesture-handler@~2.32.0` is in `package.json` but **`GestureHandlerRootView` is not mounted anywhere**. Pan gestures will silently fail without it.

`app/_layout.tsx` must wrap its rendered tree:

```tsx
<GestureHandlerRootView style={{ flex: 1 }}>
  {/* existing ThemeProvider + Stack */}
</GestureHandlerRootView>
```

It must wrap the **real** tree, and also the pre-hydration placeholder branch, so the root view's layout does not shift when hydration flips. Simplest correct form: wrap the contents of `RootLayout`, outside `RootLayoutInner`.

## Outfit model

### What an outfit is

```ts
export type Slot = 'top' | 'bottom' | 'footwear' | 'outerwear' | 'knitwear';

export const REQUIRED_SLOTS: readonly Slot[] = ['top', 'bottom', 'footwear'];
export const OPTIONAL_SLOTS: readonly Slot[] = ['outerwear', 'knitwear'];

export interface DeckOutfit {
  slots: Partial<Record<Slot, Product>>;
}
```

`top`, `bottom` and `footwear` are always filled. `outerwear` and `knitwear` are filled when a compatible candidate exists, and are simply absent otherwise. `accessory` products are excluded from the deck entirely — they complicate the compatibility graph without adding much to a first look.

This mirrors `lib/outfits.ts`'s existing definition (one top + one bottom + one footwear, optionally plus outerwear and/or knitwear), so the two stay conceptually aligned. It is a *separate* structure because `enumerateOutfits` returns flat arrays of owned items and exhaustively enumerates, which is the wrong shape and the wrong cost for a deck that only ever needs the next card.

### Candidate pools

New module `lib/deck.ts` — pure TypeScript, no React, so it passes `__tests__/purity.test.ts`.

```ts
export interface DeckContext {
  products: Product[];
  userVector: StyleVector;
  rejectedIds: string[];
  budgetCenter: number;
}

export function candidatesForSlot(ctx: DeckContext, slot: Slot): Product[];
```

`candidatesForSlot` filters `products` to the matching `category`, drops anything in `rejectedIds`, and sorts by descending `styleScore(userVector, product)` with `priceScore(price, budgetCenter)` as a secondary term. It reuses the existing exports from `lib/scoring.ts` rather than inventing a second scoring scheme.

Ties are broken by `product.id` ascending so ordering is total and deterministic. Determinism matters: the same profile and the same rejection set must always produce the same deck, which is what makes the behaviour testable and what keeps the deck stable across a re-render.

### Building and refilling

```ts
export function buildOutfit(ctx: DeckContext): DeckOutfit | null;

export function refillSlot(
  ctx: DeckContext,
  outfit: DeckOutfit,
  slot: Slot,
): DeckOutfit | null;
```

`buildOutfit` fills `top`, then `bottom`, then `footwear`, each time taking the highest-ranked candidate compatible with everything already placed (using `areCompatible` from `lib/compatibility.ts`). It then attempts `outerwear` and `knitwear` the same way, skipping either if no compatible candidate exists. Returns `null` when the required slots cannot all be filled.

`refillSlot` returns a new outfit with `slot` replaced by the next candidate that is compatible with **all other currently placed garments** and is not the product being replaced. When the slot is optional and nothing fits, the slot is dropped and a valid outfit is still returned. When the slot is required and nothing fits, it returns `null`.

Greedy, not exhaustive: this can fail to find a valid outfit that a full search would find. That is an accepted trade-off — the catalog is ~150–200 items with permissive compatibility rules, and a card deck must feel instant. `null` is handled as an explicit empty state rather than pretended away.

### Exhaustion

`null` from either function surfaces as an empty state: "You've seen everything for this style", with a button that clears `rejectedIds` for the active profile via a new `clearRejections()` action. Without an escape hatch a user who swipes left enough times would brick their own Explore pane.

## Screen structure

```
+------------------------------------+
|          ( Work  v )               |  <- style pill, centred
+------------------------------------+
|  +------------------------------+  |
|  | [art]  Work Jacket           |  |  <- outerwear (if present)
|  |        Carhartt      $109    |  |
|  +------------------------------+  |
|  | [art]  Quarter-Zip           |  |  <- top
|  |        Patagonia     $109    |  |
|  +------------------------------+  |
|  | [art]  Slim Chinos           |  |  <- bottom
|  |        Uniqlo         $49    |  |
|  +------------------------------+  |
|  | [art]  Suede Boots           |  |  <- footwear
|  |        Clarks        $180    |  |
|  +------------------------------+  |
|                                    |
|   $447 total                       |
|   [ Save outfit ]   [ Shuffle ]    |
+------------------------------------+
```

Rows render top-down in a fixed visual order: `outerwear`, `top`, `knitwear`, `bottom`, `footwear`. Absent slots collapse.

Each row is an independent swipeable card. Tapping a row (rather than swiping) opens `/product/[id]`, preserving the existing detail screen.

**Sizing.** Rows share the available height rather than scrolling: the pane computes row height from its measured height divided by the number of visible slots, clamped to a 96–140pt band. The deck must fit on screen without vertical scrolling — a card stack that scrolls invites exactly the gesture ambiguity spec 3 exists to remove. If the clamp cannot fit all rows on a short device, `knitwear` is dropped from display first, then `outerwear`.

## Gesture behaviour

Each `GarmentSwipeCard` owns a `Gesture.Pan()` from `react-native-gesture-handler`, driving Reanimated shared values.

- `activeOffsetX: [-12, 12]` so a pan is only claimed after clear horizontal intent. Vertical movement is not used by the card, but this keeps the gesture from firing on incidental drags.
- Live: `translateX` follows the finger; the card rotates up to ±8° proportionally and a YES / NO badge fades in past 25% of the threshold.
- Threshold: `SWIPE_THRESHOLD = screenWidth * 0.28`, or a flick with `|velocityX| > 800`.
- Commit: the card animates off-screen over 180ms, then the slot refills and the new card enters from the opposite edge.
- Below threshold: spring back to 0.

**Reduced motion.** The app already threads `reduceMotion` through `useTheme()`. When set, the exit and entry animations are replaced by an immediate swap; the drag itself still tracks the finger, since that is direct manipulation rather than decoration.

**Per-card locking.** While one card is mid-commit, other cards ignore new pans. A single `isCommitting` shared value on the pane, checked in each card's `onBegin`, prevents two slots refilling against a stale outfit.

## Actions on swipe

- **Left (no):** `rejectProduct(productId)` — recorded on the active profile so it is never dealt again for that style. Then refill the slot.
- **Right (yes):** `toggleWishlist(productId)` — adds to the active profile's `wishlistIds`. Then refill the slot. The product is *not* added to `rejectedIds`, but because the slot refills, it will not immediately reappear.

Both actions come from spec 1's store API.

**Save outfit:** `saveOutfit(productIds)` stores the current combination against the active profile. The button confirms inline (label swaps to "Saved" for ~1.2s) rather than opening a dialog.

**Shuffle:** rebuilds the whole outfit from scratch without recording any judgement, for a user who dislikes the whole look.

## Style pill

A centred pill at the top of Explore showing the active profile's name with a chevron. Tapping opens a `Modal` with a compact list:

```
  * Work
    Weekend
    Gym
  ------------------
    Manage profiles
```

- Selecting a profile calls `setActiveProfile(id)` and closes. The deck rebuilds from the new profile's vector and rejection set.
- "Manage profiles" closes the sheet and switches to the Profile pane.

**Cross-pane navigation.** The panes are siblings inside the pager in `app/index.tsx`, not routes, so this cannot use `router.push`. The pager already owns an `onSelect(index)` callback; it is passed down to `ExplorePane` as an optional `onNavigateToPane?: (index: number) => void` prop. "Manage profiles" calls `onNavigateToPane(0)`. `PANES` in `lib/pager.ts` already fixes Profile at index 0; the call site uses `PANES.findIndex(p => p.id === 'profile')` rather than a bare `0`.

## Closet additions

Two new sections in `components/panes/ClosetPane.tsx`, placed after "Your pieces":

**Want** — products from `wishlistIds` resolved against `ALL_PRODUCTS`, rendered with the existing `ProductCard`. Each has a remove action calling `toggleWishlist`. Wishlist items are **excluded** from `outfitCount`, `categoryCoverage`, `colorBalance`, `formalitySpread` and `analyzeGaps`, which continue to read `wardrobeItems` only. The section header shows the count and, when empty, explains that swiping right on Explore fills it.

**Saved outfits** — each `SavedOutfit` rendered as a row of `GarmentArt` thumbnails with the total price, and a remove action calling `removeSavedOutfit`. This sits alongside the existing wardrobe-derived "Your outfits" grid, which is unchanged and still built from owned pieces.

A product ID that no longer resolves against `ALL_PRODUCTS` is skipped when rendering rather than throwing. The catalog is generated deterministically from code, so this only happens if archetypes change between builds — but a stale persisted ID must not crash the pane.

## Files

| File | Change |
|---|---|
| `lib/deck.ts` | new — pure deck logic |
| `__tests__/deck.test.ts` | new |
| `components/GarmentSwipeCard.tsx` | new — one swipeable garment row |
| `components/StylePill.tsx` | new — pill + switcher modal |
| `components/panes/ExplorePane.tsx` | rewritten |
| `components/panes/ClosetPane.tsx` | + Want and Saved outfits sections |
| `app/_layout.tsx` | + `GestureHandlerRootView` |
| `app/index.tsx` | pass `onNavigateToPane` to ExplorePane |
| `store/useAppStore.ts` | + `clearRejections` |

`lib/scoring.ts`'s `INTENTS`, `rankProducts` and the intent/price chips are **removed from Explore** but `rankProducts` stays in the codebase — `app/product/[id].tsx` and ClosetPane's gap analysis still use the scoring module.

## Testing

`lib/deck.ts` is pure and gets real coverage in `__tests__/deck.test.ts`:

- `buildOutfit` fills all three required slots from a fixture catalog
- every pair in a built outfit satisfies `areCompatible`
- products in `rejectedIds` never appear in any built outfit
- `buildOutfit` is deterministic: same context twice, deeply equal outfits
- `refillSlot` changes only the named slot and leaves the others identical by reference
- `refillSlot` returns a garment different from the one it replaced
- `refillSlot` on an optional slot with no compatible candidate drops the slot and still returns a valid outfit
- `buildOutfit` returns `null` when the pool cannot fill a required slot (e.g. no footwear at all)
- `candidatesForSlot` returns only the requested category, in deterministic order

Gesture and animation behaviour is **not** unit-tested: the repo has no React renderer in devDependencies and only `lib/` and `theme/` are covered. Card behaviour is verified in the browser, consistent with how the three-pane pager was verified.

## Out of scope

- Undo of a swipe
- Any learning from swipes beyond excluding rejected products (no vector updates)
- Buying, checkout, or affiliate link handling beyond the existing product detail screen
- Wishlist influencing gap analysis or recommendations
- Sharing or exporting outfits
- Accessory slots in the deck

## Risks

**Greedy assembly can dead-end.** Mitigated by the explicit exhaustion empty state and the clear-rejections escape hatch.

**Gesture conflict with the pager.** Real today: the pager in `app/index.tsx` is a horizontally paging `Animated.ScrollView`, and a horizontal pan inside it will fight the card. Spec 3 removes content-area horizontal scrolling entirely, which resolves this properly. **If spec 2 ships before spec 3**, the pager must set `scrollEnabled={false}` as a stopgap, leaving tab taps as the only way to change panes. Shipping spec 2 without either change produces a pane that fights every swipe.

**Catalog depth.** With ~150–200 products spread over six categories, a user swiping aggressively in one category could exhaust a slot within a session. The empty state covers it; growing the catalog is a separate concern.

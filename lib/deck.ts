// lib/deck.ts — pure outfit assembly for the Explore deck. No React/RN/Expo.

import type { Product, StyleVector } from '@/lib/types';
import { areCompatible } from '@/lib/compatibility';
import { styleScore } from '@/lib/scoring';

export type Slot = 'top' | 'bottom' | 'footwear' | 'outerwear' | 'knitwear';

export const REQUIRED_SLOTS: readonly Slot[] = ['top', 'bottom', 'footwear'];
export const OPTIONAL_SLOTS: readonly Slot[] = ['outerwear', 'knitwear'];

/** Top-down render order. Absent slots collapse. */
export const DECK_SLOT_ORDER: readonly Slot[] = [
  'outerwear',
  'top',
  'knitwear',
  'bottom',
  'footwear',
];

export interface DeckOutfit {
  slots: Partial<Record<Slot, Product>>;
}

export interface DeckContext {
  products: Product[];
  userVector: StyleVector;
  rejectedIds: string[];
}

export function outfitProducts(outfit: DeckOutfit): Product[] {
  return DECK_SLOT_ORDER.flatMap((slot) => {
    const product = outfit.slots[slot];
    return product ? [product] : [];
  });
}

function rank(ctx: DeckContext, p: Product): number {
  return styleScore(ctx.userVector, p);
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

function fitsWith(candidate: Product, placed: Product[]): boolean {
  return placed.every((other) => areCompatible(candidate, other));
}

/**
 * Greedy, not exhaustive: it can miss an outfit a full search would find. The
 * catalog is small and the rules permissive, and a deck has to feel instant,
 * so the `null` return is surfaced as an empty state rather than backtracked.
 */
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

// ---------------------------------------------------------------------------
// Feed refill guard
// ---------------------------------------------------------------------------

/**
 * Decides whether the feed should be refilled, loop-free.
 *
 * WHY this is needed: The naive guard `status === 'ready' && remaining <
 * threshold` loops forever on the seeded/offline path. `seededProvider.all()`
 * returns the same `ALL_PRODUCTS` array object every call, so after a refill
 * the store publishes the identical array reference. `remaining` stays below
 * the threshold, the effect fires again, and the store enters an infinite
 * fetch cycle.
 *
 * The backend path has a narrower version: if the server keeps returning a
 * small-but-non-empty pool (user has swiped through most of what it will
 * serve), the same thing happens — the pool never grows past the threshold,
 * so refill is called on every render cycle.
 *
 * THE GUARD: we track `lastRefillFeed` — the exact array reference we most
 * recently triggered a refill for. We only fire if `feed !== lastRefillFeed`,
 * i.e. the feed has genuinely changed since the last refill request. After we
 * fire, the caller stores `feed` as `lastRefillFeed`. If the provider returns
 * the same array object (seeded path), `feed === lastRefillFeed` next time and
 * we stay silent. If the provider returns a new array with more items (live
 * backend with fresh results), `feed !== lastRefillFeed` and a subsequent
 * drain can trigger another refill — satisfying condition (c).
 *
 * Profile switches reset the catalog to `status: 'idle'` and `feed: []`, so
 * `feed !== lastRefillFeed` (which still holds the old feed) — condition (d)
 * is naturally satisfied without extra logic.
 *
 * @param feed          The current feed array (reference matters).
 * @param lastRefillFeed The feed we last requested a refill for, or null if none.
 * @param rejectedIds   IDs the user has already judged (filtered from visible count).
 * @param status        Current catalog status.
 * @param threshold     Request a refill when visible items fall below this count.
 * @returns true if a refill should be fired; false otherwise.
 */
export function shouldRefill(
  feed: Product[],
  lastRefillFeed: Product[] | null,
  rejectedIds: string[],
  status: 'idle' | 'loading' | 'ready' | 'degraded',
  threshold: number,
): boolean {
  if (status !== 'ready') return false;
  const rejectedSet = new Set(rejectedIds);
  const remaining = feed.filter((p) => !rejectedSet.has(p.id)).length;
  if (remaining >= threshold) return false;
  // Only refill if this is a different feed from the one we already refilled.
  // Reference equality intentionally detects the seeded provider's no-op refill.
  return feed !== lastRefillFeed;
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

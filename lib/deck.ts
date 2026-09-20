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

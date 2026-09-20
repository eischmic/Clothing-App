// lib/scoring.ts — Weighted scoring and ranking pipeline.
// Hard constraint: zero React / React Native / Expo imports. Pure TypeScript.

import { cosineSimilarity } from '@/lib/vector';
import { areCompatible } from '@/lib/compatibility';
import { wardrobeImpact } from '@/lib/outfits';
import {
  SCORE_WEIGHTS,
  type Product,
  type WardrobeItem,
  type InspoImage,
  type StyleVector,
  type Formality,
  type Recommendation,
  type ScoreComponent,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

export const INTENTS = [
  { id: 'jacket',   label: 'A jacket',             category: 'outerwear', targetFormality: 3 },
  { id: 'pants',    label: 'Pants',                category: 'bottom',    targetFormality: 3 },
  { id: 'shoes',    label: 'Shoes',                category: 'footwear',  targetFormality: 3 },
  { id: 'everyday', label: 'Everyday clothes',     category: 'top',       targetFormality: 2 },
  { id: 'event',    label: 'Something for an event', category: null,      targetFormality: 4 },
  { id: 'surprise', label: 'Surprise me',           category: null,       targetFormality: 3 },
] as const;

export type IntentId = (typeof INTENTS)[number]['id'];

// ---------------------------------------------------------------------------
// Component scores
// ---------------------------------------------------------------------------

/**
 * Style similarity: cosine similarity between user vector and product vector.
 * `cosineSimilarity` already returns [0,1] — no further normalisation needed.
 */
export function styleScore(user: StyleVector, p: Product): number {
  return cosineSimilarity(user, p.vector);
}

/**
 * Wardrobe compatibility: fraction of wardrobe items that are compatible with
 * the product, scaled so 6+ pairings saturates to 1.
 */
/** Pairings at or above this count saturate `wardrobeScore` to 1. */
export const WARDROBE_SATURATION = 6;

export function wardrobeScore(wardrobe: WardrobeItem[], p: Product): number {
  let count = 0;
  for (const item of wardrobe) {
    if (areCompatible(item, p)) count++;
  }
  return Math.min(1, count / WARDROBE_SATURATION);
}


/**
 * Occasion match: 1 - |productFormality - targetFormality| / 4.
 * Clamped to [0, 1] (the formula naturally reaches 0 at max distance of 4).
 */
export function occasionScore(p: Product, targetFormality: Formality | number): number {
  return Math.max(0, 1 - Math.abs(p.formality - targetFormality) / 4);
}

// ---------------------------------------------------------------------------
// Reason generation
// ---------------------------------------------------------------------------

function buildReasons(
  scores: Record<ScoreComponent, number>,
  pairsWith: WardrobeItem[],
  newOutfits: number,
): string[] {
  const reasons: string[] = [];

  if (scores.style > 0.75) {
    const pct = Math.round(scores.style * 100);
    reasons.push(`${pct}% style match`);
  }

  if (pairsWith.length >= 3) {
    reasons.push(`Works with ${pairsWith.length} pieces you own`);
  }

  if (newOutfits > 0) {
    reasons.push(`Unlocks ${newOutfits} new outfit${newOutfits === 1 ? '' : 's'}`);
  }

  if (scores.occasion > 0.9) {
    reasons.push('Perfect formality for the occasion');
  }

  // Ensure reasons is never empty
  if (reasons.length === 0) {
    const pct = Math.round(scores.style * 100);
    reasons.push(`${pct}% style match`);
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// scoreProduct
// ---------------------------------------------------------------------------

export interface ScoreProductArgs {
  userVector: StyleVector;
  wardrobe: WardrobeItem[];
  inspoImages: InspoImage[];
  product: Product;
  targetFormality: number;
}

export function scoreProduct(args: ScoreProductArgs): Recommendation {
  const { userVector, wardrobe, inspoImages, product, targetFormality } = args;

  const compatibleItems = wardrobe.filter((item) => areCompatible(item, product));

  const scores: Record<ScoreComponent, number> = {
    style:    styleScore(userVector, product),
    wardrobe: Math.min(1, compatibleItems.length / WARDROBE_SATURATION),
    occasion: occasionScore(product, targetFormality),
  };

  const total =
    SCORE_WEIGHTS.style    * scores.style +
    SCORE_WEIGHTS.wardrobe * scores.wardrobe +
    SCORE_WEIGHTS.occasion * scores.occasion;

  const pairsWith = compatibleItems.slice(0, WARDROBE_SATURATION);

  // New outfits unlocked
  const newOutfits = wardrobeImpact(wardrobe, product);

  // similarInspo: pass through inspoImages as-is (image-similarity model arrives in a later task)
  const similarInspo = inspoImages;

  const reasons = buildReasons(scores, pairsWith, newOutfits);

  return {
    product,
    scores,
    total,
    pairsWith,
    similarInspo,
    newOutfits,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// rankProducts
// ---------------------------------------------------------------------------

export interface RankProductsArgs {
  userVector: StyleVector;
  wardrobe: WardrobeItem[];
  inspoImages: InspoImage[];
  products: Product[];
  intentId: IntentId;
  limit: number;
}

export function rankProducts(args: RankProductsArgs): Recommendation[] {
  const { userVector, wardrobe, inspoImages, products, intentId, limit } = args;

  const intent = INTENTS.find((i) => i.id === intentId);
  if (!intent) throw new Error(`Unknown intentId: ${intentId}`);

  // Filter by category when the intent specifies one
  const candidates = intent.category === null
    ? products
    : products.filter((p) => p.category === intent.category);

  // Score all candidates
  const scored = candidates.map((product) =>
    scoreProduct({
      userVector,
      wardrobe,
      inspoImages,
      product,
      targetFormality: intent.targetFormality,
    }),
  );

  // Sort descending by total; break ties on product.id (lexicographic, deterministic)
  scored.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0;
  });

  return scored.slice(0, limit);
}

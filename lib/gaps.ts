// lib/gaps.ts — Wardrobe gap analysis engine.
// Hard constraint: zero React / React Native / Expo imports. Pure TypeScript.

import { scoreProduct } from '@/lib/scoring';
import { areCompatible } from '@/lib/compatibility';
import { wardrobeImpact } from '@/lib/outfits';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import {
  CATEGORIES,
  COLOR_FAMILIES,
  type Category,
  type ColorFamily,
  type WardrobeItem,
  type Product,
  type Recommendation,
  type StyleVector,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Category targets (brief §Task-11, verbatim)
// ---------------------------------------------------------------------------

export const CATEGORY_TARGETS: Record<Category, number> = {
  top: 4,
  bottom: 3,
  footwear: 3,
  outerwear: 2,
  knitwear: 2,
  accessory: 1,
};

// ---------------------------------------------------------------------------
// Gap type
// ---------------------------------------------------------------------------

export interface Gap {
  id: string;
  kind: 'coverage' | 'color' | 'formality' | 'pairability';
  title: string;
  reasoning: string;
  confidence: number;
  category: Category | null;
  suggestion: Recommendation | null;
  newOutfits: number;
}

// ---------------------------------------------------------------------------
// analyzeGaps args
// ---------------------------------------------------------------------------

export interface AnalyzeGapsArgs {
  wardrobe: WardrobeItem[];
  userVector: StyleVector;
  products: Product[];
  budgetCenter: number;
}

// ---------------------------------------------------------------------------
// Readout helpers
// ---------------------------------------------------------------------------

/**
 * Returns count and target for every category.
 */
export function categoryCoverage(
  items: WardrobeItem[],
): Record<Category, { count: number; target: number }> {
  const result = {} as Record<Category, { count: number; target: number }>;
  for (const c of CATEGORIES) {
    result[c] = { count: 0, target: CATEGORY_TARGETS[c] };
  }
  for (const item of items) {
    if (result[item.category]) {
      result[item.category].count++;
    }
  }
  return result;
}

/**
 * Returns the fractional share of each COLOR_FAMILY in the wardrobe.
 * If the wardrobe is empty every share is 0 (no division by zero).
 */
export function colorBalance(items: WardrobeItem[]): Record<ColorFamily, number> {
  const counts = {} as Record<ColorFamily, number>;
  for (const f of COLOR_FAMILIES) {
    counts[f] = 0;
  }
  if (items.length === 0) return counts;

  for (const item of items) {
    counts[item.colorFamily]++;
  }

  const total = items.length;
  const shares = {} as Record<ColorFamily, number>;
  for (const f of COLOR_FAMILIES) {
    shares[f] = counts[f] / total;
  }
  return shares;
}

/**
 * Returns min formality, max formality, and the count of distinct levels present.
 */
export function formalitySpread(items: WardrobeItem[]): {
  min: number;
  max: number;
  levels: number;
} {
  if (items.length === 0) return { min: 0, max: 0, levels: 0 };
  const levels = new Set(items.map((i) => i.formality));
  const sorted = Array.from(levels).sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    levels: levels.size,
  };
}

/**
 * Returns items that have zero compatible partners in the wardrobe.
 */
export function orphanItems(items: WardrobeItem[]): WardrobeItem[] {
  return items.filter((item) => {
    return !items.some((other) => other.id !== item.id && areCompatible(item, other));
  });
}

// ---------------------------------------------------------------------------
// Internal: attach a suggestion for a gap category
// ---------------------------------------------------------------------------

function attachSuggestion(
  category: Category,
  args: AnalyzeGapsArgs,
): { suggestion: Recommendation; newOutfits: number } | null {
  const { wardrobe, userVector, products, budgetCenter } = args;

  // Filter the product list to the gap category
  const candidates = products.filter((p) => p.category === category);
  if (candidates.length === 0) return null;

  // Score all candidates and take the best one
  const scored = candidates
    .map((product) =>
      scoreProduct({
        userVector,
        wardrobe,
        inspoImages: [],
        product,
        targetFormality: 2,
        budgetCenter,
      }),
    )
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.product.id < b.product.id ? -1 : 1;
    });

  const best = scored[0];
  return { suggestion: best, newOutfits: best.newOutfits };
}

// ---------------------------------------------------------------------------
// Analysers
// ---------------------------------------------------------------------------

function analyzeCoverage(items: WardrobeItem[], args: AnalyzeGapsArgs): Gap[] {
  const coverage = categoryCoverage(items);
  const gaps: Gap[] = [];

  for (const category of CATEGORIES) {
    const { count, target } = coverage[category];
    if (count < target) {
      const raw = (target - count) / target;
      const confidence = Math.min(0.95, Math.max(0.4, raw));

      const attached = attachSuggestion(category, args);

      gaps.push({
        id: `coverage-${category}`,
        kind: 'coverage',
        title: `Add more ${category} pieces`,
        reasoning: `You have ${count} ${category} item${count === 1 ? '' : 's'} but aim for at least ${target}. Filling this gap will give you more outfit combinations.`,
        confidence,
        category,
        suggestion: attached?.suggestion ?? null,
        newOutfits: attached?.newOutfits ?? 0,
      });
    }
  }

  return gaps;
}

function analyzeColor(items: WardrobeItem[], args: AnalyzeGapsArgs): Gap[] {
  if (items.length === 0) return [];

  const shares = colorBalance(items);
  const gaps: Gap[] = [];

  // Condition 1: one colour family exceeds 70%
  for (const [family, share] of Object.entries(shares) as [ColorFamily, number][]) {
    if (share > 0.7) {
      const excess = share - 0.7;
      // Confidence rises linearly from 0 at 70% to 1 at 100%
      const confidence = Math.min(1, excess / 0.3);

      gaps.push({
        id: `color-dominant-${family}`,
        kind: 'color',
        title: `Too much ${family} in your wardrobe`,
        reasoning: `${Math.round(share * 100)}% of your items are in the ${family} family. Adding contrast pieces will unlock more varied looks.`,
        confidence,
        category: null,
        suggestion: null,
        newOutfits: 0,
      });
    }
  }

  // Condition 2: no neutral anchor
  if (shares['neutral'] === 0) {
    gaps.push({
      id: 'color-no-neutral',
      kind: 'color',
      title: 'No neutral anchor pieces',
      reasoning: 'Your wardrobe has no neutral-coloured items (black, white, grey, cream). A neutral base makes everything easier to combine.',
      confidence: 0.6,
      category: null,
      suggestion: null,
      newOutfits: 0,
    });
  }

  return gaps;
}

function analyzeFormality(items: WardrobeItem[], args: AnalyzeGapsArgs): Gap[] {
  if (items.length === 0) return [];

  const spread = formalitySpread(items);
  if (spread.levels >= 3) return [];

  return [
    {
      id: 'formality-narrow',
      kind: 'formality',
      title: 'Your wardrobe covers a narrow formality range',
      reasoning: `All your items sit at formality level${spread.levels === 1 ? '' : 's'} ${spread.min}${spread.min !== spread.max ? `–${spread.max}` : ''}. Adding pieces at different formality levels will let you dress up or down.`,
      confidence: 0.9,
      category: null,
      suggestion: null,
      newOutfits: 0,
    },
  ];
}

function analyzePairability(items: WardrobeItem[], args: AnalyzeGapsArgs): Gap[] {
  if (items.length === 0) return [];

  const orphans = orphanItems(items);
  if (orphans.length === 0) return [];

  const fraction = orphans.length / items.length;
  const confidence = Math.min(1, fraction);

  return [
    {
      id: 'pairability-orphans',
      kind: 'pairability',
      title: `${orphans.length} item${orphans.length === 1 ? '' : 's'} that pair with nothing`,
      reasoning: `${orphans.map((o) => o.name).join(', ')} ${orphans.length === 1 ? 'has' : 'have'} no compatible partners in your wardrobe. Adding bridging pieces would put ${orphans.length === 1 ? 'it' : 'them'} to work.`,
      confidence,
      category: null,
      suggestion: null,
      newOutfits: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Public: analyzeGaps
// ---------------------------------------------------------------------------

export function analyzeGaps(args: AnalyzeGapsArgs): Gap[] {
  const { wardrobe } = args;

  const gaps: Gap[] = [
    ...analyzeCoverage(wardrobe, args),
    ...analyzeColor(wardrobe, args),
    ...analyzeFormality(wardrobe, args),
    ...analyzePairability(wardrobe, args),
  ];

  // Sort descending by confidence
  gaps.sort((a, b) => b.confidence - a.confidence);

  return gaps;
}

// lib/compatibility.ts — Garment-to-garment compatibility rules (outfit edge function).
// Hard constraint: zero React / React Native / Expo imports. Pure TypeScript.

import type { Garment, Category, ColorFamily } from '@/lib/types';

// ---------------------------------------------------------------------------
// Slot rules
// ---------------------------------------------------------------------------

/**
 * Categories that may not appear twice in the same outfit.
 * `accessory` is intentionally omitted — two accessories may coexist.
 * `outerwear` + `knitwear` is a permitted layering combination, handled below.
 */
const LAYERABLE_PAIRS = new Set<string>(['knitwear|outerwear']);

function slotKey(a: Category, b: Category): string {
  return [a, b].sort().join('|');
}

function sameSlotViolation(a: Category, b: Category): boolean {
  if (a === 'accessory' || b === 'accessory') return false;
  if (a !== b) {
    // Different categories — only reject if it's NOT a known layerable pair
    return false;
  }
  // Same category — always a violation (accessories already excluded above)
  return true;
}

// ---------------------------------------------------------------------------
// Colour-family rules
// ---------------------------------------------------------------------------

/**
 * Permitted cross-family pairings.  Keyed with sorted family names so the
 * lookup is inherently symmetric — no need to list both orderings.
 *
 * Same-family pairing is always OK *except* bold|bold (handled separately).
 * neutral pairs with everything (also handled separately).
 */
const CROSS_FAMILY_OK = new Set(['earth|neutral', 'earth|warm', 'cool|neutral']);

function pairKey(a: ColorFamily, b: ColorFamily): string {
  return [a, b].sort().join('|');
}

function colourViolation(a: ColorFamily, b: ColorFamily): boolean {
  // neutral pairs freely with any family
  if (a === 'neutral' || b === 'neutral') return false;
  // two bold items never work
  if (a === 'bold' && b === 'bold') return true;
  // same family (non-bold) is fine
  if (a === b) return false;
  // cross-family: only permitted pairs pass
  return !CROSS_FAMILY_OK.has(pairKey(a, b));
}

// ---------------------------------------------------------------------------
// Formality rule
// ---------------------------------------------------------------------------

function formalityViolation(a: Garment, b: Garment): boolean {
  return Math.abs(a.formality - b.formality) > 1;
}

// ---------------------------------------------------------------------------
// Season rule
// ---------------------------------------------------------------------------

function seasonViolation(a: Garment, b: Garment): boolean {
  return !a.seasons.some((s) => b.seasons.includes(s));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the human-readable reason the first rule is violated, or `null`
 * when the two garments are compatible.  The string is rendered directly to
 * the user on the Fits screen (Task 17), so keep it short and plain.
 */
export function incompatibilityReason(a: Garment, b: Garment): string | null {
  if (sameSlotViolation(a.category, b.category)) return 'same slot';
  if (colourViolation(a.colorFamily, b.colorFamily)) return 'colour clash';
  if (formalityViolation(a, b)) return 'formality gap';
  if (seasonViolation(a, b)) return 'season mismatch';
  return null;
}

/**
 * Returns `true` when the two garments may appear together in an outfit.
 * Symmetry is structural: each sub-rule uses sorted keys or absolute values,
 * so `areCompatible(a, b) === areCompatible(b, a)` always holds.
 */
export function areCompatible(a: Garment, b: Garment): boolean {
  return incompatibilityReason(a, b) === null;
}

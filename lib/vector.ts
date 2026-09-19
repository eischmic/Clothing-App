// lib/vector.ts — Style vector math, questionnaire mapping, and image attribute conversion.
// Hard constraint: zero React / React Native / Expo imports. Pure TypeScript.

import {
  STYLE_DIMENSIONS,
  IMAGE_WEIGHT,
  QUESTIONNAIRE_WEIGHT,
  type StyleVector,
  type StyleDimension,
  type StyleWord,
  type Questionnaire,
  type ImageAttributes,
  type Garment,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Returns a StyleVector with every dimension set to 0. */
export function zeroVector(): StyleVector {
  return Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, 0])) as StyleVector;
}

/** Clamps every dimension of `v` into the range [0, 1]. */
export function clampVector(v: StyleVector): StyleVector {
  return Object.fromEntries(
    STYLE_DIMENSIONS.map((d) => [d, Math.min(1, Math.max(0, v[d]))]),
  ) as StyleVector;
}

// ---------------------------------------------------------------------------
// Cosine similarity
// Zero-vector case: if either vector has magnitude 0, return 0 rather than NaN.
// The raw cosine value is in [-1, 1]; we map it to [0, 1] via (raw + 1) / 2 so
// the contract holds even if negative dimensions are introduced in the future.
// Because all current dimensions are non-negative the raw value is already in
// [0, 1], but the mapping is applied unconditionally.
// ---------------------------------------------------------------------------

/** Returns cosine similarity in [0, 1].  Returns 0 for any zero-magnitude vector. */
export function cosineSimilarity(a: StyleVector, b: StyleVector): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const d of STYLE_DIMENSIONS) {
    dot += a[d] * b[d];
    magA += a[d] * a[d];
    magB += b[d] * b[d];
  }
  if (magA === 0 || magB === 0) return 0;
  const raw = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  return (raw + 1) / 2;
}

// ---------------------------------------------------------------------------
// Blend
// ---------------------------------------------------------------------------

/**
 * Weighted average of multiple vectors.  Weights are normalised so they need
 * not sum to 1.  Returns a zero vector for an empty list.
 */
export function blendVectors(
  weighted: Array<{ vector: StyleVector; weight: number }>,
): StyleVector {
  if (weighted.length === 0) return zeroVector();
  const totalWeight = weighted.reduce((s, { weight }) => s + weight, 0);
  if (totalWeight === 0) return zeroVector();
  const result = zeroVector();
  for (const { vector, weight } of weighted) {
    const norm = weight / totalWeight;
    for (const d of STYLE_DIMENSIONS) {
      result[d] += vector[d] * norm;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Questionnaire → vector
// ---------------------------------------------------------------------------

/**
 * Slider mappings.
 *
 * minimalExpressive: 0 = minimal, 1 = expressive
 *   → minimalism = 1 - value, pattern += value * 0.5, colorfulness = value
 *
 * classicTrendy: 0 = classic, 1 = trendy
 *   → vintage = 1 - value, streetwear = value * 0.7
 *
 * formalCasual: 0 = formal, 1 = casual
 *   → formal = 1 - value, relaxedFit = value, workwear += (1 - value) * 0.3
 *
 * practicalFashion: 0 = practical, 1 = fashion
 *   → workwear = (1 - value) * 0.6, outdoor = (1 - value) * 0.5
 *
 * neutralColorful: 0 = neutral, 1 = colorful
 *   → colorfulness = value
 */
export function questionnaireToVector(q: Questionnaire): StyleVector {
  const s = q.sliders;
  const v = zeroVector();

  // minimalExpressive
  v.minimalism = 1 - s.minimalExpressive;
  v.pattern    = s.minimalExpressive * 0.5;
  v.colorfulness = s.minimalExpressive;

  // classicTrendy
  v.vintage    = 1 - s.classicTrendy;
  v.streetwear = s.classicTrendy * 0.7;

  // formalCasual
  v.formal     = 1 - s.formalCasual;
  v.relaxedFit = s.formalCasual;

  // practicalFashion
  v.workwear = (1 - s.practicalFashion) * 0.6;
  v.outdoor  = (1 - s.practicalFashion) * 0.5;

  // neutralColorful — blends with minimalExpressive contribution
  // Take the max of the two colorfulness signals so both sliders have effect.
  v.colorfulness = Math.max(v.colorfulness, s.neutralColorful);

  // Apply word boosts
  for (const word of q.words) {
    const boost = WORD_BOOSTS[word];
    if (!boost) continue;
    for (const d of STYLE_DIMENSIONS) {
      const delta = (boost as Partial<StyleVector>)[d] ?? 0;
      v[d] += delta;
    }
  }

  return clampVector(v);
}

// ---------------------------------------------------------------------------
// Word boosts (verbatim from spec)
// ---------------------------------------------------------------------------

const WORD_BOOSTS: Record<StyleWord, Partial<StyleVector>> = {
  Outdoorsy:    { outdoor: 0.15, workwear: 0.15 },
  Creative:     { pattern: 0.15, colorfulness: 0.15 },
  Professional: { formal: 0.15, minimalism: 0.15 },
  'Laid-back':  { relaxedFit: 0.15, formal: -0.15 },
  Bold:         { colorfulness: 0.15, pattern: 0.15 },
  Minimalist:   { minimalism: 0.15, pattern: -0.15 },
  Vintage:      { vintage: 0.15, streetwear: 0.15 },
  Athletic:     { relaxedFit: 0.15, outdoor: 0.15 },
  Experimental: { pattern: 0.15, streetwear: 0.15 },
};

// ---------------------------------------------------------------------------
// Image attributes → vector
// ---------------------------------------------------------------------------

/**
 * Converts a single ImageAttributes object into a StyleVector by matching
 * keyword strings against known dimension patterns.
 */
function singleAttributesToVector(attrs: ImageAttributes): StyleVector {
  const v = zeroVector();
  const hits: Partial<Record<StyleDimension, number>> = {};

  function score(dim: StyleDimension, delta: number): void {
    hits[dim] = (hits[dim] ?? 0) + 1;
    v[dim] += delta;
  }

  // --- style tokens ---
  for (const s of attrs.style) {
    const t = s.toLowerCase();
    if (/minimal/.test(t))                        score('minimalism', 0.8);
    if (/workwear|utility|carpenter/.test(t))     score('workwear', 0.8);
    if (/outdoor|technical|hiking/.test(t))       score('outdoor', 0.8);
    if (/street/.test(t))                         score('streetwear', 0.8);
    if (/vintage|retro|heritage/.test(t))         score('vintage', 0.8);
    if (/formal|tailored|suit/.test(t))           score('formal', 0.8);
    if (/casual|relaxed|laid/.test(t))            score('relaxedFit', 0.8);
    if (/bold|colorful|vibrant/.test(t))          score('colorfulness', 0.8);
  }

  // --- fit tokens ---
  for (const f of attrs.fit) {
    const t = f.toLowerCase();
    if (/relaxed|oversized|baggy|straight/.test(t)) score('relaxedFit', 0.8);
    if (/slim|fitted|tailored/.test(t))             score('formal', 0.5);
  }

  // --- pattern tokens ---
  for (const p of attrs.patterns) {
    const t = p.toLowerCase();
    if (/solid/.test(t))                                   score('pattern', -0.3);
    if (/stripe|check|plaid|floral|print|graphic/.test(t)) score('pattern', 0.8);
  }

  // --- material tokens ---
  for (const m of attrs.materials) {
    const t = m.toLowerCase();
    if (/denim/.test(t))                   score('workwear', 0.5);
    if (/wool|flannel|tweed/.test(t))      score('formal', 0.4);
    if (/cotton|linen/.test(t))            score('minimalism', 0.3);
    if (/leather/.test(t))                 score('streetwear', 0.4);
    if (/technical|nylon|gore-tex/.test(t)) score('outdoor', 0.6);
  }

  // --- color tokens → colorfulness ---
  for (const c of attrs.colors) {
    const t = c.toLowerCase();
    if (/olive|khaki|cream|black|white|grey|charcoal|beige|tan|camel|brown/.test(t)) {
      score('colorfulness', 0.1);
    } else {
      score('colorfulness', 0.7);
    }
  }

  // Average contributions that have hits; leave zeros for dimensions with no signal
  for (const d of STYLE_DIMENSIONS) {
    const n = hits[d];
    if (n && n > 1) {
      v[d] = v[d] / n;
    }
  }

  return clampVector(v);
}

/**
 * Converts an array of ImageAttributes objects into a single StyleVector by
 * averaging their individual vectors.  Returns a zero vector for an empty array.
 */
export function attributesToVector(attrs: ImageAttributes[]): StyleVector {
  if (attrs.length === 0) return zeroVector();
  return blendVectors(attrs.map((a) => ({ vector: singleAttributesToVector(a), weight: 1 })));
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

/**
 * Blends image-derived and questionnaire-derived vectors with the canonical
 * weights.  Falls back to pure questionnaire when no image attributes are
 * supplied.
 */
export function composeStyleVector(
  attrs: ImageAttributes[],
  q: Questionnaire,
): StyleVector {
  const qv = questionnaireToVector(q);
  if (attrs.length === 0) return qv;
  const iv = attributesToVector(attrs);
  return blendVectors([
    { vector: iv, weight: IMAGE_WEIGHT },
    { vector: qv, weight: QUESTIONNAIRE_WEIGHT },
  ]);
}

// ---------------------------------------------------------------------------
// Garment → vector
// ---------------------------------------------------------------------------

/**
 * Produces a StyleVector from the subset of garment fields the brief requires.
 * Formality maps to formal/relaxedFit; category and colorFamily add secondary
 * signals.
 */
export function garmentToVector(
  g: Pick<Garment, 'category' | 'colorFamily' | 'formality'>,
): StyleVector {
  const v = zeroVector();

  // formality 1-5 → formal: (f-1)/4, relaxedFit: 1 - (f-1)/4
  const fNorm = (g.formality - 1) / 4;
  v.formal     = fNorm;
  v.relaxedFit = 1 - fNorm;

  // category hints
  switch (g.category) {
    case 'outerwear': v.outdoor   += 0.4; break;
    case 'footwear':  v.streetwear += 0.2; break;
    case 'knitwear':  v.minimalism += 0.2; v.workwear += 0.1; break;
    case 'accessory': v.streetwear += 0.1; break;
    default: break;
  }

  // colorFamily hints
  switch (g.colorFamily) {
    case 'bold':    v.colorfulness += 0.6; v.streetwear += 0.2; break;
    case 'warm':    v.colorfulness += 0.3; v.vintage    += 0.2; break;
    case 'cool':    v.colorfulness += 0.2; v.workwear   += 0.1; break;
    case 'earth':   v.outdoor      += 0.3; v.workwear   += 0.2; break;
    case 'neutral': v.minimalism   += 0.3; break;
    default: break;
  }

  return clampVector(v);
}

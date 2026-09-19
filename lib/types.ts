// lib/types.ts — single source of truth for all shared types and enum tables.
// Hard constraint: zero imports. Pure TypeScript. No React, React Native, or Expo.

export const STYLE_DIMENSIONS = [
  'minimalism', 'streetwear', 'workwear', 'outdoor', 'vintage',
  'formal', 'colorfulness', 'pattern', 'relaxedFit',
] as const;
export type StyleDimension = (typeof STYLE_DIMENSIONS)[number];
export type StyleVector = Record<StyleDimension, number>;

export const CATEGORIES = ['top', 'bottom', 'outerwear', 'footwear', 'knitwear', 'accessory'] as const;
export type Category = (typeof CATEGORIES)[number];

export const COLOR_FAMILIES = ['neutral', 'warm', 'cool', 'earth', 'bold'] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const VIBE_NAMES = ['noir', 'ember', 'sage', 'cobalt', 'orchid', 'sand'] as const;
export type VibeName = (typeof VIBE_NAMES)[number];

export type Formality = 1 | 2 | 3 | 4 | 5;

/** The shared shape the outfit edge rules operate on. */
export interface Garment {
  category: Category;
  colorFamily: ColorFamily;
  formality: Formality;
  seasons: Season[];
}

export const SCORE_WEIGHTS = { style: 0.5, wardrobe: 0.2, price: 0.15, occasion: 0.15 } as const;
export const IMAGE_WEIGHT = 0.6;
export const QUESTIONNAIRE_WEIGHT = 0.4;

export const SLIDER_KEYS = [
  'minimalExpressive', 'classicTrendy', 'formalCasual',
  'practicalFashion', 'neutralColorful',
] as const;
export type SliderKey = (typeof SLIDER_KEYS)[number];

export const STYLE_WORDS = [
  'Outdoorsy', 'Creative', 'Professional', 'Laid-back', 'Bold',
  'Minimalist', 'Vintage', 'Athletic', 'Experimental',
] as const;
export type StyleWord = (typeof STYLE_WORDS)[number];

export type Questionnaire = { sliders: Record<SliderKey, number>; words: StyleWord[] };

export const COLOR_TO_VIBE: Record<string, VibeName> = {
  black: 'noir', white: 'noir', grey: 'noir', charcoal: 'noir', ivory: 'noir',
  cream: 'sand', beige: 'sand', tan: 'sand', camel: 'sand', brown: 'sand', chocolate: 'sand',
  rust: 'ember', terracotta: 'ember', orange: 'ember', burgundy: 'ember', red: 'ember',
  olive: 'sage', forest: 'sage', khaki: 'sage', sage: 'sage',
  navy: 'cobalt', indigo: 'cobalt', denim: 'cobalt', cobalt: 'cobalt',
  purple: 'orchid', lilac: 'orchid', magenta: 'orchid', pink: 'orchid',
  yellow: 'ember', mustard: 'sand',
};

export const COLOR_TO_FAMILY: Record<string, ColorFamily> = {
  black: 'neutral', white: 'neutral', grey: 'neutral', charcoal: 'neutral',
  ivory: 'neutral', cream: 'neutral', beige: 'neutral',
  tan: 'earth', camel: 'earth', brown: 'earth', chocolate: 'earth',
  olive: 'earth', forest: 'earth', khaki: 'earth', sage: 'earth',
  rust: 'warm', terracotta: 'warm', orange: 'warm', burgundy: 'warm', mustard: 'warm',
  navy: 'cool', indigo: 'cool', denim: 'cool', cobalt: 'cool',
  purple: 'bold', lilac: 'bold', magenta: 'bold', pink: 'bold',
  red: 'bold', yellow: 'bold',
};

// ---- Full interface set from spec §4 ----

export interface InspoImage {
  id: string;
  uri: string;
  uploadedAt: string;
}

export interface ImageAttributes {
  styleVector: StyleVector;
  dominantColors: string[];
  vibes: VibeName[];
}

export interface StyleProfile {
  vector: StyleVector;
  vibes: VibeName[];
  dominantColors: string[];
  questionnaire: Questionnaire | null;
  createdAt: string;
  updatedAt: string;
}

export interface WardrobeItem {
  id: string;
  name: string;
  category: Category;
  color: string;
  colorFamily: ColorFamily;
  formality: Formality;
  seasons: Season[];
  imageUri: string;
  createdAt: string;
}

export type GarmentAttributes = Pick<WardrobeItem, 'name' | 'category' | 'color' | 'colorFamily' | 'formality' | 'seasons'>;

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  imageUri: string;
  category: Category;
  color: string;
  colorFamily: ColorFamily;
  formality: Formality;
  seasons: Season[];
  affiliateUrl: string;
}

export interface Recommendation {
  product: Product;
  score: number;
  reasons: string[];
}

// lib/catalog/backendMapper.ts — pure BackendProfileItem → Product mapping.
// Hard constraint: zero React / React Native / Expo imports, and no network.
// Kept separate from backendProvider.ts precisely so it is testable against a
// committed fixture with no fetch in sight.

import type { BackendProfileItem } from '@/lib/backend';
import {
  CATEGORIES,
  COLOR_FAMILIES,
  SEASONS,
  STYLE_DIMENSIONS,
  type Category,
  type ColorFamily,
  type Formality,
  type Product,
  type Season,
  type StyleVector,
} from '@/lib/types';

const CATEGORY_SET = new Set<string>(CATEGORIES);
const FAMILY_SET = new Set<string>(COLOR_FAMILIES);
const SEASON_SET = new Set<string>(SEASONS);

/** Middle of every axis — the honest answer when the backend sent no vector. */
const NEUTRAL_AXIS = 0.5;

function toCategory(value: string): Category {
  return CATEGORY_SET.has(value) ? (value as Category) : 'top';
}

function toColorFamily(value: string): ColorFamily {
  return FAMILY_SET.has(value) ? (value as ColorFamily) : 'neutral';
}

function toFormality(value: number): Formality {
  const n = Math.round(value);
  return (n >= 1 && n <= 5 ? n : 3) as Formality;
}

function toSeasons(values: string[]): Season[] {
  const kept = (values ?? []).filter((s): s is Season => SEASON_SET.has(s));
  // An item with no season is unwearable; fall back to all-year.
  return kept.length > 0 ? kept : [...SEASONS];
}

/**
 * Exported, not private: the backend sends the 9 axes as a bare array in
 * STYLE_DIMENSIONS order in two places — on each catalogue item and on the
 * profile detail — and `analyzing.tsx` (Task 12) needs the profile one.
 */
export function arrayToStyleVector(values: number[]): StyleVector {
  const vector = {} as StyleVector;
  STYLE_DIMENSIONS.forEach((dim, i) => {
    const v = values?.[i];
    vector[dim] = typeof v === 'number' && Number.isFinite(v) ? v : NEUTRAL_AXIS;
  });
  return vector;
}

export function mapProfileItemToProduct(item: BackendProfileItem): Product {
  return {
    id: item.article_id,
    // The catalogue is H&M's; there is no per-item brand column.
    brand: 'H&M',
    name: item.name ?? item.article_id,
    imageUri: item.image_url,
    url: item.buy_url,
    description: item.description ?? '',
    category: toCategory(item.category),
    color: (item.colour ?? 'unknown').toLowerCase(),
    colorFamily: toColorFamily(item.colour_family),
    formality: toFormality(item.formality),
    seasons: toSeasons(item.seasons),
    vector: arrayToStyleVector(item.vector),
  };
}

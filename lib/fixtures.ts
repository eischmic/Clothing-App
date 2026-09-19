// lib/fixtures.ts — demo fixtures for development and onboarding.
// Hard constraint: zero React / React Native / Expo imports. Pure TypeScript + lib/.

import { deriveVibe } from '@/lib/vibe';
import type {
  StyleProfile,
  StyleVector,
  WardrobeItem,
  VibeName,
} from '@/lib/types';
import { COLOR_TO_FAMILY } from '@/lib/types';

// ---- Extended demo profile type ----

export interface DemoStyleProfile extends StyleProfile {
  /** Three headline style tags shown on the Home screen. */
  tags: string[];
  /** Resolved vibe derived from dominantColors. */
  vibe: VibeName;
}

// ---- DEMO_PROFILE ----

const DEMO_COLORS = ['olive', 'black', 'cream', 'brown'];

const DEMO_VECTOR: StyleVector = {
  minimalism:    0.75,
  streetwear:    0.25,
  workwear:      0.35,
  outdoor:       0.70,
  vintage:       0.30,
  formal:        0.15,
  colorfulness:  0.20,
  pattern:       0.10,
  relaxedFit:    0.80,
};

export const DEMO_PROFILE: DemoStyleProfile = {
  vector:         DEMO_VECTOR,
  vibes:          ['sage', 'sand', 'noir'],
  vibe:           deriveVibe(DEMO_COLORS),  // → 'sage' (olive wins)
  tags:           ['Relaxed', 'Minimal', 'Outdoorsy'],
  dominantColors: DEMO_COLORS,
  questionnaire:  null,
  createdAt:      '2026-09-01T00:00:00.000Z',
  updatedAt:      '2026-09-01T00:00:00.000Z',
};

// ---- DEMO_WARDROBE (14 items) ----
// Intentional gap: heavy on tops + bottoms, only one outerwear,
// narrow formality band (1-2) → gives gap analysers (Task 10) something real.

function item(
  id: string,
  name: string,
  category: WardrobeItem['category'],
  color: string,
  formality: WardrobeItem['formality'],
  seasons: WardrobeItem['seasons'],
): WardrobeItem {
  return {
    id,
    name,
    category,
    color,
    colorFamily: COLOR_TO_FAMILY[color] as WardrobeItem['colorFamily'],
    formality,
    seasons,
    imageUri: '',   // null-equivalent for demo; Tasks 12+ replace with real URIs
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

export const DEMO_WARDROBE: WardrobeItem[] = [
  // Tops (4)
  item('w-01', 'Olive Linen Shirt',        'top',       'olive',     1, ['spring', 'summer']),
  item('w-02', 'Black Crewneck Tee',        'top',       'black',     1, ['spring', 'summer', 'fall']),
  item('w-03', 'Cream Oversized Tee',       'top',       'cream',     1, ['spring', 'summer']),
  item('w-04', 'Charcoal Henley',           'top',       'charcoal',  2, ['fall', 'winter']),

  // Bottoms (3)
  item('w-05', 'Olive Cargo Trousers',      'bottom',    'olive',     1, ['spring', 'fall']),
  item('w-06', 'Black Slim Chinos',         'bottom',    'black',     2, ['spring', 'summer', 'fall', 'winter']),
  item('w-07', 'Khaki Wide-Leg Trousers',   'bottom',    'khaki',     1, ['spring', 'summer']),

  // Outerwear (1) — gap target
  item('w-08', 'Brown Waxed Jacket',        'outerwear', 'brown',     2, ['fall', 'winter']),

  // Knitwear (2)
  item('w-09', 'Cream Chunky Knit',         'knitwear',  'cream',     1, ['fall', 'winter']),
  item('w-10', 'Olive Fine-Gauge Sweater',  'knitwear',  'olive',     2, ['spring', 'fall', 'winter']),

  // Footwear (2)
  item('w-11', 'Brown Suede Boots',         'footwear',  'brown',     2, ['fall', 'winter']),
  item('w-12', 'Black Leather Trainers',    'footwear',  'black',     1, ['spring', 'summer', 'fall']),

  // Accessory (2)
  item('w-13', 'Olive Canvas Tote',         'accessory', 'olive',     1, ['spring', 'summer', 'fall']),
  item('w-14', 'Black Leather Belt',        'accessory', 'black',     2, ['spring', 'summer', 'fall', 'winter']),
];

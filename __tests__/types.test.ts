import {
  STYLE_DIMENSIONS, CATEGORIES, COLOR_FAMILIES, SEASONS, VIBE_NAMES,
  COLOR_TO_VIBE, COLOR_TO_FAMILY, SCORE_WEIGHTS, SLIDER_KEYS, STYLE_WORDS,
} from '@/lib/types';

describe('enum tables', () => {
  it('declares the nine style dimensions in canonical order', () => {
    expect(STYLE_DIMENSIONS).toEqual([
      'minimalism', 'streetwear', 'workwear', 'outdoor', 'vintage',
      'formal', 'colorfulness', 'pattern', 'relaxedFit',
    ]);
  });

  it('declares six categories and five colour families', () => {
    expect(CATEGORIES).toHaveLength(6);
    expect(COLOR_FAMILIES).toEqual(['neutral', 'warm', 'cool', 'earth', 'bold']);
    expect(SEASONS).toEqual(['spring', 'summer', 'fall', 'winter']);
  });

  it('declares six vibes', () => {
    expect(VIBE_NAMES).toEqual(['noir', 'ember', 'sage', 'cobalt', 'orchid', 'sand']);
  });

  it('maps every vibe-mapped colour to a valid vibe and family', () => {
    for (const [color, vibe] of Object.entries(COLOR_TO_VIBE)) {
      expect(VIBE_NAMES).toContain(vibe);
      expect(COLOR_FAMILIES).toContain(COLOR_TO_FAMILY[color]);
    }
  });

  it('has score weights summing to exactly 1', () => {
    const sum = SCORE_WEIGHTS.style + SCORE_WEIGHTS.wardrobe
      + SCORE_WEIGHTS.price + SCORE_WEIGHTS.occasion;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('declares five sliders and nine style words', () => {
    expect(SLIDER_KEYS).toHaveLength(5);
    expect(STYLE_WORDS).toHaveLength(9);
  });
});

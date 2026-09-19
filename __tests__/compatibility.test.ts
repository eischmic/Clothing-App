import { areCompatible } from '@/lib/compatibility';
import type { Garment } from '@/lib/types';

const g = (over: Partial<Garment>): Garment => ({
  category: 'top', colorFamily: 'neutral', formality: 3,
  seasons: ['spring', 'summer', 'fall', 'winter'], ...over,
});

describe('areCompatible', () => {
  it('rejects two items in the same non-layerable slot', () => {
    expect(areCompatible(g({ category: 'bottom' }), g({ category: 'bottom' }))).toBe(false);
    expect(areCompatible(g({ category: 'top' }), g({ category: 'top' }))).toBe(false);
  });

  it('allows outerwear over knitwear as layering', () => {
    expect(areCompatible(g({ category: 'outerwear' }), g({ category: 'knitwear' }))).toBe(true);
  });

  it('allows a neutral item to pair across families', () => {
    expect(areCompatible(
      g({ category: 'top', colorFamily: 'neutral' }),
      g({ category: 'bottom', colorFamily: 'bold' }),
    )).toBe(true);
  });

  it('never pairs two bold items', () => {
    expect(areCompatible(
      g({ category: 'top', colorFamily: 'bold' }),
      g({ category: 'bottom', colorFamily: 'bold' }),
    )).toBe(false);
  });

  it('allows items sharing a family', () => {
    expect(areCompatible(
      g({ category: 'top', colorFamily: 'earth' }),
      g({ category: 'bottom', colorFamily: 'earth' }),
    )).toBe(true);
  });

  it('allows the permitted cross-family pairs and rejects others', () => {
    expect(areCompatible(g({ category: 'top', colorFamily: 'earth' }), g({ category: 'bottom', colorFamily: 'warm' }))).toBe(true);
    expect(areCompatible(g({ category: 'top', colorFamily: 'warm' }), g({ category: 'bottom', colorFamily: 'cool' }))).toBe(false);
  });

  it('rejects a formality gap greater than 1', () => {
    expect(areCompatible(g({ category: 'top', formality: 1 }), g({ category: 'bottom', formality: 3 }))).toBe(false);
    expect(areCompatible(g({ category: 'top', formality: 2 }), g({ category: 'bottom', formality: 3 }))).toBe(true);
  });

  it('requires overlapping seasons', () => {
    expect(areCompatible(
      g({ category: 'top', seasons: ['summer'] }),
      g({ category: 'bottom', seasons: ['winter'] }),
    )).toBe(false);
  });

  it('is symmetric across a spread of random-ish pairs', () => {
    const items = [
      g({ category: 'top', colorFamily: 'earth', formality: 2, seasons: ['fall'] }),
      g({ category: 'bottom', colorFamily: 'cool', formality: 3, seasons: ['fall', 'winter'] }),
      g({ category: 'footwear', colorFamily: 'neutral', formality: 2, seasons: ['fall'] }),
      g({ category: 'outerwear', colorFamily: 'bold', formality: 4, seasons: ['winter'] }),
    ];
    for (const a of items) for (const b of items) {
      expect(areCompatible(a, b)).toBe(areCompatible(b, a));
    }
  });
});

import { countOutfits, enumerateOutfits, wardrobeImpact, buildEdges, MAX_GRAPH_ITEMS } from '@/lib/outfits';
import type { Garment } from '@/lib/types';

type Item = Garment & { id: string };
const it_ = (id: string, over: Partial<Garment>): Item => ({
  id, category: 'top', colorFamily: 'neutral', formality: 3,
  seasons: ['spring', 'summer', 'fall', 'winter'], ...over,
});

const MINIMAL = [
  it_('t1', { category: 'top' }),
  it_('b1', { category: 'bottom' }),
  it_('f1', { category: 'footwear' }),
];

describe('countOutfits', () => {
  it('counts zero without a complete top/bottom/footwear core', () => {
    expect(countOutfits([it_('t1', { category: 'top' }), it_('b1', { category: 'bottom' })])).toBe(0);
    expect(countOutfits([])).toBe(0);
  });

  it('counts one for a single valid core', () => {
    expect(countOutfits(MINIMAL)).toBe(1);
  });

  it('counts the core plus each optional layer variant', () => {
    // core, core+outerwear, core+knitwear, core+outerwear+knitwear
    expect(countOutfits([...MINIMAL, it_('o1', { category: 'outerwear' }), it_('k1', { category: 'knitwear' })])).toBe(4);
  });

  it('multiplies across interchangeable core pieces', () => {
    expect(countOutfits([...MINIMAL, it_('t2', { category: 'top' })])).toBe(2);
  });

  it('excludes cores whose pieces are incompatible', () => {
    const clashing = [
      it_('t1', { category: 'top', seasons: ['summer'] }),
      it_('b1', { category: 'bottom', seasons: ['winter'] }),
      it_('f1', { category: 'footwear' }),
    ];
    expect(countOutfits(clashing)).toBe(0);
  });

  it('requires the optional layer to be compatible with every core piece', () => {
    const items = [...MINIMAL, it_('o1', { category: 'outerwear', formality: 5 })];
    expect(countOutfits(items)).toBe(1); // core only; formality gap of 2 blocks the layer
  });
});

describe('enumerateOutfits', () => {
  it('returns sets whose length matches the count', () => {
    const items = [...MINIMAL, it_('o1', { category: 'outerwear' })];
    expect(enumerateOutfits(items)).toHaveLength(countOutfits(items));
  });

  it('always includes exactly one top, bottom, and footwear per outfit', () => {
    for (const outfit of enumerateOutfits([...MINIMAL, it_('t2', { category: 'top' })])) {
      expect(outfit.filter((i) => i.category === 'top')).toHaveLength(1);
      expect(outfit.filter((i) => i.category === 'bottom')).toHaveLength(1);
      expect(outfit.filter((i) => i.category === 'footwear')).toHaveLength(1);
    }
  });
});

describe('wardrobeImpact', () => {
  it('reports the additional outfits a candidate unlocks', () => {
    expect(wardrobeImpact(MINIMAL, it_('o1', { category: 'outerwear' }))).toBe(1);
  });

  it('reports zero for a candidate that pairs with nothing', () => {
    expect(wardrobeImpact(MINIMAL, it_('o1', { category: 'outerwear', seasons: [] }))).toBe(0);
  });

  it('never reports a negative impact', () => {
    expect(wardrobeImpact([], it_('t9', { category: 'top' }))).toBeGreaterThanOrEqual(0);
  });
});

describe('buildEdges', () => {
  it('emits each compatible pair once', () => {
    const edges = buildEdges(MINIMAL);
    expect(edges).toHaveLength(3);
    const keys = edges.map(([a, b]) => [a, b].sort().join('|'));
    expect(new Set(keys).size).toBe(3);
  });
});

describe('graph cap', () => {
  it('caps enumeration input at MAX_GRAPH_ITEMS', () => {
    const many = Array.from({ length: MAX_GRAPH_ITEMS + 25 }, (_, i) =>
      it_(`x${i}`, { category: (['top', 'bottom', 'footwear'] as const)[i % 3] }));
    expect(() => countOutfits(many)).not.toThrow();
    // The cap must actually bite: items beyond it contribute nothing. Without
    // the slice this count would be far larger than the capped one.
    expect(countOutfits(many)).toBe(countOutfits(many.slice(0, MAX_GRAPH_ITEMS)));
  });
});

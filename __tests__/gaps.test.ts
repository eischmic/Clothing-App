import { analyzeGaps, categoryCoverage, colorBalance, formalitySpread, orphanItems, CATEGORY_TARGETS } from '@/lib/gaps';
import { DEMO_WARDROBE } from '@/lib/fixtures';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { zeroVector } from '@/lib/vector';
import { CATEGORIES, type WardrobeItem } from '@/lib/types';

const item = (id: string, over: Partial<WardrobeItem>): WardrobeItem => ({
  id, uri: null, name: id, category: 'top', color: 'black', colorFamily: 'neutral',
  formality: 3, seasons: ['fall'], vector: zeroVector(), ...over,
});

const args = {
  wardrobe: DEMO_WARDROBE,
  userVector: { ...zeroVector(), outdoor: 0.7, minimalism: 0.6 },
  products: ALL_PRODUCTS,
};

describe('readouts', () => {
  it('reports a count for every category', () => {
    const cov = categoryCoverage(DEMO_WARDROBE);
    for (const c of CATEGORIES) {
      expect(cov[c].count).toBeGreaterThanOrEqual(0);
      expect(cov[c].target).toBe(CATEGORY_TARGETS[c]);
    }
  });

  it('reports colour family shares summing to 1', () => {
    const shares = Object.values(colorBalance(DEMO_WARDROBE)).reduce((a, b) => a + b, 0);
    expect(shares).toBeCloseTo(1, 6);
  });

  it('reports an empty colour balance for an empty wardrobe without dividing by zero', () => {
    expect(Object.values(colorBalance([])).every((n) => n === 0)).toBe(true);
  });

  it('reports the formality span', () => {
    const spread = formalitySpread([item('a', { formality: 2 }), item('b', { formality: 4 })]);
    expect(spread.min).toBe(2);
    expect(spread.max).toBe(4);
    expect(spread.levels).toBe(2);
  });

  it('identifies items that pair with nothing', () => {
    const orphans = orphanItems([
      item('t1', { category: 'top', seasons: ['summer'] }),
      item('b1', { category: 'bottom', seasons: ['winter'] }),
    ]);
    expect(orphans.map((o) => o.id).sort()).toEqual(['b1', 't1']);
  });
});

describe('analyzeGaps', () => {
  it('finds the thin outerwear coverage in the demo wardrobe', () => {
    const gaps = analyzeGaps(args);
    expect(gaps.some((g) => g.kind === 'coverage' && g.category === 'outerwear')).toBe(true);
  });

  it('flags a wardrobe dominated by one colour family', () => {
    const mono = Array.from({ length: 10 }, (_, i) => item(`m${i}`, { color: 'magenta', colorFamily: 'bold' }));
    expect(analyzeGaps({ ...args, wardrobe: mono }).some((g) => g.kind === 'color')).toBe(true);
  });

  it('flags a narrow formality band', () => {
    const flat = Array.from({ length: 8 }, (_, i) => item(`f${i}`, { formality: 3 }));
    expect(analyzeGaps({ ...args, wardrobe: flat }).some((g) => g.kind === 'formality')).toBe(true);
  });

  it('flags orphaned items', () => {
    const split = [
      item('t1', { category: 'top', seasons: ['summer'] }),
      item('b1', { category: 'bottom', seasons: ['winter'] }),
    ];
    expect(analyzeGaps({ ...args, wardrobe: split }).some((g) => g.kind === 'pairability')).toBe(true);
  });

  it('attaches a concrete suggestion in the gap category', () => {
    const covGap = analyzeGaps(args).find((g) => g.kind === 'coverage' && g.category !== null);
    expect(covGap?.suggestion).not.toBeNull();
    expect(covGap?.suggestion?.product.category).toBe(covGap?.category);
  });

  it('sorts gaps by descending confidence, all within 0..1', () => {
    const gaps = analyzeGaps(args);
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1].confidence).toBeGreaterThanOrEqual(gaps[i].confidence);
    }
    expect(gaps.every((g) => g.confidence >= 0 && g.confidence <= 1)).toBe(true);
  });

  it('returns gaps rather than throwing for an empty wardrobe', () => {
    expect(Array.isArray(analyzeGaps({ ...args, wardrobe: [] }))).toBe(true);
  });

  it('gives every gap a unique id and non-empty prose', () => {
    const gaps = analyzeGaps(args);
    expect(new Set(gaps.map((g) => g.id)).size).toBe(gaps.length);
    expect(gaps.every((g) => g.title.length > 0 && g.reasoning.length > 0)).toBe(true);
  });
});

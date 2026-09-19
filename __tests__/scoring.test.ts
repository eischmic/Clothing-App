import { styleScore, wardrobeScore, priceScore, occasionScore, rankProducts, INTENTS } from '@/lib/scoring';
import { zeroVector } from '@/lib/vector';
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { DEMO_WARDROBE } from '@/lib/fixtures';
import { SCORE_WEIGHTS, type Product } from '@/lib/types';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1', name: 'Test Jacket', brand: 'Test', category: 'outerwear', price: 120,
  url: 'https://example.com', imageUri: null, description: 'a jacket',
  color: 'olive', colorFamily: 'earth', formality: 3,
  seasons: ['fall', 'winter'], vector: { ...zeroVector(), outdoor: 0.8, workwear: 0.6 }, ...over,
});

describe('component scores', () => {
  it('scores style higher for an aligned user vector', () => {
    const aligned = { ...zeroVector(), outdoor: 0.8, workwear: 0.6 };
    const opposed = { ...zeroVector(), formal: 1 };
    expect(styleScore(aligned, product())).toBeGreaterThan(styleScore(opposed, product()));
  });

  it('peaks price score at the budget centre and decays away from it', () => {
    expect(priceScore(120, 120)).toBeCloseTo(1, 6);
    expect(priceScore(400, 120)).toBeLessThan(priceScore(150, 120));
    expect(priceScore(400, 120)).toBeGreaterThanOrEqual(0);
  });

  it('scores occasion 1 on an exact formality match and 0 at maximum distance', () => {
    expect(occasionScore(product({ formality: 4 }), 4)).toBe(1);
    expect(occasionScore(product({ formality: 1 }), 5)).toBe(0);
  });

  it('rewards a product that pairs with more of the wardrobe', () => {
    const pairsWidely = product({ colorFamily: 'neutral', color: 'black', formality: 3 });
    const pairsNarrowly = product({ colorFamily: 'bold', color: 'magenta', formality: 5, seasons: ['summer'] });
    expect(wardrobeScore(DEMO_WARDROBE, pairsWidely)).toBeGreaterThan(wardrobeScore(DEMO_WARDROBE, pairsNarrowly));
  });

  it('keeps every component score within 0..1', () => {
    for (const p of ALL_PRODUCTS.slice(0, 40)) {
      expect(wardrobeScore(DEMO_WARDROBE, p)).toBeGreaterThanOrEqual(0);
      expect(wardrobeScore(DEMO_WARDROBE, p)).toBeLessThanOrEqual(1);
      expect(occasionScore(p, 3)).toBeGreaterThanOrEqual(0);
      expect(occasionScore(p, 3)).toBeLessThanOrEqual(1);
    }
  });
});

describe('rankProducts', () => {
  const args = {
    userVector: { ...zeroVector(), outdoor: 0.7, workwear: 0.7, minimalism: 0.6 },
    wardrobe: DEMO_WARDROBE,
    inspoImages: [],
    products: ALL_PRODUCTS,
    intentId: 'jacket' as const,
    budgetCenter: 120,
    limit: 5,
  };

  it('returns at most the requested limit, sorted descending', () => {
    const out = rankProducts(args);
    expect(out.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].total).toBeGreaterThanOrEqual(out[i].total);
  });

  it('respects the intent category filter', () => {
    expect(rankProducts(args).every((r) => r.product.category === 'outerwear')).toBe(true);
  });

  it('applies the exact spec weights', () => {
    const [top] = rankProducts(args);
    const expected = SCORE_WEIGHTS.style * top.scores.style
      + SCORE_WEIGHTS.wardrobe * top.scores.wardrobe
      + SCORE_WEIGHTS.price * top.scores.price
      + SCORE_WEIGHTS.occasion * top.scores.occasion;
    expect(top.total).toBeCloseTo(expected, 10);
  });

  it('populates explanation inputs', () => {
    const [top] = rankProducts(args);
    expect(Array.isArray(top.pairsWith)).toBe(true);
    expect(typeof top.newOutfits).toBe('number');
    expect(top.reasons.length).toBeGreaterThan(0);
  });

  it('does not filter by category for the surprise-me intent', () => {
    const cats = new Set(rankProducts({ ...args, intentId: 'surprise', limit: 20 }).map((r) => r.product.category));
    expect(cats.size).toBeGreaterThan(1);
  });

  it('is deterministic across repeated calls', () => {
    expect(rankProducts(args).map((r) => r.product.id)).toEqual(rankProducts(args).map((r) => r.product.id));
  });

  it('declares six intents', () => {
    expect(INTENTS).toHaveLength(6);
    expect(INTENTS.map((i) => i.id)).toContain('surprise');
  });
});

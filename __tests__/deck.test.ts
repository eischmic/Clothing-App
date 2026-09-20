import {
  buildOutfit,
  candidatesForSlot,
  outfitProducts,
  refillSlot,
  type DeckContext,
} from '@/lib/deck';
import { areCompatible } from '@/lib/compatibility';
import { zeroVector } from '@/lib/vector';
import type { Product } from '@/lib/types';

const product = (over: Partial<Product> & Pick<Product, 'id'>): Product => ({
  name: over.id,
  brand: 'Test',
  category: 'top',
  price: 100,
  url: 'https://example.com',
  imageUri: null,
  description: 'a garment',
  color: 'stone',
  colorFamily: 'neutral',
  formality: 3,
  seasons: ['spring', 'summer', 'fall', 'winter'],
  vector: { ...zeroVector(), minimalism: 0.6 },
  ...over,
});

// A deliberately small catalog. `bottom-bold` clashes on colour with the
// equally-bold `top-bold`, so a greedy build must skip past it.
const CATALOG: Product[] = [
  product({ id: 'top-a', category: 'top', vector: { ...zeroVector(), minimalism: 0.9 } }),
  product({ id: 'top-b', category: 'top', vector: { ...zeroVector(), minimalism: 0.5 } }),
  product({ id: 'top-bold', category: 'top', colorFamily: 'bold', color: 'magenta' }),
  product({ id: 'bottom-a', category: 'bottom', vector: { ...zeroVector(), minimalism: 0.9 } }),
  product({ id: 'bottom-b', category: 'bottom', vector: { ...zeroVector(), minimalism: 0.4 } }),
  product({ id: 'bottom-bold', category: 'bottom', colorFamily: 'bold', color: 'magenta' }),
  product({ id: 'shoe-a', category: 'footwear', vector: { ...zeroVector(), minimalism: 0.8 } }),
  product({ id: 'shoe-b', category: 'footwear', vector: { ...zeroVector(), minimalism: 0.3 } }),
  product({ id: 'coat-a', category: 'outerwear', vector: { ...zeroVector(), minimalism: 0.7 } }),
  product({ id: 'knit-a', category: 'knitwear', vector: { ...zeroVector(), minimalism: 0.7 } }),
];

const ctx = (over: Partial<DeckContext> = {}): DeckContext => ({
  products: CATALOG,
  userVector: { ...zeroVector(), minimalism: 1 },
  rejectedIds: [],
  budgetCenter: 100,
  ...over,
});

describe('buildOutfit', () => {
  it('fills top, bottom and footwear', () => {
    const outfit = buildOutfit(ctx());
    expect(outfit?.slots.top).toBeDefined();
    expect(outfit?.slots.bottom).toBeDefined();
    expect(outfit?.slots.footwear).toBeDefined();
  });

  it('only places mutually compatible products', () => {
    const items = outfitProducts(buildOutfit(ctx())!);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        expect(areCompatible(items[i], items[j])).toBe(true);
      }
    }
  });

  it('never places a rejected product', () => {
    const outfit = buildOutfit(ctx({ rejectedIds: ['top-a', 'shoe-a'] }))!;
    const ids = outfitProducts(outfit).map((p) => p.id);
    expect(ids).not.toContain('top-a');
    expect(ids).not.toContain('shoe-a');
  });

  it('is deterministic for the same context', () => {
    expect(buildOutfit(ctx())).toEqual(buildOutfit(ctx()));
  });

  it('returns null when the pool has no footwear', () => {
    const noShoes = CATALOG.filter((p) => p.category !== 'footwear');
    expect(buildOutfit(ctx({ products: noShoes }))).toBeNull();
  });
});

describe('refillSlot', () => {
  it('changes only the named slot, leaving the others identical by reference', () => {
    const outfit = buildOutfit(ctx())!;
    const next = refillSlot(ctx(), outfit, 'top')!;
    expect(next.slots.bottom).toBe(outfit.slots.bottom);
    expect(next.slots.footwear).toBe(outfit.slots.footwear);
  });

  it('returns a different product in the refilled slot', () => {
    const outfit = buildOutfit(ctx())!;
    const next = refillSlot(ctx(), outfit, 'top')!;
    expect(next.slots.top?.id).not.toBe(outfit.slots.top?.id);
  });

  it('drops an optional slot with no alternative and still returns an outfit', () => {
    const outfit = buildOutfit(ctx())!;
    expect(outfit.slots.outerwear).toBeDefined();
    const next = refillSlot(ctx(), outfit, 'outerwear')!;
    expect(next.slots.outerwear).toBeUndefined();
    expect(next.slots.top).toBe(outfit.slots.top);
  });
});

describe('candidatesForSlot', () => {
  it('returns only products in the requested category', () => {
    const picks = candidatesForSlot(ctx(), 'footwear');
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((p) => p.category === 'footwear')).toBe(true);
  });

  it('breaks score ties on ascending id', () => {
    const tied = [
      product({ id: 'z-top', category: 'top' }),
      product({ id: 'a-top', category: 'top' }),
    ];
    expect(candidatesForSlot(ctx({ products: tied }), 'top').map((p) => p.id)).toEqual([
      'a-top',
      'z-top',
    ]);
  });
});

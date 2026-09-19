import { seededProvider, ALL_PRODUCTS, MIN_PRICE, MAX_PRICE } from '@/lib/catalog/seeded';
import { CATEGORIES, COLOR_TO_FAMILY, STYLE_DIMENSIONS } from '@/lib/types';

describe('seeded catalogue', () => {
  it('keeps every price inside the spec price band', () => {
    for (const p of ALL_PRODUCTS) {
      expect(p.price).toBeGreaterThanOrEqual(MIN_PRICE);
      expect(p.price).toBeLessThanOrEqual(MAX_PRICE);
    }
  });

  it('is deterministic across repeated expansion', () => {
    jest.resetModules();
    const again = require('@/lib/catalog/seeded').ALL_PRODUCTS;
    expect(again.map((p: { id: string; price: number }) => `${p.id}:${p.price}`))
      .toEqual(ALL_PRODUCTS.map((p) => `${p.id}:${p.price}`));
  });

  it('ships at least 150 products with unique ids', () => {
    expect(ALL_PRODUCTS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(ALL_PRODUCTS.map((p) => p.id)).size).toBe(ALL_PRODUCTS.length);
  });

  it('covers every category with at least 12 products', () => {
    for (const c of CATEGORIES) {
      expect(ALL_PRODUCTS.filter((p) => p.category === c).length).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps every product internally consistent', () => {
    for (const p of ALL_PRODUCTS) {
      expect(p.colorFamily).toBe(COLOR_TO_FAMILY[p.color]);
      expect(p.price).toBeGreaterThan(0);
      expect(p.seasons.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.brand.length).toBeGreaterThan(0);
      for (const d of STYLE_DIMENSIONS) {
        expect(p.vector[d]).toBeGreaterThanOrEqual(0);
        expect(p.vector[d]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('spans the intended price range and every formality level', () => {
    const prices = ALL_PRODUCTS.map((p) => p.price);
    expect(Math.min(...prices)).toBeLessThanOrEqual(45);
    expect(Math.max(...prices)).toBeGreaterThanOrEqual(280);
    expect(new Set(ALL_PRODUCTS.map((p) => p.formality)).size).toBe(5);
  });

  it('leaves imageUri null so procedural art is used', () => {
    expect(ALL_PRODUCTS.every((p) => p.imageUri === null)).toBe(true);
  });

  it('filters by category and price ceiling', async () => {
    const found = await seededProvider.search({ category: 'outerwear', maxPrice: 150 });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.category === 'outerwear' && p.price <= 150)).toBe(true);
  });

  it('matches free text against name, brand, and description', async () => {
    const found = await seededProvider.search({ text: 'trench' });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => /trench/i.test(`${p.name} ${p.brand} ${p.description}`))).toBe(true);
  });

  it('excludes products below a price floor', async () => {
    const found = await seededProvider.search({ minPrice: 200 });
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(ALL_PRODUCTS.length);
    expect(found.every((p) => p.price >= 200)).toBe(true);
  });

  it('returns everything for an empty query', async () => {
    expect(await seededProvider.search({})).toHaveLength(ALL_PRODUCTS.length);
  });
});

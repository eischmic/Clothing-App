import { seededProvider, ALL_PRODUCTS } from '@/lib/catalog/seeded';
import { CATEGORIES, COLOR_TO_FAMILY, STYLE_DIMENSIONS } from '@/lib/types';

describe('seeded catalogue', () => {
  it('is deterministic across repeated expansion', () => {
    jest.resetModules();
    const again = require('@/lib/catalog/seeded').ALL_PRODUCTS;
    expect(again.map((p: { id: string }) => p.id))
      .toEqual(ALL_PRODUCTS.map((p) => p.id));
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
      expect(p.seasons.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.brand.length).toBeGreaterThan(0);
      for (const d of STYLE_DIMENSIONS) {
        expect(p.vector[d]).toBeGreaterThanOrEqual(0);
        expect(p.vector[d]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('covers every formality level', () => {
    expect(new Set(ALL_PRODUCTS.map((p) => p.formality)).size).toBe(5);
  });

  it('leaves imageUri null so procedural art is used', () => {
    expect(ALL_PRODUCTS.every((p) => p.imageUri === null)).toBe(true);
  });

  it('filters by category', async () => {
    const found = await seededProvider.search({ category: 'outerwear' });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.category === 'outerwear')).toBe(true);
  });

  it('matches free text against name, brand, and description', async () => {
    const found = await seededProvider.search({ text: 'trench' });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => /trench/i.test(`${p.name} ${p.brand} ${p.description}`))).toBe(true);
  });

  it('returns everything for an empty query', async () => {
    expect(await seededProvider.search({})).toHaveLength(ALL_PRODUCTS.length);
  });
});

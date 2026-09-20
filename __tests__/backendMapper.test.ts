import { mapProfileItemToProduct } from '@/lib/catalog/backendMapper';
import { STYLE_DIMENSIONS } from '@/lib/types';
import type { BackendProfileItem } from '@/lib/backend';

import fixture from './fixtures/profileItem.json';

const item = fixture as BackendProfileItem;

describe('mapProfileItemToProduct', () => {
  it('maps every field of a real backend item', () => {
    const p = mapProfileItemToProduct(item);

    expect(p.id).toBe('0108775015');
    expect(p.name).toBe('Strap top');
    expect(p.brand).toBe('H&M');
    expect(p.imageUri).toBe('http://localhost:8000/thumbs/010/0108775015.jpg');
    expect(p.url).toBe('https://www2.hm.com/en_us/productpage.0108775015.html');
    expect(p.description).toBe('Jersey top with narrow shoulder straps.');
    expect(p.category).toBe('top');
    expect(p.color).toBe('black');
    expect(p.colorFamily).toBe('neutral');
    expect(p.formality).toBe(2);
    expect(p.seasons).toEqual(['spring', 'summer']);
  });

  it('rebuilds the 9-dim vector in STYLE_DIMENSIONS order', () => {
    const p = mapProfileItemToProduct(item);
    STYLE_DIMENSIONS.forEach((dim, i) => {
      expect(p.vector[dim]).toBeCloseTo(item.vector[i], 6);
    });
  });

  it('produces no price field', () => {
    expect('price' in mapProfileItemToProduct(item)).toBe(false);
  });

  it('falls back safely on nulls and out-of-range values', () => {
    const p = mapProfileItemToProduct({
      ...item,
      name: null,
      colour: null,
      description: null,
      category: 'not-a-category',
      colour_family: 'not-a-family',
      formality: 99,
      seasons: [],
      vector: [],
    } as unknown as BackendProfileItem);

    expect(p.name).toBe('0108775015');
    expect(p.color).toBe('unknown');
    expect(p.description).toBe('');
    expect(p.category).toBe('top');
    expect(p.colorFamily).toBe('neutral');
    expect(p.formality).toBe(3);
    expect(p.seasons).toEqual(['spring', 'summer', 'fall', 'winter']);
    STYLE_DIMENSIONS.forEach((dim) => expect(p.vector[dim]).toBe(0.5));
  });
});

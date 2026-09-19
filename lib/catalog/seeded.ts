// lib/catalog/seeded.ts — expands archetypes into the static product catalogue.
// Hard constraint: zero React / React Native / Expo imports. Pure TypeScript.
// Hard constraint: no Math.random() — catalogue must be deterministic.

import { ARCHETYPES } from '@/lib/catalog/archetypes';
import type { ProductProvider, ProductQuery } from '@/lib/catalog/provider';
import { garmentToVector, clampVector } from '@/lib/vector';
import type { Product, StyleVector, StyleDimension } from '@/lib/types';
import { COLOR_TO_FAMILY, STYLE_DIMENSIONS } from '@/lib/types';

// ---------------------------------------------------------------------------
// Deterministic price offset: derived from archetype id and colour string.
// Uses a simple character-code sum to stay fully deterministic.
// ---------------------------------------------------------------------------
function deterministicOffset(archetypeId: string, color: string): number {
  let hash = 0;
  const str = `${archetypeId}:${color}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffff;
  }
  // Offset in range [-15, +20] — spreads prices slightly without large swings.
  return (hash % 36) - 15;
}

/** Spec §9 fixes the catalogue's price band at $35–$320. */
export const MIN_PRICE = 35;
export const MAX_PRICE = 320;

function clampPrice(price: number): number {
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, price));
}

// ---------------------------------------------------------------------------
// Expand archetypes × colors into Product[]
// ---------------------------------------------------------------------------
function expandCatalogue(): Product[] {
  const products: Product[] = [];

  for (const arch of ARCHETYPES) {

    for (const color of arch.colors) {
      const colorFamily = COLOR_TO_FAMILY[color];
      if (!colorFamily) {
        // Skip any colour not in the lookup (defensive; should never happen with authored data).
        continue;
      }

      // Compute a per-product base vector using the actual colour family.
      const productBaseVector = garmentToVector({
        category: arch.category,
        colorFamily,
        formality: arch.formality,
      });

      // Apply archetype style hints on top and clamp all dimensions to [0, 1].
      const rawVector: StyleVector = { ...productBaseVector };
      for (const dim of STYLE_DIMENSIONS) {
        const hint = (arch.styleHints as Partial<Record<StyleDimension, number>>)[dim];
        if (hint !== undefined) {
          rawVector[dim] += hint;
        }
      }
      const vector = clampVector(rawVector);

      const priceOffset = deterministicOffset(arch.id, color);
      const price = clampPrice(arch.basePrice + priceOffset);

      const id = `${arch.id}-${color}`;
      const name = `${arch.baseName} in ${color.charAt(0).toUpperCase() + color.slice(1)}`;

      products.push({
        id,
        name,
        brand: arch.brand,
        price,
        imageUri: null,
        description: arch.description,
        category: arch.category,
        color,
        colorFamily,
        formality: arch.formality,
        seasons: arch.seasons,
        vector,
        url: `https://example.com/products/${id}`,
      });
    }
  }

  return products;
}

export const ALL_PRODUCTS: Product[] = expandCatalogue();

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------
export const seededProvider: ProductProvider = {
  async all(): Promise<Product[]> {
    return ALL_PRODUCTS;
  },

  async search(query: ProductQuery): Promise<Product[]> {
    let results = ALL_PRODUCTS;

    if (query.category !== undefined) {
      results = results.filter((p) => p.category === query.category);
    }

    if (query.minPrice !== undefined) {
      results = results.filter((p) => p.price >= query.minPrice!);
    }

    if (query.maxPrice !== undefined) {
      results = results.filter((p) => p.price <= query.maxPrice!);
    }

    if (query.text !== undefined && query.text.length > 0) {
      const needle = query.text.toLowerCase();
      results = results.filter((p) =>
        `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(needle),
      );
    }

    return results;
  },
};

// lib/catalog/backendProvider.ts — ProductProvider over /profiles/{id}/next.
// Hard constraint: zero React / React Native / Expo imports.

import { getNext } from '@/lib/backend';
import { mapProfileItemToProduct } from '@/lib/catalog/backendMapper';
import type { ProductProvider, ProductQuery } from '@/lib/catalog/provider';
import type { Product } from '@/lib/types';

/** One page of `/next`. 100 is the endpoint's documented ceiling. */
export const FEED_SIZE = 100;

export function makeBackendProvider(profileId: string): ProductProvider {
  async function pool(): Promise<Product[]> {
    const { items } = await getNext(profileId, FEED_SIZE);
    return items.map(mapProfileItemToProduct);
  }

  return {
    all: pool,

    // Client-side filtering of the ranked pool, matching seededProvider.search's
    // semantics. No text-search endpoint is added: FashionCLIP could serve one
    // via embed_texts, but nothing in the app calls search() today and a
    // retrieval path with no consumer is speculative. When a search UI exists,
    // POST /profiles/{id}/search is its natural home.
    async search(query: ProductQuery): Promise<Product[]> {
      let results = await pool();

      if (query.category !== undefined) {
        results = results.filter((p) => p.category === query.category);
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
}

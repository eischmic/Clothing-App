// lib/catalog/index.ts — the single place that decides which provider is live.
// Nothing above lib/catalog/ imports seeded.ts or backendProvider.ts directly;
// this is the enforcement point the ProductProvider seam always intended.

import { backendEnabled } from '@/lib/backend';
import { makeBackendProvider } from '@/lib/catalog/backendProvider';
import { ALL_PRODUCTS, seededProvider } from '@/lib/catalog/seeded';
import type { ProductProvider } from '@/lib/catalog/provider';

/** The static catalogue, used whenever the backend is off or unreachable. */
export const FALLBACK_PRODUCTS = ALL_PRODUCTS;

export { seededProvider };
export type { ProductProvider, ProductQuery } from '@/lib/catalog/provider';

/**
 * The backend provider needs a profile id, so a profile that predates the
 * backend (or was created while it was down) correctly stays on the seeded
 * catalogue rather than erroring.
 */
export function activeProvider(profileId: string | null): ProductProvider {
  if (profileId && backendEnabled()) return makeBackendProvider(profileId);
  return seededProvider;
}

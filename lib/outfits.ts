// lib/outfits.ts — Outfit graph: enumeration, counting, and wardrobe impact.
// Hard constraint: zero React / React Native / Expo imports. Pure TypeScript.

import { areCompatible } from '@/lib/compatibility';
import type { Garment } from '@/lib/types';

export const MAX_GRAPH_ITEMS = 40;

type GarmentWithId = Garment & { id: string };

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/** Returns every compatible pair as an `[idA, idB]` tuple, each pair emitted once. */
export function buildEdges<T extends GarmentWithId>(items: T[]): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (areCompatible(items[i], items[j])) {
        result.push([items[i].id, items[j].id]);
      }
    }
  }
  return result;
}

function buildEdgeSet<T extends GarmentWithId>(items: T[]): Set<string> {
  return new Set(buildEdges(items).map(([a, b]) => edgeKey(a, b)));
}

/**
 * Enumerate all valid outfits from `items`.
 *
 * A valid outfit is: exactly one top + one bottom + one footwear (the "core"),
 * optionally plus one outerwear and/or one knitwear, where every pair of
 * items in the final set has an edge (i.e. `areCompatible`).
 *
 * Input is silently capped at `MAX_GRAPH_ITEMS`.
 */
export function enumerateOutfits<T extends GarmentWithId>(items: T[]): T[][] {
  const capped = items.slice(0, MAX_GRAPH_ITEMS);
  const edges = buildEdgeSet(capped);

  const hasEdge = (a: string, b: string) => edges.has(edgeKey(a, b));

  const tops = capped.filter((i) => i.category === 'top');
  const bottoms = capped.filter((i) => i.category === 'bottom');
  const footwear = capped.filter((i) => i.category === 'footwear');
  const outerwear = capped.filter((i) => i.category === 'outerwear');
  const knitwear = capped.filter((i) => i.category === 'knitwear');

  const outfits: T[][] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      if (!hasEdge(top.id, bottom.id)) continue;
      for (const shoe of footwear) {
        if (!hasEdge(top.id, shoe.id)) continue;
        if (!hasEdge(bottom.id, shoe.id)) continue;

        // Core is valid — now iterate optional layer subsets: [], [o], [k], [o,k]
        const coreIds = [top.id, bottom.id, shoe.id];

        // No optional layers
        outfits.push([top, bottom, shoe]);

        // With outerwear only
        for (const outer of outerwear) {
          const allCompatible = coreIds.every((id) => hasEdge(id, outer.id));
          if (allCompatible) {
            outfits.push([top, bottom, shoe, outer]);
          }
        }

        // With knitwear only
        for (const knit of knitwear) {
          const allCompatible = coreIds.every((id) => hasEdge(id, knit.id));
          if (allCompatible) {
            outfits.push([top, bottom, shoe, knit]);
          }
        }

        // With both outerwear and knitwear
        for (const outer of outerwear) {
          const outerCompatibleWithCore = coreIds.every((id) => hasEdge(id, outer.id));
          if (!outerCompatibleWithCore) continue;
          for (const knit of knitwear) {
            const knitCompatibleWithCore = coreIds.every((id) => hasEdge(id, knit.id));
            if (!knitCompatibleWithCore) continue;
            // Also check outerwear <-> knitwear compatibility
            if (!hasEdge(outer.id, knit.id)) continue;
            outfits.push([top, bottom, shoe, outer, knit]);
          }
        }
      }
    }
  }

  return outfits;
}

/**
 * Count valid outfits. Implemented via `enumerateOutfits` so the two can
 * never disagree.
 */
export function countOutfits<T extends GarmentWithId>(items: T[]): number {
  return enumerateOutfits(items).length;
}

/**
 * How many additional outfits does adding `candidate` to `wardrobe` unlock?
 * Always non-negative.
 */
export function wardrobeImpact<T extends GarmentWithId>(
  wardrobe: T[],
  candidate: T,
): number {
  return Math.max(0, countOutfits([...wardrobe, candidate]) - countOutfits(wardrobe));
}

import { garmentToVector } from '@/lib/vector';
import { COLOR_TO_FAMILY, type GarmentAttributes, type WardrobeItem } from '@/lib/types';

/** Pairs vision results with uploaded photos, retaining every upload on degraded analysis. */
export function wardrobeItemsFromAnalysis(uris: string[], attributes: GarmentAttributes[]): WardrobeItem[] {
  return uris.map((uri, index) => {
    const source = attributes[index] ?? { name: 'Unclassified top', category: 'top' as const, color: 'black', colorFamily: COLOR_TO_FAMILY.black, formality: 2 as const, seasons: ['spring', 'summer', 'fall', 'winter'] as const };
    return {
      ...source,
      id: `wardrobe-${Date.now()}-${index}`,
      uri,
      vector: garmentToVector(source),
    } as WardrobeItem;
  });
}

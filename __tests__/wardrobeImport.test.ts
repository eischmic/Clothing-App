import { wardrobeItemsFromAnalysis } from '@/lib/wardrobeImport';

it('creates a fallback wardrobe item for every uploaded uri when analysis is unavailable', () => {
  const items = wardrobeItemsFromAnalysis(['file://one.jpg', 'file://two.jpg'], []);
  expect(items).toHaveLength(2);
  expect(items.every((item) => item.category === 'top' && item.uri)).toBe(true);
});

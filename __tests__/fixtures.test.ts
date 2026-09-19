import { DEMO_PROFILE, DEMO_WARDROBE } from '@/lib/fixtures';
import { STYLE_DIMENSIONS, CATEGORIES, COLOR_TO_FAMILY } from '@/lib/types';

describe('demo fixtures', () => {
  it('has a complete style vector in range', () => {
    for (const d of STYLE_DIMENSIONS) {
      expect(DEMO_PROFILE.vector[d]).toBeGreaterThanOrEqual(0);
      expect(DEMO_PROFILE.vector[d]).toBeLessThanOrEqual(1);
    }
  });

  it('has three headline tags and a derived vibe', () => {
    expect(DEMO_PROFILE.tags).toHaveLength(3);
    expect(DEMO_PROFILE.vibe).toBeTruthy();
  });

  it('has a wardrobe covering at least five categories', () => {
    const present = new Set(DEMO_WARDROBE.map((i) => i.category));
    expect(present.size).toBeGreaterThanOrEqual(5);
    expect(DEMO_WARDROBE.length).toBeGreaterThanOrEqual(12);
  });

  it('gives every wardrobe item a family consistent with its colour', () => {
    for (const item of DEMO_WARDROBE) {
      expect(CATEGORIES).toContain(item.category);
      expect(item.colorFamily).toBe(COLOR_TO_FAMILY[item.color]);
      expect(item.seasons.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids', () => {
    expect(new Set(DEMO_WARDROBE.map((i) => i.id)).size).toBe(DEMO_WARDROBE.length);
  });
});

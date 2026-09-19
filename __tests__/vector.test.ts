import {
  zeroVector, clampVector, cosineSimilarity, blendVectors,
  questionnaireToVector, composeStyleVector,
} from '@/lib/vector';
import { STYLE_DIMENSIONS, SLIDER_KEYS, type Questionnaire } from '@/lib/types';

const q = (over: Partial<Record<(typeof SLIDER_KEYS)[number], number>> = {}, words: Questionnaire['words'] = []): Questionnaire => ({
  sliders: { minimalExpressive: 0.5, classicTrendy: 0.5, formalCasual: 0.5, practicalFashion: 0.5, neutralColorful: 0.5, ...over },
  words,
});

describe('zeroVector', () => {
  it('has every dimension at 0', () => {
    const v = zeroVector();
    expect(Object.keys(v).sort()).toEqual([...STYLE_DIMENSIONS].sort());
    expect(Object.values(v).every((n) => n === 0)).toBe(true);
  });
});

describe('clampVector', () => {
  it('clamps out-of-range values into 0..1', () => {
    const v = clampVector({ ...zeroVector(), minimalism: 1.8, formal: -0.4 });
    expect(v.minimalism).toBe(1);
    expect(v.formal).toBe(0);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical non-zero vectors', () => {
    const a = { ...zeroVector(), minimalism: 0.8, outdoor: 0.4 };
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6);
  });

  it('is symmetric', () => {
    const a = { ...zeroVector(), minimalism: 0.8 };
    const b = { ...zeroVector(), outdoor: 0.5, minimalism: 0.2 };
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 6);
  });

  it('always returns a value within 0..1', () => {
    const a = { ...zeroVector(), minimalism: 1 };
    const b = { ...zeroVector(), streetwear: 1 };
    const s = cosineSimilarity(a, b);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('returns 0 when either vector is all zeros, rather than NaN', () => {
    expect(cosineSimilarity(zeroVector(), { ...zeroVector(), minimalism: 1 })).toBe(0);
  });
});

describe('blendVectors', () => {
  it('normalises weights that do not sum to 1', () => {
    const a = { ...zeroVector(), minimalism: 1 };
    const b = { ...zeroVector(), minimalism: 0 };
    expect(blendVectors([{ vector: a, weight: 3 }, { vector: b, weight: 1 }]).minimalism).toBeCloseTo(0.75, 6);
  });

  it('returns a zero vector for an empty list', () => {
    expect(blendVectors([])).toEqual(zeroVector());
  });
});

describe('questionnaireToVector', () => {
  it('maps a fully minimal setting to high minimalism and low colourfulness', () => {
    const v = questionnaireToVector(q({ minimalExpressive: 0, neutralColorful: 0 }));
    expect(v.minimalism).toBe(1);
    expect(v.colorfulness).toBe(0);
  });

  it('maps a fully casual setting to high relaxed fit and zero formal', () => {
    const v = questionnaireToVector(q({ formalCasual: 1 }));
    expect(v.relaxedFit).toBe(1);
    expect(v.formal).toBe(0);
  });

  it('maps practical settings to workwear and outdoor', () => {
    const v = questionnaireToVector(q({ practicalFashion: 0 }));
    expect(v.workwear).toBeCloseTo(0.6, 6);
    expect(v.outdoor).toBeCloseTo(0.5, 6);
  });

  it('boosts dimensions for selected words and stays in range', () => {
    const plain = questionnaireToVector(q());
    const boosted = questionnaireToVector(q({}, ['Outdoorsy']));
    expect(boosted.outdoor).toBeGreaterThan(plain.outdoor);
    for (const d of STYLE_DIMENSIONS) {
      expect(boosted[d]).toBeGreaterThanOrEqual(0);
      expect(boosted[d]).toBeLessThanOrEqual(1);
    }
  });

  it('lets Minimalist raise minimalism and lower pattern', () => {
    const plain = questionnaireToVector(q());
    const min = questionnaireToVector(q({}, ['Minimalist']));
    expect(min.minimalism).toBeGreaterThan(plain.minimalism);
    expect(min.pattern).toBeLessThan(plain.pattern);
  });

  // --- formula-pinning tests (one per affected dimension) ---

  it('pattern = 0.2 + 0.6 * minimalExpressive', () => {
    // At 0.75: 0.2 + 0.6*0.75 = 0.65
    const v = questionnaireToVector(q({ minimalExpressive: 0.75, neutralColorful: 0 }));
    expect(v.pattern).toBeCloseTo(0.65, 6);
  });

  it('pattern floor is 0.2 when minimalExpressive is 0', () => {
    const v = questionnaireToVector(q({ minimalExpressive: 0, neutralColorful: 0 }));
    expect(v.pattern).toBeCloseTo(0.2, 6);
  });

  it('streetwear = 0.5 * classicTrendy + 0.5 * practicalFashion', () => {
    // classicTrendy=0.6, practicalFashion=0.4 → 0.5*0.6 + 0.5*0.4 = 0.5
    const v = questionnaireToVector(q({ classicTrendy: 0.6, practicalFashion: 0.4 }));
    expect(v.streetwear).toBeCloseTo(0.5, 6);
  });

  it('streetwear includes the practicalFashion term (nonzero when classicTrendy=0)', () => {
    // If practicalFashion term were missing, streetwear would be 0 here.
    const v = questionnaireToVector(q({ classicTrendy: 0, practicalFashion: 0.8 }));
    expect(v.streetwear).toBeCloseTo(0.4, 6);
  });

  it('vintage = 0.7 * (1 - classicTrendy)', () => {
    // At classicTrendy=0.4: 0.7*(1-0.4) = 0.42
    const v = questionnaireToVector(q({ classicTrendy: 0.4 }));
    expect(v.vintage).toBeCloseTo(0.42, 6);
  });

  it('vintage is 0 when classicTrendy is 1 (not 1 - 1 = 0 without the factor)', () => {
    const v = questionnaireToVector(q({ classicTrendy: 1 }));
    expect(v.vintage).toBeCloseTo(0, 6);
  });

  it('colorfulness = neutralColorful alone (not blended with minimalExpressive)', () => {
    // minimalExpressive=1 should not inflate colorfulness; neutralColorful=0.3 → 0.3
    const v = questionnaireToVector(q({ minimalExpressive: 1, neutralColorful: 0.3 }));
    expect(v.colorfulness).toBeCloseTo(0.3, 6);
  });

  it('colorfulness is 0 when neutralColorful=0 regardless of minimalExpressive', () => {
    const v = questionnaireToVector(q({ minimalExpressive: 1, neutralColorful: 0 }));
    expect(v.colorfulness).toBeCloseTo(0, 6);
  });

  it('minimalism = 1 - minimalExpressive', () => {
    const v = questionnaireToVector(q({ minimalExpressive: 0.3, neutralColorful: 0 }));
    expect(v.minimalism).toBeCloseTo(0.7, 6);
  });

  it('formal = 1 - formalCasual, relaxedFit = formalCasual', () => {
    const v = questionnaireToVector(q({ formalCasual: 0.4 }));
    expect(v.formal).toBeCloseTo(0.6, 6);
    expect(v.relaxedFit).toBeCloseTo(0.4, 6);
  });

  it('workwear = 0.6 * (1 - practicalFashion), outdoor = 0.5 * (1 - practicalFashion)', () => {
    // practicalFashion=0.25 → workwear=0.6*0.75=0.45, outdoor=0.5*0.75=0.375
    const v = questionnaireToVector(q({ practicalFashion: 0.25 }));
    expect(v.workwear).toBeCloseTo(0.45, 6);
    expect(v.outdoor).toBeCloseTo(0.375, 6);
  });
});

describe('composeStyleVector', () => {
  it('falls back to the questionnaire vector when there are no attributes', () => {
    expect(composeStyleVector([], q({ formalCasual: 1 }))).toEqual(questionnaireToVector(q({ formalCasual: 1 })));
  });

  it('lets image attributes pull the result away from the questionnaire', () => {
    const qq = q();
    const withImages = composeStyleVector(
      [{ style: ['workwear', 'outdoorsy'], colors: ['olive'], fit: ['relaxed'], patterns: ['solid'], materials: ['denim'], items: [] }],
      qq,
    );
    expect(withImages.outdoor).not.toBeCloseTo(questionnaireToVector(qq).outdoor, 6);
  });
});

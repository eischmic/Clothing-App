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

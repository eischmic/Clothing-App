import { EVIDENCE_K, blendWithPrior, evidenceWeight, zeroVector } from '@/lib/vector';
import { STYLE_DIMENSIONS, type StyleVector } from '@/lib/types';

function filled(value: number): StyleVector {
  const v = zeroVector();
  for (const d of STYLE_DIMENSIONS) v[d] = value;
  return v;
}

const CLIP = filled(1);
const QUESTIONNAIRE = filled(0);

describe('evidenceWeight', () => {
  it('is zero with no evidence', () => {
    expect(evidenceWeight(0, 0)).toBe(0);
  });

  it('matches n / (n + K)', () => {
    expect(evidenceWeight(3, 0)).toBeCloseTo(3 / (3 + EVIDENCE_K), 6);
    expect(evidenceWeight(8, 0)).toBeCloseTo(8 / (8 + EVIDENCE_K), 6);
    expect(evidenceWeight(8, 20)).toBeCloseTo(28 / (28 + EVIDENCE_K), 6);
  });

  it('hits the documented values from the design', () => {
    expect(evidenceWeight(3, 0)).toBeCloseTo(0.43, 2);
    expect(evidenceWeight(8, 0)).toBeCloseTo(0.67, 2);
    // 28/32 is exactly 0.875. The design doc rounds that to 0.88, but 0.88 sits
    // precisely on toBeCloseTo's precision-2 boundary (tolerance 0.005, and the
    // difference IS 0.005), so the brief's assertion cannot pass. Pin the exact
    // value rather than widening the tolerance to 0.05, which would let this
    // check pass for anything from 0.83 to 0.93.
    expect(evidenceWeight(8, 20)).toBeCloseTo(0.875, 6);
  });

  it('is monotone increasing in evidence', () => {
    const weights = [0, 1, 2, 5, 10, 50, 500].map((n) => evidenceWeight(n, 0));
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
  });

  it('approaches but never exceeds 1', () => {
    expect(evidenceWeight(100000, 0)).toBeGreaterThan(0.99);
    expect(evidenceWeight(100000, 0)).toBeLessThanOrEqual(1);
  });

  it('treats negative counts as zero', () => {
    expect(evidenceWeight(-5, -5)).toBe(0);
  });
});

describe('blendWithPrior', () => {
  it('returns the questionnaire exactly when there is no evidence', () => {
    const out = blendWithPrior(CLIP, QUESTIONNAIRE, 0, 0);
    for (const d of STYLE_DIMENSIONS) expect(out[d]).toBeCloseTo(0, 6);
  });

  it('weights the two vectors by w and 1-w', () => {
    const out = blendWithPrior(CLIP, QUESTIONNAIRE, 4, 0);
    // n = 4, K = 4 -> w = 0.5
    for (const d of STYLE_DIMENSIONS) expect(out[d]).toBeCloseTo(0.5, 6);
  });

  it('moves monotonically toward the clip vector as evidence accumulates', () => {
    const values = [0, 2, 4, 10, 40].map((n) => blendWithPrior(CLIP, QUESTIONNAIRE, n, 0).minimalism);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('converges on the clip vector with overwhelming evidence', () => {
    const out = blendWithPrior(CLIP, QUESTIONNAIRE, 10000, 0);
    for (const d of STYLE_DIMENSIONS) expect(out[d]).toBeGreaterThan(0.99);
  });

  it('counts swipes and references identically', () => {
    const a = blendWithPrior(CLIP, QUESTIONNAIRE, 6, 2);
    const b = blendWithPrior(CLIP, QUESTIONNAIRE, 2, 6);
    for (const d of STYLE_DIMENSIONS) expect(a[d]).toBeCloseTo(b[d], 6);
  });

  it('clamps an out-of-range clip vector into [0, 1]', () => {
    // `clip` comes off the network. An axis outside [0, 1] would otherwise
    // flow straight into cosine scoring and skew every recommendation.
    const out = blendWithPrior(filled(9), filled(-4), 10, 0);
    for (const d of STYLE_DIMENSIONS) {
      expect(out[d]).toBeGreaterThanOrEqual(0);
      expect(out[d]).toBeLessThanOrEqual(1);
    }
  });

  it('clamps on the no-evidence path too', () => {
    const out = blendWithPrior(CLIP, filled(-1), 0, 0);
    for (const d of STYLE_DIMENSIONS) expect(out[d]).toBe(0);
  });
});

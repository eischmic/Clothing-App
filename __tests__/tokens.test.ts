import { BASE, VIBES, SPACING, RADII, DURATION } from '@/theme/tokens';
import { VIBE_NAMES } from '@/lib/types';

describe('design tokens', () => {
  it('pins the dark base palette', () => {
    expect(BASE.canvas).toBe('#0A0A0B');
    expect(BASE.elev1).toBe('#101012');
    expect(BASE.elev2).toBe('#17171A');
    expect(BASE.elev3).toBe('#1F1F23');
    expect(BASE.hairline).toBe('#2A2A2F');
    expect(BASE.textHi).toBe('#F5F4F2');
    expect(BASE.textMid).toBe('#A3A09C');
    expect(BASE.textLow).toBe('#6B6862');
  });

  it('defines a full ramp for every vibe', () => {
    for (const name of VIBE_NAMES) {
      const ramp = VIBES[name];
      expect(ramp.base).toMatch(/^#[0-9A-F]{6}$/i);
      expect(ramp.bright).toMatch(/^#[0-9A-F]{6}$/i);
      expect(ramp.dim).toMatch(/^#[0-9A-F]{6}$/i);
      expect(ramp.glow).toMatch(/^rgba\(/);
      expect(typeof ramp.label).toBe('string');
    }
  });

  it('pins the spec accent values', () => {
    expect(VIBES.noir.base).toBe('#E8E6E3');
    expect(VIBES.ember.base).toBe('#FF7A45');
    expect(VIBES.sage.base).toBe('#7FB77E');
    expect(VIBES.cobalt.base).toBe('#4D7CFE');
    expect(VIBES.orchid.base).toBe('#B57EDC');
    expect(VIBES.sand.base).toBe('#D9B382');
  });

  it('uses a 4px spacing scale and a 320ms transition', () => {
    expect(SPACING.md % 4).toBe(0);
    expect(RADII.card).toBeGreaterThan(0);
    expect(DURATION.theme).toBe(320);
  });
});

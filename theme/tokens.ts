import type { VibeName } from '@/lib/types';

export const BASE = {
  canvas: '#0A0A0B', elev1: '#101012', elev2: '#17171A', elev3: '#1F1F23',
  hairline: '#2A2A2F', textHi: '#F5F4F2', textMid: '#A3A09C', textLow: '#6B6862',
  danger: '#FF5A5A', success: '#4ED07A',
} as const;

export interface VibeRamp {
  label: string; base: string; bright: string; dim: string; glow: string;
}

export const VIBES: Record<VibeName, VibeRamp> = {
  noir:   { label: 'Noir',   base: '#E8E6E3', bright: '#FFFFFF', dim: '#8C8A86', glow: 'rgba(232,230,227,0.22)' },
  ember:  { label: 'Ember',  base: '#FF7A45', bright: '#FF9E75', dim: '#A34A25', glow: 'rgba(255,122,69,0.26)' },
  sage:   { label: 'Sage',   base: '#7FB77E', bright: '#A3D3A2', dim: '#4C7A4B', glow: 'rgba(127,183,126,0.24)' },
  cobalt: { label: 'Cobalt', base: '#4D7CFE', bright: '#7E9EFF', dim: '#2B4BA6', glow: 'rgba(77,124,254,0.26)' },
  orchid: { label: 'Orchid', base: '#B57EDC', bright: '#CEA4EC', dim: '#734D91', glow: 'rgba(181,126,220,0.26)' },
  sand:   { label: 'Sand',   base: '#D9B382', bright: '#EBCFA8', dim: '#8E7351', glow: 'rgba(217,179,130,0.24)' },
};

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const RADII = { chip: 999, card: 18, sheet: 28, tile: 14 } as const;
export const TYPE = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  title:   { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  section: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 1.4 },
  body:    { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;
export const DURATION = { theme: 320, fast: 160, reveal: 640 } as const;
export const EASING_BEZIER = [0.22, 1, 0.36, 1] as const;

import type { Category } from '@/lib/types';

export const GARMENT_PATHS: Record<Category, string> = {
  top: 'M28 20 L42 12 L58 12 L72 20 L86 35 L75 47 L68 39 L68 88 L32 88 L32 39 L25 47 L14 35 Z',
  bottom: 'M28 14 L72 14 L68 48 L78 90 L55 90 L50 57 L45 90 L22 90 L32 48 Z',
  outerwear: 'M25 18 L42 10 L58 10 L75 18 L90 42 L76 52 L68 40 L68 90 L32 90 L32 40 L24 52 L10 42 Z M50 14 L50 88',
  footwear: 'M18 58 L45 52 L59 65 L82 72 Q91 77 88 87 L15 87 Q10 78 18 58 Z',
  knitwear: 'M26 23 L41 12 L59 12 L74 23 L84 40 L70 48 L66 88 L34 88 L30 48 L16 40 Z M42 13 Q50 29 58 13',
  accessory: 'M18 44 L82 44 L82 58 L60 58 L60 67 L40 67 L40 58 L18 58 Z M42 48 L58 48 L58 62 L42 62 Z',
};

const COLORS: Record<string, string> = { black: '#202124', white: '#F5F3EF', grey: '#8C8A86', charcoal: '#353536', ivory: '#EEE9DE', cream: '#E8DFC9', beige: '#D8C6A8', tan: '#B88858', camel: '#B87846', brown: '#70442A', chocolate: '#44291D', olive: '#697A46', forest: '#2F5A43', khaki: '#A49660', sage: '#8AA178', rust: '#A55232', terracotta: '#B46247', orange: '#D87834', burgundy: '#6F2731', mustard: '#B38B2D', navy: '#243B68', indigo: '#384D9E', denim: '#52759B', cobalt: '#365FC6', purple: '#70428C', lilac: '#A989C5', magenta: '#B04383', pink: '#D9759A', red: '#B83C3C', yellow: '#D2B234' };
export function colorToHex(color: string): string { return COLORS[color.trim().toLowerCase()] ?? '#8C8A86'; }

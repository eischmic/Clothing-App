import { GARMENT_PATHS, colorToHex } from '@/lib/garmentPaths';
import { CATEGORIES, COLOR_TO_FAMILY } from '@/lib/types';
describe('garment art data', () => { it('defines a distinct path for every category', () => { expect(Object.keys(GARMENT_PATHS)).toHaveLength(CATEGORIES.length); expect(new Set(Object.values(GARMENT_PATHS)).size).toBe(CATEGORIES.length); }); it('maps known and unknown colours to hex', () => { Object.keys(COLOR_TO_FAMILY).forEach((color) => expect(colorToHex(color)).toMatch(/^#[0-9A-F]{6}$/i)); expect(colorToHex('chartreuse')).toBe('#8C8A86'); }); });

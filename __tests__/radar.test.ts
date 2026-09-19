import { radarPoints, DIMENSION_LABELS } from '@/lib/radar';
import { zeroVector } from '@/lib/vector';
import { STYLE_DIMENSIONS } from '@/lib/types';
describe('radarPoints', () => { it('returns canonical dimensions and centres zero values', () => { const points = radarPoints(zeroVector(), 80, 100); expect(points.map((p) => p.dimension)).toEqual([...STYLE_DIMENSIONS]); expect(points.every((p) => p.x === 100 && p.y === 100)).toBe(true); }); it('labels dimensions', () => expect(Object.values(DIMENSION_LABELS)).toHaveLength(STYLE_DIMENSIONS.length)); });

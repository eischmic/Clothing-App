import { buildStyleProfile } from '@/lib/profile';
import type { Questionnaire } from '@/lib/types';
const questionnaire: Questionnaire = { sliders: { minimalExpressive: .2, classicTrendy: .4, formalCasual: .9, practicalFashion: .2, neutralColorful: .2 }, words: ['Outdoorsy', 'Minimalist', 'Laid-back'] };
describe('buildStyleProfile', () => { it('builds a stable usable profile', () => { const profile = buildStyleProfile({ attributes: [{ style: ['minimalist'], colors: ['olive'], fit: ['relaxed'], patterns: [], materials: ['cotton'], items: [] }], questionnaire }); expect(profile.tags).toHaveLength(3); expect(profile.vibe).toBe('sage'); expect(profile.dominantColors).toContain('olive'); }); });

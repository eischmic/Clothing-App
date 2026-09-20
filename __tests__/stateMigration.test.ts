import { migrateV1ToV2, normalizePersistedState } from '@/lib/stateMigration';
import type { PersistedStateV1 } from '@/lib/stateMigration';

it('fills missing profile arrays from an older persisted store', () => {
  const state = normalizePersistedState({
    styleProfile: { vibe: 'sage', vector: {} as never, tags: ['Relaxed'] },
  });
  expect(state.styleProfile?.silhouettes).toEqual([]);
  expect(state.styleProfile?.materials).toEqual([]);
  expect(state.styleProfile?.dominantColors).toEqual([]);
});

describe('migrateV1ToV2', () => {
  const v1 = {
    questionnaire: { sliders: { minimalExpressive: 0.2 }, words: ['Bold'] },
    inspoImages: [{ id: 'i1', uri: 'file://a', attributes: null, uploadedAt: 'T0' }],
    wardrobeItems: [{ id: 'w1' }],
    styleProfile: { vibe: 'sage', vector: {}, tags: ['Relaxed'], createdAt: 'T1', updatedAt: 'T2' },
    savedProductIds: ['p1', 'p2'],
    themeMode: 'auto',
  } as unknown as PersistedStateV1;

  it('produces exactly one profile carrying the old fields across', () => {
    const next = migrateV1ToV2(v1);
    expect(next.profiles).toHaveLength(1);
    const [record] = next.profiles;
    expect(record.id).toBe('profile-1');
    expect(record.name).toBe('My style');
    expect(record.wishlistIds).toEqual(['p1', 'p2']);
    expect(record.referenceImages).toHaveLength(1);
    expect(record.wardrobeItems).toHaveLength(1);
    expect(record.rejectedIds).toEqual([]);
    expect(record.savedOutfits).toEqual([]);
    expect(record.createdAt).toBe('T1');
    expect(record.updatedAt).toBe('T2');
    expect(next.activeProfileId).toBe('profile-1');
    expect(next.draft).toBeNull();
    expect(next.themeMode).toBe('auto');
  });

  it('yields no profiles when onboarding never finished', () => {
    const next = migrateV1ToV2({ ...v1, styleProfile: null });
    expect(next.profiles).toEqual([]);
    expect(next.activeProfileId).toBeNull();
  });

  it('is deterministic — no Date.now or randomness', () => {
    expect(migrateV1ToV2(v1)).toEqual(migrateV1ToV2(v1));
  });

  it('array-fills a profile missing its list fields', () => {
    const { profile } = migrateV1ToV2(v1).profiles[0];
    expect(profile.silhouettes).toEqual([]);
    expect(profile.materials).toEqual([]);
    expect(profile.dominantColors).toEqual([]);
    expect(profile.vibes).toEqual([]);
  });

  it('falls back to the epoch when the profile carries no timestamps', () => {
    const bare = { ...v1, styleProfile: { vibe: 'sage', vector: {} } } as unknown as PersistedStateV1;
    expect(migrateV1ToV2(bare).profiles[0].createdAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('defaults the theme when the persisted blob predates it', () => {
    const { themeMode, ...rest } = v1;
    expect(migrateV1ToV2(rest as PersistedStateV1).themeMode).toBe('auto');
  });
});

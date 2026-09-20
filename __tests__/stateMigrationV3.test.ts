import { migrateV2ToV3 } from '@/lib/stateMigration';
import type { PersistedStateV2 } from '@/lib/stateMigration';
import { DEMO_PROFILE } from '@/lib/fixtures';

function v2Blob(): PersistedStateV2 {
  return {
    profiles: [
      {
        id: 'profile-1',
        name: 'My style',
        profile: DEMO_PROFILE,
        questionnaire: DEMO_PROFILE.questionnaire!,
        referenceImages: [],
        wardrobeItems: [],
        wishlistIds: ['top-classic-black'],
        rejectedIds: [],
        savedOutfits: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    activeProfileId: 'profile-1',
    draft: null,
    themeMode: 'auto',
  } as PersistedStateV2;
}

describe('migrateV2ToV3', () => {
  it('defaults backendProfileId to null on every profile', () => {
    const out = migrateV2ToV3(v2Blob());
    expect(out.profiles).toHaveLength(1);
    expect(out.profiles[0].backendProfileId).toBeNull();
  });

  it('seeds an empty catalog slice', () => {
    const out = migrateV2ToV3(v2Blob());
    expect(out.catalog).toEqual({ byId: {} });
  });

  it('preserves everything else untouched', () => {
    const before = v2Blob();
    const out = migrateV2ToV3(before);
    expect(out.activeProfileId).toBe('profile-1');
    expect(out.themeMode).toBe('auto');
    expect(out.draft).toBeNull();
    expect(out.profiles[0].wishlistIds).toEqual(['top-classic-black']);
    expect(out.profiles[0].name).toBe('My style');
  });

  it('handles an empty profiles list', () => {
    const out = migrateV2ToV3({
      profiles: [], activeProfileId: null, draft: null, themeMode: 'auto',
    } as PersistedStateV2);
    expect(out.profiles).toEqual([]);
    expect(out.catalog).toEqual({ byId: {} });
  });

  it('is idempotent on a blob that already has backendProfileId', () => {
    const once = migrateV2ToV3(v2Blob());
    const twice = migrateV2ToV3(once as unknown as PersistedStateV2);
    expect(twice.profiles[0].backendProfileId).toBeNull();
  });
});

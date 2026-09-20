import { normalizePersistedState } from '@/lib/stateMigration';

it('fills missing profile arrays from an older persisted store', () => {
  const state = normalizePersistedState({
    styleProfile: { vibe: 'sage', vector: {} as never, tags: ['Relaxed'] },
  });
  expect(state.styleProfile?.silhouettes).toEqual([]);
  expect(state.styleProfile?.materials).toEqual([]);
  expect(state.styleProfile?.dominantColors).toEqual([]);
});

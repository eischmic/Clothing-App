import { PANES, INITIAL_PANE_INDEX, clampIndex } from '@/lib/pager';

describe('PANES', () => {
  it('is profile, explore, closet in tab order', () => {
    expect(PANES.map((pane) => pane.id)).toEqual(['profile', 'explore', 'closet']);
  });

  it('gives every pane a screen-reader label', () => {
    expect(PANES.map((pane) => pane.label)).toEqual(['Profile', 'Explore', 'Closet']);
  });
});

describe('INITIAL_PANE_INDEX', () => {
  it('lands on the middle pane', () => {
    expect(INITIAL_PANE_INDEX).toBe(1);
    expect(PANES[INITIAL_PANE_INDEX].id).toBe('explore');
  });
});

describe('clampIndex', () => {
  it('rounds to the nearest pane', () => {
    expect(clampIndex(0.4)).toBe(0);
    expect(clampIndex(0.6)).toBe(1);
    expect(clampIndex(1.5)).toBe(2);
  });

  it('clamps past either end', () => {
    expect(clampIndex(-3)).toBe(0);
    expect(clampIndex(9)).toBe(2);
  });

  it('falls back to the initial pane when width is unknown', () => {
    expect(clampIndex(Number.NaN)).toBe(INITIAL_PANE_INDEX);
    expect(clampIndex(Number.POSITIVE_INFINITY)).toBe(INITIAL_PANE_INDEX);
  });
});

import { PANES, INITIAL_PANE_INDEX, clampIndex, dragIndex, settleIndex } from '@/lib/pager';

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

describe('settleIndex', () => {
  it('rounds to the nearest pane below the flick threshold', () => {
    expect(settleIndex(1.4, 0, 1)).toBe(1);
    expect(settleIndex(1.6, 0, 1)).toBe(2);
  });

  it('advances on a rightward flick even from a short drag', () => {
    expect(settleIndex(1.1, 900, 1)).toBe(2);
  });

  it('goes back on a leftward flick', () => {
    expect(settleIndex(0.9, -900, 1)).toBe(0);
  });

  it('clamps flicks at either end', () => {
    expect(settleIndex(2, 900, 2)).toBe(2);
    expect(settleIndex(0, -900, 0)).toBe(0);
  });

  it('falls back to the initial pane when the position is unknown', () => {
    expect(settleIndex(Number.NaN, 0, 1)).toBe(INITIAL_PANE_INDEX);
  });
});

describe('dragIndex', () => {
  it('returns the origin for no movement', () => {
    expect(dragIndex(1, 0, 40)).toBe(1);
  });

  it('advances one pane per tab-slot dragged right', () => {
    expect(dragIndex(1, 40, 40)).toBe(2);
  });

  it('clamps at both ends', () => {
    expect(dragIndex(0, -400, 40)).toBe(0);
    expect(dragIndex(2, 400, 40)).toBe(2);
  });

  it('returns the origin before first layout', () => {
    expect(dragIndex(1, 80, 0)).toBe(1);
  });
});

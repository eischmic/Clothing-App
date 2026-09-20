export type PaneId = 'profile' | 'explore' | 'closet';

export interface Pane {
  id: PaneId;
  /** Spoken by screen readers. The tab bar renders icons only. */
  label: string;
}

export const PANES: readonly Pane[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'explore', label: 'Explore' },
  { id: 'closet', label: 'Closet' },
];

export const INITIAL_PANE_INDEX = 1;

/**
 * Scroll offset divided by window width is NaN before the first layout on web,
 * so a non-finite index falls back to the landing pane rather than 0.
 */
export function clampIndex(index: number): number {
  if (!Number.isFinite(index)) return INITIAL_PANE_INDEX;
  return Math.min(PANES.length - 1, Math.max(0, Math.round(index)));
}

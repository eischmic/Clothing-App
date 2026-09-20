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
  'worklet';
  if (!Number.isFinite(index)) return INITIAL_PANE_INDEX;
  return Math.min(PANES.length - 1, Math.max(0, Math.round(index)));
}

export const FLICK_VELOCITY = 500;

/**
 * Pane index a release settles on. `index` is the fractional position the drag
 * ended at, `velocity` is horizontal px/s (positive to the right), `from` is
 * the pane the drag started on. A fast flick commits to the adjacent pane even
 * when the drag covered less than half a slot.
 */
export function settleIndex(index: number, velocity: number, from: number): number {
  'worklet';
  if (!Number.isFinite(index)) return INITIAL_PANE_INDEX;
  if (velocity >= FLICK_VELOCITY) return clampIndex(from + 1);
  if (velocity <= -FLICK_VELOCITY) return clampIndex(from - 1);
  return clampIndex(index);
}

/**
 * Fractional pane position during a drag, clamped so the row cannot overscroll.
 * The pill follows the finger: dragging right selects a later pane. `slot` is
 * the tab-slot width, so a finger crossing one tab moves one full pane.
 */
export function dragIndex(from: number, translationX: number, slot: number): number {
  'worklet';
  if (slot <= 0) return from;
  return Math.min(PANES.length - 1, Math.max(0, from + translationX / slot));
}

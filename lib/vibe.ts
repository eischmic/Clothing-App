import { COLOR_TO_VIBE, VibeName } from '@/lib/types';

export function deriveVibe(colors: string[]): VibeName {
  // Tally vibe counts and track first-seen index
  const vibeTally: Partial<Record<VibeName, { count: number; firstSeenIndex: number }>> = {};

  for (let i = 0; i < colors.length; i++) {
    const normalized = colors[i].trim().toLowerCase();
    const vibe = COLOR_TO_VIBE[normalized];

    // Only process known colors
    if (vibe) {
      if (!vibeTally[vibe]) {
        vibeTally[vibe] = { count: 0, firstSeenIndex: i };
      }
      vibeTally[vibe].count += 1;
    }
  }

  // If no known colors, return noir
  if (Object.keys(vibeTally).length === 0) {
    return 'noir';
  }

  // Find the vibe with highest count, breaking ties on lowest first-seen index
  let bestVibe: VibeName = 'noir';
  let bestCount = 0;
  let bestFirstSeenIndex = Infinity;

  for (const vibe in vibeTally) {
    const entry = vibeTally[vibe as VibeName];
    if (entry && (entry.count > bestCount || (entry.count === bestCount && entry.firstSeenIndex < bestFirstSeenIndex))) {
      bestVibe = vibe as VibeName;
      bestCount = entry.count;
      bestFirstSeenIndex = entry.firstSeenIndex;
    }
  }

  return bestVibe;
}

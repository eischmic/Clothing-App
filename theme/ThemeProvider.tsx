import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SharedValue, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import type { VibeName } from '@/lib/types';
import {
  BASE, VIBES, SPACING, RADII, TYPE,
  DURATION, EASING_BEZIER,
  type VibeRamp,
} from './tokens';

export interface ThemeValue {
  base: typeof BASE;
  accent: VibeRamp;
  prevAccent: VibeRamp;
  vibe: VibeName;
  mode: 'auto' | VibeName;
  setMode: (m: 'auto' | VibeName) => void;
  accentProgress: SharedValue<number>;
  spacing: typeof SPACING;
  radii: typeof RADII;
  type: typeof TYPE;
}

// null sentinel means "not yet provided"
export const ThemeContext = createContext<ThemeValue | null>(null);

interface ThemeProviderProps {
  profileVibe: VibeName | null;
  /** Current theme mode — store owns the source of truth. */
  mode: 'auto' | VibeName;
  /** Called when the user changes the mode via setMode(). */
  onModeChange: (m: 'auto' | VibeName) => void;
  children: React.ReactNode;
}

function resolveVibe(mode: 'auto' | VibeName, profileVibe: VibeName | null): VibeName {
  if (mode === 'auto') return profileVibe ?? 'noir';
  return mode;
}

export function ThemeProvider({ profileVibe, mode, onModeChange, children }: ThemeProviderProps) {
  const vibe = resolveVibe(mode, profileVibe);

  const accentProgress = useSharedValue(1);

  // Track previous vibe separately so we can expose prevAccent
  const prevVibeRef = useRef<VibeName>(vibe);
  const [prevAccentVibe, setPrevAccentVibe] = useState<VibeName>(vibe);

  useEffect(() => {
    if (vibe !== prevVibeRef.current) {
      // Save the previous vibe before transitioning
      const oldVibe = prevVibeRef.current;
      prevVibeRef.current = vibe;
      setPrevAccentVibe(oldVibe);
      // Reset progress and animate to 1
      accentProgress.value = 0;
      accentProgress.value = withTiming(1, {
        duration: DURATION.theme,
        easing: Easing.bezier(EASING_BEZIER[0], EASING_BEZIER[1], EASING_BEZIER[2], EASING_BEZIER[3]),
      });
    }
  }, [vibe, accentProgress]);

  const setMode = useCallback((m: 'auto' | VibeName) => {
    onModeChange(m);
  }, [onModeChange]);

  const value: ThemeValue = useMemo(() => ({
    base: BASE,
    accent: VIBES[vibe],
    prevAccent: VIBES[prevAccentVibe],
    vibe,
    mode,
    setMode,
    accentProgress,
    spacing: SPACING,
    radii: RADII,
    type: TYPE,
  }), [vibe, mode, prevAccentVibe, setMode, accentProgress]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

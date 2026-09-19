import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
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
  children: React.ReactNode;
}

function resolveVibe(mode: 'auto' | VibeName, profileVibe: VibeName | null): VibeName {
  if (mode === 'auto') return profileVibe ?? 'noir';
  return mode;
}

export function ThemeProvider({ profileVibe, children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<'auto' | VibeName>('auto');
  const vibe = resolveVibe(mode, profileVibe);

  const [prevVibe, setPrevVibe] = useState<VibeName>(vibe);
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
    setModeState(m);
  }, []);

  const value: ThemeValue = {
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
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

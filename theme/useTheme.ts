import { useContext } from 'react';
import { ThemeContext, ThemeValue } from './ThemeProvider';

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error(
      'useTheme() was called outside <ThemeProvider>. ' +
      'Wrap your root layout with <ThemeProvider> to fix this.'
    );
  }
  return ctx;
}

export type { ThemeValue };

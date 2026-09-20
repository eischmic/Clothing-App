import React, { useEffect, useState } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useAppStore } from '@/store/useAppStore';
import { selectActiveProfile } from '@/store/selectors';
import { BASE } from '@/theme/tokens';

function RootLayoutInner() {
  const hydrated     = useAppStore((s) => s.hydrated);
  const themeMode    = useAppStore((s) => s.themeMode);
  const styleProfile = useAppStore(selectActiveProfile);
  const profileCount = useAppStore((s) => s.profiles.length);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const segments = useSegments();

  // Track whether we are running on the client. On the server this stays false
  // and we never try to wait for AsyncStorage rehydration (which never fires
  // on the server). On the client it flips to true after the first paint, at
  // which point we wait for `hydrated` before rendering real content.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Block render until client-side hydration is confirmed.
  // On the server `mounted` is false — render null once (server + first client
  // render agree), then on the client we flip mounted and wait for hydrated.
  if (!mounted || !hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: BASE.canvas }} />
    );
  }

  if (profileCount === 0 && segments[0] !== 'onboarding') return <Redirect href="/onboarding" />;

  const profileVibe = styleProfile?.vibe ?? null;

  return (
    <ThemeProvider
      profileVibe={profileVibe}
      mode={themeMode}
      onModeChange={setThemeMode}
    >
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BASE.canvas } }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Wraps the placeholder branch too, so the root view's layout does not shift
  // when hydration flips. gesture-handler is a dependency but was never mounted,
  // which left every pan gesture in the app silently inert.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutInner />
    </GestureHandlerRootView>
  );
}

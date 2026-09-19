import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';

export default function ProfileScreen() {
  const { base, type } = useTheme();
  const styleProfile = useAppStore((s) => s.styleProfile);
  const themeMode = useAppStore((s) => s.themeMode);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={[type.display, { color: base.textHi, marginBottom: 12 }]}>
          Profile
        </Text>
        <Text style={[type.body, { color: base.textMid }]}>
          {styleProfile?.vibe ?? 'No vibe yet'} · {themeMode} mode
        </Text>
      </View>
    </SafeAreaView>
  );
}

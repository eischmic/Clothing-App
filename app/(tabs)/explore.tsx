import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';

export default function ExploreScreen() {
  const { base, type } = useTheme();
  const inspoImages = useAppStore((s) => s.inspoImages);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={[type.display, { color: base.textHi, marginBottom: 12 }]}>
          Explore
        </Text>
        <Text style={[type.body, { color: base.textMid }]}>
          {inspoImages.length} inspo images
        </Text>
      </View>
    </SafeAreaView>
  );
}

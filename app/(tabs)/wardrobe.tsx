import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';

export default function WardrobeScreen() {
  const { base, type } = useTheme();
  const wardrobeItems = useAppStore((s) => s.wardrobeItems);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={[type.display, { color: base.textHi, marginBottom: 12 }]}>
          Wardrobe
        </Text>
        <Text style={[type.body, { color: base.textMid }]}>
          {wardrobeItems.length} pieces
        </Text>
      </View>
    </SafeAreaView>
  );
}

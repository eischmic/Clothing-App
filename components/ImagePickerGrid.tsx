import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/theme/useTheme';

export function ImagePickerGrid({
  uris,
  onAdd,
  onRemove,
  max,
}: {
  uris: string[];
  onAdd: (uris: string[]) => void;
  onRemove: (uri: string) => void;
  max: number;
}) {
  const { base, accent, radii, spacing, type } = useTheme();
  const [error, setError] = useState('');

  const add = async () => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is needed to add images.');
      return;
    }
    const remaining = max - uris.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
      base64: false,
    });
    if (!result.canceled) {
      onAdd(result.assets.slice(0, remaining).map((asset) => asset.uri));
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {uris.map((uri) => (
          <View key={uri} style={{ width: 88, height: 88 }}>
            <Image source={{ uri }} style={{ width: 88, height: 88, borderRadius: radii.tile }} />
            <Pressable
              onPress={() => onRemove(uri)}
              accessibilityRole="button"
              accessibilityLabel="Remove image"
              hitSlop={8}
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                minWidth: 44,
                minHeight: 44,
                alignItems: 'flex-end',
                justifyContent: 'flex-start',
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: base.canvas,
                  borderWidth: 1,
                  borderColor: base.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: base.textHi, fontWeight: '700' }}>×</Text>
              </View>
            </Pressable>
          </View>
        ))}
        {uris.length < max ? (
          <Pressable
            onPress={add}
            accessibilityRole="button"
            accessibilityLabel="Add images"
            style={{
              width: 88,
              height: 88,
              borderRadius: radii.tile,
              borderStyle: 'dashed',
              borderWidth: 1,
              borderColor: accent.dim,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[type.title, { color: accent.bright }]}>＋</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[type.caption, { color: base.danger }]}>{error}</Text> : null}
    </View>
  );
}

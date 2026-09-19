import React from 'react';
import { Text, View } from 'react-native';
import { colorToHex } from '@/lib/garmentPaths';
import { useTheme } from '@/theme/useTheme';
export function PaletteRow({ colors }: { colors: string[] }) { const { base, type, spacing, radii } = useTheme(); return <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>{colors.map((color) => <View key={color} style={{ alignItems: 'center', gap: 4 }}><View style={{ width: 44, height: 44, borderRadius: radii.tile, backgroundColor: colorToHex(color), borderColor: base.hairline, borderWidth: 1 }} /><Text style={[type.caption, { color: base.textMid }]}>{color}</Text></View>)}</View>; }

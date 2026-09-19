import React from 'react'; import { Stack } from 'expo-router'; import { View } from 'react-native'; import { useTheme } from '@/theme/useTheme';
export default function OnboardingLayout() { const { base } = useTheme(); return <View style={{ flex: 1, backgroundColor: base.canvas }}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: base.canvas } }} /></View>; }

import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import {
  HomeIcon,
  ExploreIcon,
  FitsIcon,
  WardrobeIcon,
  ProfileIcon,
} from '@/components/TabIcons';

export default function TabsLayout() {
  const { accent, base } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent.base,
        tabBarInactiveTintColor: base.textLow,
        tabBarStyle: {
          backgroundColor: base.elev1,
          borderTopColor: base.hairline,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }: { color: ColorValue }) => <HomeIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }: { color: ColorValue }) => <ExploreIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="fits"
        options={{
          title: 'Fits',
          tabBarIcon: ({ color }: { color: ColorValue }) => <FitsIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: 'Wardrobe',
          tabBarIcon: ({ color }: { color: ColorValue }) => <WardrobeIcon color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }: { color: ColorValue }) => <ProfileIcon color={color as string} />,
        }}
      />
    </Tabs>
  );
}

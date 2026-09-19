// components/TabIcons.tsx — simple SVG glyphs for the five tab bar items.
// Uses react-native-svg only; no @expo/vector-icons dependency.

import React from 'react';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

export function HomeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H15v-5h-6v5H4a1 1 0 01-1-1V10.5z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ExploreIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7.5" stroke={color} strokeWidth={1.75} />
      <Line x1="16.5" y1="16.5" x2="21" y2="21" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}

export function FitsIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* T-shirt silhouette */}
      <Path
        d="M9 3H15L20 7l-2.5 2L17 20H7L6.5 9 4 7 9 3z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WardrobeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Hanger */}
      <Path
        d="M12 4a2 2 0 011 3.73L19.5 14H4.5L11 7.73A2 2 0 0112 4z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x="3" y="14" width="18" height="6" rx="1.5" stroke={color} strokeWidth={1.75} />
    </Svg>
  );
}

export function ProfileIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth={1.75} />
      <Path
        d="M4 20c0-4 3.582-7 8-7s8 3 8 7"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

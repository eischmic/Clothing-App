// components/TabIcons.tsx — simple SVG glyphs for the three tab bar items.
// Uses react-native-svg only; no @expo/vector-icons dependency.

import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
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

export function CompassIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={1.75} />
      <Path
        d="M15.4 8.6l-2 4.8-4.8 2 2-4.8 4.8-2z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

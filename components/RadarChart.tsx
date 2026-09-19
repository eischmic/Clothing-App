import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { STYLE_DIMENSIONS, type StyleVector } from '@/lib/types';
import { radarPoints } from '@/lib/radar';
import { useTheme } from '@/theme/useTheme';

export function RadarChart({ vector, size = 270 }: { vector: StyleVector; size?: number }) {
  const { base, accent, type, spacing } = useTheme(); const center = size / 2; const radius = size * .31; const points = radarPoints(vector, radius, center); const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');
  return <View accessibilityRole="image" accessibilityLabel="Style vector radar chart" style={{ alignItems: 'center' }}><Svg width={size} height={size}>{[.33,.66,1].map((n) => <Circle key={n} cx={center} cy={center} r={radius * n} stroke={base.hairline} fill="none" />)}{points.map((p) => <Line key={p.dimension} x1={center} y1={center} x2={center + (p.x - center) / Math.max(vector[p.dimension], .01)} y2={center + (p.y - center) / Math.max(vector[p.dimension], .01)} stroke={base.hairline} />)}<Polygon points={polygon} fill={accent.glow} stroke={accent.base} strokeWidth="2" /></Svg><View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }}>{STYLE_DIMENSIONS.map((d) => <Text key={d} style={[type.caption, { color: base.textLow }]}>{d === 'relaxedFit' ? 'Relaxed' : d === 'colorfulness' ? 'Colour' : d} {Math.round(vector[d] * 100)}%</Text>)}</View></View>;
}

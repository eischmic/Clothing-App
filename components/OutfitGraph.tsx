import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import type { WardrobeItem } from '@/lib/types';
import { useTheme } from '@/theme/useTheme';

export function OutfitGraph({ items, edges, highlightId }: { items: WardrobeItem[]; edges: Array<[string, string]>; highlightId?: string }) {
  const { base, accent, type } = useTheme(); const size = 280; const center = size / 2; const radius = 96;
  const nodes = items.slice(0, 20).map((item, index, all) => ({ item, x: center + Math.cos(-Math.PI / 2 + index * 2 * Math.PI / all.length) * radius, y: center + Math.sin(-Math.PI / 2 + index * 2 * Math.PI / all.length) * radius }));
  const node = (id: string) => nodes.find((n) => n.item.id === id);
  return <View accessibilityRole="image" accessibilityLabel={`${nodes.length} wardrobe pieces with ${edges.length} compatible connections`} style={{ alignItems: 'center' }}><Svg width={size} height={size}>{edges.map(([a,b]) => { const left = node(a); const right = node(b); if (!left || !right) return null; const lit = highlightId && (a === highlightId || b === highlightId); return <Line key={`${a}|${b}`} x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke={lit ? accent.base : base.hairline} strokeWidth={lit ? 2 : 1} />; })}{nodes.map(({ item, x, y }) => <Circle key={item.id} cx={x} cy={y} r={14} fill={base.elev3} stroke={item.id === highlightId ? accent.bright : accent.dim} strokeWidth={2} />)}</Svg><Text style={[type.caption, { color: base.textLow }]}>Tap a piece below to highlight its connections</Text></View>;
}

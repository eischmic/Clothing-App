import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SwipeTabBar } from '@/components/SwipeTabBar';
import { ClosetPane } from '@/components/panes/ClosetPane';
import { ExplorePane } from '@/components/panes/ExplorePane';
import { ProfilePane } from '@/components/panes/ProfilePane';
import { INITIAL_PANE_INDEX, PANES, clampIndex } from '@/lib/pager';
import { useTheme } from '@/theme/useTheme';

const PANE_SPRING = { damping: 22, stiffness: 190, mass: 0.7 } as const;

export default function PagerScreen() {
  const { base, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const dragFrom = useSharedValue(INITIAL_PANE_INDEX);
  const [selected, setSelected] = useState(INITIAL_PANE_INDEX);
  const landed = useRef(false);

  // The ref guard keeps a resize from yanking the user back to the middle pane.
  useEffect(() => {
    if (width === 0) return;
    if (!landed.current) {
      landed.current = true;
      scrollX.value = INITIAL_PANE_INDEX * width;
      return;
    }
    scrollX.value = selected * width;
  }, [scrollX, selected, width]);

  const onSelect = useCallback(
    (index: number) => {
      const next = clampIndex(index);
      setSelected(next);
      scrollX.value = reduceMotion ? next * width : withSpring(next * width, PANE_SPRING);
    },
    [reduceMotion, scrollX, width],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: base.canvas }}>
      {/* overflow:hidden matters on web — otherwise the off-screen panes extend
          the document and produce a horizontal scrollbar. */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View
          style={[{ flex: 1, flexDirection: 'row', width: width * PANES.length }, rowStyle]}
        >
          <View style={{ width }}>
            <ProfilePane />
          </View>
          <View style={{ width }}>
            <ExplorePane />
          </View>
          <View style={{ width }}>
            <ClosetPane />
          </View>
        </Animated.View>
      </View>
      <SwipeTabBar
        scrollX={scrollX}
        dragFrom={dragFrom}
        width={width}
        selected={selected}
        onSelect={onSelect}
      />
    </View>
  );
}

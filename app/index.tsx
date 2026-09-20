import React, { useCallback, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { SwipeTabBar } from '@/components/SwipeTabBar';
import { ClosetPane } from '@/components/panes/ClosetPane';
import { ExplorePane } from '@/components/panes/ExplorePane';
import { ProfilePane } from '@/components/panes/ProfilePane';
import { INITIAL_PANE_INDEX, clampIndex } from '@/lib/pager';
import { useTheme } from '@/theme/useTheme';

export default function PagerScreen() {
  const { base, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const lastIndex = useSharedValue(INITIAL_PANE_INDEX);
  const [selected, setSelected] = useState(INITIAL_PANE_INDEX);
  const landed = useRef(false);

  const selectIndex = useCallback((index: number) => setSelected(clampIndex(index)), []);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
    const next = width > 0 ? Math.round(event.contentOffset.x / width) : INITIAL_PANE_INDEX;
    if (next !== lastIndex.value) {
      lastIndex.value = next;
      runOnJS(selectIndex)(next);
    }
  });

  // contentOffset only honours an initial offset on iOS, so land on Explore
  // from a one-shot layout pass instead. The ref guard keeps a resize from
  // yanking the user back to the middle pane.
  const landOnExplore = useCallback(() => {
    if (landed.current || width === 0) return;
    landed.current = true;
    scrollRef.current?.scrollTo({ x: INITIAL_PANE_INDEX * width, animated: false });
  }, [scrollRef, width]);

  const onSelect = useCallback(
    (index: number) => {
      scrollRef.current?.scrollTo({ x: clampIndex(index) * width, animated: !reduceMotion });
    },
    [reduceMotion, scrollRef, width],
  );

  return (
    <View style={{ flex: 1, backgroundColor: base.canvas }}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={landOnExplore}
        style={{ flex: 1 }}
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
      </Animated.ScrollView>
      <SwipeTabBar scrollX={scrollX} width={width} selected={selected} onSelect={onSelect} />
    </View>
  );
}

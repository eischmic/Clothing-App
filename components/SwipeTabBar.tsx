import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { PANES, type PaneId } from '@/lib/pager';
import { useTheme } from '@/theme/useTheme';
import { CompassIcon, ProfileIcon, WardrobeIcon } from '@/components/TabIcons';

type Glyph = (props: { color: string; size?: number }) => React.JSX.Element;

const GLYPHS: Record<PaneId, Glyph> = {
  profile: ProfileIcon,
  explore: CompassIcon,
  closet: WardrobeIcon,
};

const ICON_SIZE = 24;
const BAR_HEIGHT = 52;
const PILL_WIDTH = 26;
const PILL_HEIGHT = 3;

function TabGlyph({
  index,
  scrollX,
  width,
  Icon,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  Icon: Glyph;
}) {
  const { base, accent } = useTheme();

  // The active copy fades in as its pane approaches, so the colour crossfades
  // with the drag instead of flipping when the gesture settles.
  const activeStyle = useAnimatedStyle(() => {
    const progress = width > 0 ? scrollX.value / width : index;
    return {
      opacity: interpolate(
        progress,
        [index - 1, index, index + 1],
        [0, 1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <View style={{ width: ICON_SIZE, height: ICON_SIZE }}>
      <Icon color={base.textLow} size={ICON_SIZE} />
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, activeStyle]}>
        <Icon color={accent.base} size={ICON_SIZE} />
      </Animated.View>
    </View>
  );
}

export function SwipeTabBar({
  scrollX,
  width,
  selected,
  onSelect,
}: {
  scrollX: SharedValue<number>;
  width: number;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { base, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const slot = width / PANES.length;

  const pillStyle = useAnimatedStyle(() => {
    const progress = width > 0 ? scrollX.value / width : 0;
    return { transform: [{ translateX: progress * slot + (slot - PILL_WIDTH) / 2 }] };
  });

  return (
    <View
      style={{
        backgroundColor: base.elev1,
        borderTopColor: base.hairline,
        borderTopWidth: 1,
        paddingBottom: insets.bottom,
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: PILL_WIDTH,
            height: PILL_HEIGHT,
            borderRadius: PILL_HEIGHT,
            backgroundColor: accent.base,
          },
          pillStyle,
        ]}
      />
      <View style={{ flexDirection: 'row' }}>
        {PANES.map((pane, index) => (
          <Pressable
            key={pane.id}
            accessibilityRole="tab"
            accessibilityLabel={pane.label}
            accessibilityState={{ selected: selected === index }}
            onPress={() => {
              if (Platform.OS !== 'web') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              onSelect(index);
            }}
            style={{ flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
          >
            <TabGlyph index={index} scrollX={scrollX} width={width} Icon={GLYPHS[pane.id]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

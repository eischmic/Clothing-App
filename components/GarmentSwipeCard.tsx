import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Product } from '@/lib/types';
import { GarmentArt } from '@/components/GarmentArt';
import { Surface } from '@/components/primitives';
import { useTheme } from '@/theme/useTheme';

const SWIPE_FRACTION = 0.28;
const FLING_VELOCITY = 800;
const EXIT_MS = 180;
const MAX_TILT = 8;

export function GarmentSwipeCard({
  product,
  height,
  isCommitting,
  reduceMotion,
  onSwipe,
  onPress,
}: {
  product: Product;
  height: number;
  isCommitting: SharedValue<boolean>;
  reduceMotion: boolean;
  onSwipe: (direction: 'yes' | 'no') => void;
  onPress: () => void;
}) {
  const { base, accent, type, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const threshold = width * SWIPE_FRACTION;
  const translateX = useSharedValue(0);

  const finish = (direction: 'yes' | 'no') => {
    onSwipe(direction);
    translateX.value = 0;
  };

  // isCommitting is pane-level: without it two slots can refill against the
  // same stale outfit and the second write clobbers the first.
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      if (isCommitting.value) return;
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (isCommitting.value) return;
      const committed =
        Math.abs(e.translationX) > threshold || Math.abs(e.velocityX) > FLING_VELOCITY;
      if (!committed) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
        return;
      }
      isCommitting.value = true;
      const direction = e.translationX > 0 ? 'yes' : 'no';
      const exit = Math.sign(e.translationX) * width * 1.2;
      if (reduceMotion) {
        runOnJS(finish)(direction);
      } else {
        translateX.value = withTiming(exit, { duration: EXIT_MS }, () => {
          runOnJS(finish)(direction);
        });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotateZ: `${interpolate(
          translateX.value,
          [-threshold, 0, threshold],
          [-MAX_TILT, 0, MAX_TILT],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ],
  }));

  const yesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [threshold * 0.25, threshold],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const noStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      -translateX.value,
      [threshold * 0.25, threshold],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={cardStyle}>
        <Surface
          level={2}
          style={{
            height,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.sm,
          }}
        >
          <GarmentArt category={product.category} color={product.color} size={height - 16} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              onPress={onPress}
              numberOfLines={2}
              accessibilityRole="button"
              accessibilityLabel={`${product.name} by ${product.brand}, $${product.price}. Open details.`}
              style={[type.body, { color: base.textHi, fontWeight: '700' }]}
            >
              {product.name}
            </Text>
            <Text style={[type.caption, { color: base.textMid }]}>
              {product.brand} · ${product.price}
            </Text>
          </View>
          <Animated.View style={[{ position: 'absolute', right: spacing.md }, yesStyle]}>
            <Text style={[type.title, { color: accent.bright }]}>YES</Text>
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: spacing.md }, noStyle]}>
            <Text style={[type.title, { color: base.textLow }]}>NO</Text>
          </Animated.View>
        </Surface>
      </Animated.View>
    </GestureDetector>
  );
}

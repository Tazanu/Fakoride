/**
 * Entrance motion, and the one rule that makes it acceptable.
 *
 * A list of destinations that fades in row by row reads as considered rather
 * than as a page that simply appeared. It is also the easiest thing in an app
 * to overdo, so this is deliberately one effect with a short duration and a
 * hard ceiling on the stagger — after a few rows the delay stops accumulating,
 * because a fourteenth zone arriving a second late is not elegance, it is lag.
 *
 * `useNativeDriver` is on: opacity and transform both qualify, which keeps this
 * off the JS thread on the cheap handsets this app is for.
 *
 * Reduced motion is honoured by rendering the final state immediately. The
 * motion here carries no information — it is decoration, and decoration is
 * exactly what that setting is asking us to drop.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/** Enough to notice, not enough to wait for. */
const DURATION_MS = 260;
const STAGGER_MS = 40;
/** After this many rows every remaining row shares the last delay. */
const MAX_STAGGERED = 6;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

/**
 * One row of a staggered list.
 *
 * `index` sets its place in the wave. Wrap list items, not whole screens — a
 * page that fades in as a block just looks slow.
 */
export function Appear({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      delay: Math.min(index, MAX_STAGGERED) * STAGGER_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              // Eight points, not thirty. It should read as settling into
              // place, not as sliding in from somewhere else.
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Press feedback.
 *
 * A button that moves under the thumb is the cheapest way to say "that
 * registered" on a handset where the next screen may take a second to arrive
 * over 3G. Scale only — no colour change — so it stacks with whatever pressed
 * style the button already has.
 *
 * Spring rather than timing: a press has no duration, it ends when the finger
 * lifts, and a spring is the only one of the two that can be interrupted
 * half-way and still look right.
 */
export function Press({
  onPress,
  disabled,
  children,
  style,
  pressedStyle,
  accessibilityLabel,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Kept alongside the scale: under reduced motion it is the only feedback left. */
  pressedStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [held, setHeld] = useState(false);

  const to = (value: number) => {
    if (reduced) return;
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        setHeld(true);
        to(0.97);
      }}
      onPressOut={() => {
        setHeld(false);
        to(1);
      }}
      disabled={disabled}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      <Animated.View style={[style, held ? pressedStyle : null, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * A ring that keeps going out, for a screen that is waiting on somebody else.
 *
 * This one is not decoration and does not stop for reduced motion the way
 * `Appear` does — it is the only thing on a "looking for a driver" screen that
 * distinguishes working from frozen, and a rider standing at a junction in the
 * dark deserves to know which. Under reduced motion it holds a static ring
 * instead of pulsing, which keeps the meaning without the movement.
 *
 * Renders behind its children, so put the dot or the badge inside it.
 */
export function Pulse({
  size,
  colour,
  children,
}: {
  size: number;
  colour: string;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [wave, reduced]);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colour,
          opacity: reduced
            ? 0.18
            : wave.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
          transform: reduced
            ? [{ scale: 1 }]
            : [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        }}
      />
      {children}
    </View>
  );
}

/**
 * A sheet arriving from the bottom of the screen.
 *
 * Longer and softer than `Appear` because it covers more of the screen: the
 * same 260ms that suits a list row reads as a flinch on a panel this size.
 */
export function Rise({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

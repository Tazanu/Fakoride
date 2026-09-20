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
import { AccessibilityInfo, Animated, type ViewStyle } from "react-native";

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

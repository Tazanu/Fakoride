/**
 * Keeping the button he is reaching for on the screen.
 *
 * Android resizes the window when the keypad opens (`adjustResize`, which Expo
 * sets by default), so nothing is ever *hidden* — but on a 720×1612 handset the
 * primary action ends up below the fold, and a driver holding the phone in one
 * hand at a junction has to notice that and scroll. He will not. He will decide
 * the app is broken.
 *
 * So the page scrolls itself to the bottom when the keypad appears. That is the
 * whole fix, and it is deliberately not `KeyboardAvoidingView` doing the work on
 * Android: stacking a second adjustment on top of `adjustResize` double-counts
 * the inset and leaves a gap the height of the keypad.
 */

import { useEffect, useRef } from "react";
import { Keyboard, Platform, type ScrollView } from "react-native";

/**
 * Attach to the ScrollView that holds a form.
 *
 * Returns the ref to spread onto it. The listener is `keyboardDidShow`, not
 * `WillShow`: only iOS fires the `Will` pair, and by the time `Did` lands the
 * layout has already settled, so the scroll lands in the right place on both.
 */
export function useScrollPastKeyboard() {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      // A frame of grace: on Android the resize and this event race, and
      // scrolling first means scrolling to the pre-resize bottom.
      requestAnimationFrame(() => ref.current?.scrollToEnd({ animated: true }));
    });
    return () => sub.remove();
  }, []);

  return ref;
}

/**
 * What to give KeyboardAvoidingView.
 *
 * iOS does not resize the window, so it needs real padding. Android already
 * resized, so it needs nothing and gets `undefined`.
 */
export const keyboardBehavior = Platform.OS === "ios" ? ("padding" as const) : undefined;

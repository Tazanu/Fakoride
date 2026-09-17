/**
 * Daylight, as React Native styles.
 *
 * This file translates; it never decides. Every colour, size and spacing value
 * comes from design/tokens.json — the same file `design/check-contrast.mjs`
 * asserts against — so a contrast fix made there reaches this app without
 * anybody retyping a hex. The two rules from design/README.md that this file
 * exists to enforce:
 *
 *   never write a colour as a literal hex in a component
 *   never give a button a fixed height or width
 *
 * If you find yourself wanting a value that is not here, the question is
 * whether the design system should have it — not whether to inline it.
 */

import { Platform, type TextStyle } from "react-native";
import tokens from "@design/tokens.json";

export type Scheme = "light" | "night";

export type Palette = (typeof tokens.color)["light"];

/**
 * Light is the default and night is the exception, not a preference toggle.
 *
 * This app is read standing at Checkpoint at one in the afternoon, four degrees
 * from the equator, where light mode measurably outreads dark. Night switches on
 * ambient light or time of day — never on taste.
 */
export function palette(scheme: Scheme = "light"): Palette {
  return tokens.color[scheme] as Palette;
}

/** MTN yellow and Orange orange. Only ever for a payment chip. */
export const brand = tokens.color.brand;

export const space = tokens.space;
export const radius = tokens.radius;
export const touch = tokens.touch;

/**
 * Interface text ships in the phone's own font.
 *
 * `undefined` is deliberate and is the whole point: it resolves to Roboto on
 * Android and San Francisco on iOS, costs no APK weight, and cannot produce a
 * flash of invisible text on the Android Go handsets our drivers carry. Only
 * the display face is bundled, and only for money, headings and the wordmark.
 */
export const fontFamily = {
  ui: undefined,
  display: "BarlowSemiCondensed_700Bold",
  displaySemi: "BarlowSemiCondensed_600SemiBold",
} as const;

/** The font keys expo-font loads at startup. Must match fontFamily above. */
export const DISPLAY_FONTS = ["BarlowSemiCondensed_600SemiBold", "BarlowSemiCondensed_700Bold"] as const;

type Role = "fare" | "fareSmall" | "title" | "heading" | "body" | "bodyPlain" | "secondary" | "label";

/**
 * Six sizes, and nothing in the product invents a seventh.
 *
 * Built from tokens.type so the floors stay honest: body never below 14, no
 * text below 12. The first version shipped 9px navigation labels, which is
 * unreadable one-handed, outdoors, in sun.
 */
function textStyle(role: Role): TextStyle {
  const t = tokens.type[role];
  const isDisplay = t.family === "display";
  return {
    fontSize: t.size,
    lineHeight: "lineHeight" in t ? Math.round(t.size * t.lineHeight) : undefined,
    ...(isDisplay
      ? { fontFamily: t.weight >= 700 ? fontFamily.display : fontFamily.displaySemi }
      : { fontWeight: String(t.weight) as TextStyle["fontWeight"] }),
    ...("letterSpacing" in t ? { letterSpacing: t.letterSpacing } : {}),
    ...("uppercase" in t && t.uppercase ? { textTransform: "uppercase" as const } : {}),
  };
}

export const type = {
  fare: textStyle("fare"),
  fareSmall: textStyle("fareSmall"),
  title: textStyle("title"),
  heading: textStyle("heading"),
  body: textStyle("body"),
  bodyPlain: textStyle("bodyPlain"),
  secondary: textStyle("secondary"),
  label: textStyle("label"),
} as const;

/**
 * Money, written the way it is spoken.
 *
 * The franc has no subunit, so there are never decimals. Thin spaces rather
 * than commas as the thousands separator, because French formatting is what
 * both halves of this market read — "2 150", not "2,150".
 */
export function xaf(amount: number): string {
  return Math.round(amount).toLocaleString("fr-FR").replace(/ | /g, " ");
}

/**
 * A touch target that satisfies Material's Android minimum.
 *
 * `minHeight`, never `height`: "Book this taxi" becomes "Réserver ce taxi"
 * and has to wrap without breaking the row. French runs 20–25% longer than
 * English and short labels expand the most.
 */
export const hitTarget = {
  minHeight: touch.min,
  minWidth: touch.min,
} as const;

export const primaryButton = {
  minHeight: touch.primaryButtonMinHeight,
  borderRadius: radius.md,
  paddingHorizontal: space.xl,
  paddingVertical: space.md,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

export const secondaryButton = {
  minHeight: touch.secondaryButtonMinHeight,
  borderRadius: radius.md,
  paddingHorizontal: space.lg,
  paddingVertical: space.sm,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

/** Android needs elevation; iOS needs the shadow quartet. */
export const cardShadow = Platform.select({
  android: { elevation: 1 },
  default: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});

export default tokens;

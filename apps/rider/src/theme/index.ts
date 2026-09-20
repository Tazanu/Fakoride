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

/**
 * The map's own colours.
 *
 * Kept apart from the interface palette on purpose: these are illustration, and
 * nothing outside the map panel may reach for them. A block grey that leaked
 * into a card would be a colour nobody chose for text to sit on.
 */
export const mapPalette = tokens.color.map;

/** The welcome badge's two colours. Artwork, never interface. */
export const logoPalette = tokens.color.logo;

export const space = tokens.space;
export const radius = tokens.radius;
export const touch = tokens.touch;

/**
 * The two faces, by exact PostScript name.
 *
 * Both are bundled. That is a change from the first version, which used the
 * phone's own font for body text to save weight — the design canvas asks for
 * Manrope throughout, and one typographic voice across a market where the
 * system face differs handset to handset is worth the download.
 */
export const fontFamily = {
  ui: "Manrope_400Regular",
  uiMedium: "Manrope_500Medium",
  uiSemi: "Manrope_600SemiBold",
  uiBold: "Manrope_700Bold",
  display: "Archivo_700Bold",
  displaySemi: "Archivo_600SemiBold",
} as const;

/**
 * The faces loaded at startup. Must match fontFamily above.
 *
 * Body text is a bundled face now rather than the phone's own. That costs a
 * download once, and buys a single typographic voice across a market where the
 * system font is Roboto on one handset and something else on the next.
 */
export const APP_FONTS = [
  "Archivo_600SemiBold",
  "Archivo_700Bold",
  "Manrope_400Regular",
  "Manrope_500Medium",
  "Manrope_600SemiBold",
  "Manrope_700Bold",
] as const;

type Role = keyof typeof tokens.type extends infer K
  ? K extends `$${string}`
    ? never
    : K
  : never;

/**
 * Six sizes, and nothing in the product invents a seventh.
 *
 * Built from tokens.type so the floors stay honest: body never below 14, no
 * text below 12. The first version shipped 9px navigation labels, which is
 * unreadable one-handed, outdoors, in sun.
 */
function textStyle(role: Role): TextStyle {
  const t = tokens.type[role] as {
    size: number;
    weight: number;
    family: "display" | "ui";
    lineHeight?: number;
    tracking?: number;
  };

  /**
   * Weight is chosen by picking a face, never by `fontWeight`.
   *
   * Android does not synthesise weights for a bundled family — asking for 600
   * on a family that only has 400 loaded gets you 400, silently, and the design
   * quietly flattens. Naming the exact face is the only way to be sure.
   */
  const family =
    t.family === "display"
      ? t.weight >= 700
        ? fontFamily.display
        : fontFamily.displaySemi
      : t.weight >= 700
        ? fontFamily.uiBold
        : t.weight >= 600
          ? fontFamily.uiSemi
          : t.weight >= 500
            ? fontFamily.uiMedium
            : fontFamily.ui;

  return {
    fontSize: t.size,
    fontFamily: family,
    ...(t.lineHeight ? { lineHeight: Math.round(t.size * t.lineHeight) } : {}),
    ...(t.tracking ? { letterSpacing: t.tracking } : {}),
  };
}

export const type = {
  fare: textStyle("fare"),
  fareSmall: textStyle("fareSmall"),
  title: textStyle("title"),
  titleSmall: textStyle("titleSmall"),
  heading: textStyle("heading"),
  plate: textStyle("plate"),
  body: textStyle("body"),
  bodyStrong: textStyle("bodyStrong"),
  bodyPlain: textStyle("bodyPlain"),
  secondary: textStyle("secondary"),
  secondaryStrong: textStyle("secondaryStrong"),
  label: textStyle("label"),
  button: textStyle("button"),
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

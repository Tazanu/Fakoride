/**
 * The Daylight design system, as code.
 *
 * tokens.json is the source of truth — this file only types it and adds the two
 * helpers every screen needs. Import from here in the apps and the ops console
 * so a colour is never retyped as a literal:
 *
 *   import { theme, font } from "../../design/tokens";
 *   <View style={{ backgroundColor: theme("light").card }} />
 *
 * Requires "resolveJsonModule": true in tsconfig (the api package already sets it).
 */

import tokens from "./tokens.json";

export type Scheme = "light" | "night";

export type Palette = {
  paper: string;
  card: string;
  ink: string;
  inkSoft: string;
  muted: string;
  line: string;
  lineStrong: string;
  action: string;
  actionPressed: string;
  actionTint: string;
  actionSurface: string;
  onAction: string;
  danger: string;
  dangerTint: string;
  onDanger: string;
  hill: string;
  fill: string;
};

/**
 * Light is the default and night is the exception, not a preference toggle:
 * this app is used outdoors near the equator, where light mode measurably
 * outreads dark. Switch on ambient light or time of day, not on taste.
 */
export function theme(scheme: Scheme = "light"): Palette {
  return tokens.color[scheme] as Palette;
}

/** Payment brand colours. Only ever for an MTN or Orange chip. */
export const brand = tokens.color.brand;

export const space = tokens.space;
export const radius = tokens.radius;
export const touch = tokens.touch;

/**
 * Font families.
 *
 * Both faces are bundled now — Archivo for anything read as a number or a
 * heading, Manrope for anything read as a sentence. The phone's own font is no
 * longer used for body text, so there is no per-platform stack to choose from.
 */
export const font = {
  ui: tokens.font.ui.family,
  uiWeb: tokens.font.ui.web,
  display: tokens.font.display.family,
  displayWeb: tokens.font.display.web,
};

export type TypeRole = Exclude<keyof typeof tokens.type, `$${string}`>;

/** One of the six sizes. Nothing in the product invents a seventh. */
export function type(role: TypeRole) {
  return tokens.type[role];
}

/** The floors that are never negotiable, kept here so a lint rule can read them. */
export const minimums = {
  bodySp: tokens.type.$floor.body,
  anyTextSp: tokens.type.$floor.any,
  touchDp: tokens.touch.min,
} as const;

export default tokens;

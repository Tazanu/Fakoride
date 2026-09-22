/**
 * The four surfaces this app is built from, and nothing else.
 *
 * The first version gave every row a border, a radius and a card background,
 * which is what made it read as cheap: fourteen identical bordered boxes down a
 * page is not hierarchy, it is wallpaper. Border, fill, radius and elevation
 * each say "separate object", and spending them on everything spends them on
 * nothing.
 *
 * So they are rationed here:
 *
 *   Surface   a plain grouped panel. Rows inside are divided by hairlines,
 *             not by gaps — one object containing several things, which is how
 *             a list of places actually reads.
 *   Raised    the one element on a screen that is genuinely lifted off it.
 *             At most one per screen, usually the fare.
 *   Field     a labelled block of text. No chrome at all — the label carries
 *             the structure, which is the Swiss move and costs nothing.
 *   Divider   a hairline. Full-bleed inside a Surface, inset where it separates
 *             rows that have leading icons.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { cardShadow, palette, radius, space, type } from "@/theme";

const c = palette("light");

/** A grouped panel. Its children are rows; it draws one border around all of them. */
export function Surface({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

/** The one thing on the screen that is lifted. Use it once. */
export function Raised({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.raised, style]}>{children}</View>;
}

/**
 * A labelled value, with no box around it.
 *
 * FROM / Mile 16 Motor Park. The uppercase label is the entire structure, and
 * a border around it would add nothing but ink.
 */
export function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, inset ? { marginLeft: inset } : null]} />;
}

/** A section heading. Uppercase, tracked, quiet — it orders the page, it is not content. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: c.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.line,
    overflow: "hidden",
  },
  raised: {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.lg,
    ...cardShadow,
  },
  field: { gap: 2 },
  fieldLabel: { ...type.label, color: c.muted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  sectionLabel: { ...type.label, color: c.muted, marginBottom: space.xs },
});

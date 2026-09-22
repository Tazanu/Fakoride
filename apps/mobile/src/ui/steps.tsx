/**
 * The three-step bar at the top of driver sign-up.
 *
 * Sign-up asks a man to hand over his ID, his papers and his face before he has
 * earned a franc. The bar exists to answer the only question he is really
 * asking — how much more of this is there — so it is at the top of every step,
 * always three segments, never a percentage.
 *
 * A back chevron sits beside it because a step you cannot leave is a trap, and
 * a driver who cannot go back to fix a typo in his plate abandons instead.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { CaretLeftIcon } from "@/ui/icons";
import { palette, radius, space, type } from "@/theme";

const c = palette("light");

export function Steps({
  step,
  total = 3,
  onBack,
}: {
  step: number;
  total?: number;
  /** Omitted on the last step: there is nothing to go back to once it is sent. */
  onBack?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <CaretLeftIcon size={24} color={c.ink} />
          </Pressable>
        ) : null}
        <Text style={styles.label}>
          Step {step} of {total}
        </Text>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: step }}
      >
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[styles.segment, i < step && styles.segmentDone]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  back: {
    width: 48,
    height: 48,
    marginLeft: -space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  pressed: { opacity: 0.6 },
  label: { ...type.secondaryStrong, fontSize: 14, color: c.muted },

  track: { flexDirection: "row", gap: 6 },
  segment: { flexGrow: 1, flexBasis: 0, height: 5, borderRadius: 3, backgroundColor: c.track },
  segmentDone: { backgroundColor: c.actionBright },
});

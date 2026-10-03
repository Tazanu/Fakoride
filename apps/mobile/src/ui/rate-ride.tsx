/**
 * "How was your ride?" — five stars, one tap.
 *
 * The server has accepted ratings since the trip flow was written, and every
 * trip screen shows the driver's stars. But nothing ever asked for one, so the
 * number riders were shown was the 5.0 every driver starts on — a figure that
 * looked like a reputation and was not one.
 *
 * One tap sends it: no comment box, no second screen. Somebody stepping out of
 * a taxi will tap a star; very few will write a paragraph. A ride is rated
 * once, and the screen remembers.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { trips } from "@/api/rider";
import { S } from "@/content/strings";
import { useT, type Phrase } from "@/ui/i18n";
import { StarIcon } from "@/ui/icons";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

export function RateRide({ tripId, rated }: { tripId: string; rated: number | null | undefined }) {
  const t = useT();
  const [stars, setStars] = useState<number | null>(rated ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Phrase | null>(null);

  async function rate(n: number) {
    setBusy(true);
    setError(null);
    setStars(n);
    try {
      await trips.rate(tripId, n);
    } catch (err) {
      // Rated already — from another phone, or a double tap. Either way it is done.
      if (err instanceof ApiError && err.code === "already_rated") return;
      setStars(null);
      setError(err instanceof ApiError && err.offline ? S.trip.offline : S.trip.didNotWork);
    } finally {
      setBusy(false);
    }
  }

  const done = stars !== null && !busy && !error;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t(done ? S.trip.rateThanks : S.trip.rateTitle)}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = stars !== null && n <= stars;
          return (
            <Pressable
              key={n}
              onPress={() => void rate(n)}
              disabled={busy || done}
              accessibilityRole="radio"
              accessibilityState={{ selected: stars === n, disabled: busy || done }}
              accessibilityLabel={t(S.trip.rateStars, { n })}
              hitSlop={4}
              style={styles.star}
            >
              <StarIcon size={34} color={on ? c.amber : c.controlEdge} weight={on ? "fill" : "regular"} />
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{t(error)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    alignItems: "center",
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  title: { ...type.bodyStrong, color: c.ink, textAlign: "center" },
  row: { flexDirection: "row", gap: space.xs },
  star: { minWidth: touch.min, minHeight: touch.min, alignItems: "center", justifyContent: "center" },
  error: { ...type.secondary, color: c.danger },
});

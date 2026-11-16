/**
 * The way back to a ride that is still going on.
 *
 * A ride lives on the server; the screen for it lived only in the app's
 * navigation. So anything that restarted the app in the middle of one — a phone
 * call, a dead battery, Android reclaiming memory on a cheap handset — brought
 * it back up on the home screen with no trace of the ride. A rider could not see
 * her driver or her PIN and could not book again; a driver had a passenger in
 * the car and nowhere to press FINISH.
 *
 * Each home screen now asks the server, every time it comes into view, whether
 * this account is in the middle of a ride. If it is:
 *
 *   - the first time the app sees that ride, it goes straight to it, which is
 *     what somebody reopening the app mid-ride wants; and
 *   - a card stays on the home screen for as long as the ride runs, so that
 *     pressing back from the ride is not a second way to lose it.
 *
 * "The first time" is remembered for the life of the app, not of the screen:
 * going back to the home screen on purpose must not bounce him forward again.
 */

import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { liveTrips, type LiveTrip } from "@/api/session";
import { S } from "@/content/strings";
import { useT } from "@/ui/i18n";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

/** Rides this run of the app has already been taken to once. */
const opened = new Set<string>();

export function LiveRide({ side }: { side: "rider" | "driver" }) {
  const router = useRouter();
  const t = useT();
  const [trip, setTrip] = useState<LiveTrip | null>(null);

  const open = useCallback(
    (id: string) => {
      if (side === "driver") router.push({ pathname: "/(driver)/job/[id]", params: { id } });
      else router.push({ pathname: "/(rider)/trip/[id]", params: { id } });
    },
    [router, side],
  );

  useFocusEffect(
    useCallback(() => {
      let gone = false;
      void liveTrips
        .current()
        .then((now) => {
          if (gone) return;
          const mine = side === "driver" ? now.driving : now.riding;
          setTrip(mine);
          if (mine && !opened.has(mine.id)) {
            opened.add(mine.id);
            open(mine.id);
          }
        })
        // Offline, or an older server without this route. The home screen is
        // exactly as it was before; the next time it comes into view asks again.
        .catch(() => undefined);
      return () => {
        gone = true;
      };
    }, [side, open]),
  );

  if (!trip) return null;

  return (
    <Pressable
      onPress={() => open(trip.id)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.words}>
        <Text style={styles.title}>{t(side === "driver" ? S.live.driving : S.live.riding)}</Text>
        <Text style={styles.sub}>{t(S.live.tapToOpen)}</Text>
      </View>
      <Text style={styles.go}>{t(S.live.open)}</Text>
    </Pressable>
  );
}

/** Tell the card a ride was opened by other means, so it does not open it again. */
export function rememberOpened(tripId: string): void {
  opened.add(tripId);
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch.min,
    borderRadius: radius.md,
    backgroundColor: c.action,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  pressed: { opacity: 0.8 },
  words: { flex: 1, gap: 2 },
  title: { ...type.bodyStrong, color: c.onAction },
  sub: { ...type.secondary, color: c.onAction, opacity: 0.85 },
  go: { ...type.bodyStrong, color: c.onAction },
});

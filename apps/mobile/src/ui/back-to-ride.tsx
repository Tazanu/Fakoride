/**
 * The way back to a ride that is still happening.
 *
 * The app only knew a ride was running while that ride's screen was open.
 * Close the app on the way to Molyko — or let Android close it, which it does
 * to a backgrounded app on a cheap phone within minutes — and opening it again
 * landed on the home screen with no way back: the taxi still coming, the PIN
 * out of reach, Get help gone. Trying to book again only said "you already
 * have a ride running".
 *
 * So both home screens ask the server, every time they come into view and
 * every time the app comes back to the front. The first time in a session that
 * the answer is a ride, the app goes straight to it; after that — once she has
 * chosen to come back to the home screen — it stays put and shows a banner.
 */

import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CaretRightIcon } from "@/ui/icons";
import { rides, type CurrentRide } from "@/api/session";
import { S } from "@/content/strings";
import { useT } from "@/ui/i18n";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

/**
 * Which ride this session has already opened by itself, if any.
 *
 * Once per app session: the cold start that should land on the ride itself.
 * Shared with the notification handler, which opens a ride too when one is
 * tapped — without this, tapping "your taxi is outside" on a cold start would
 * open the same ride twice, one screen on top of the other.
 */
let openedOnItsOwn: string | null | undefined;

/** For a tapped notification: false when that ride is already open. */
export function openingRide(tripId: string): boolean {
  if (openedOnItsOwn === tripId) return false;
  openedOnItsOwn = tripId;
  return true;
}

export function BackToRide({ side }: { side: "rider" | "driver" }) {
  const router = useRouter();
  const t = useT();
  const [ride, setRide] = useState<CurrentRide | null>(null);

  const open = useCallback(
    (id: string) => {
      if (side === "driver") router.push({ pathname: "/(driver)/job/[id]", params: { id } });
      else router.push({ pathname: "/(rider)/trip/[id]", params: { id } });
    },
    [router, side],
  );

  const check = useCallback(async () => {
    try {
      const { trip } = await rides.current();
      setRide(trip);
      if (trip && openedOnItsOwn === undefined) {
        openedOnItsOwn = trip.id;
        open(trip.id);
      }
    } catch {
      // Offline: the banner stays as it was. Nothing here is worth an error.
    }
  }, [open]);

  useFocusEffect(
    useCallback(() => {
      void check();
    }, [check]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void check();
    });
    return () => sub.remove();
  }, [check]);

  if (!ride) return null;

  return (
    <Pressable
      onPress={() => open(ride.id)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <View style={styles.words}>
        <Text style={styles.title}>{t(side === "driver" ? S.resume.driver : S.resume.rider)}</Text>
        <Text style={styles.why} numberOfLines={2}>
          {t(S.resume.why, { from: ride.pickupLabel, to: ride.dropLabel })}
        </Text>
      </View>
      <CaretRightIcon size={22} color={c.onAction} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch.min,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: c.action,
  },
  pressed: { backgroundColor: c.actionPressed },
  words: { flexGrow: 1, flexShrink: 1, gap: 2 },
  title: { ...type.bodyStrong, color: c.onAction },
  why: { ...type.secondary, color: c.onActionSoft },
});

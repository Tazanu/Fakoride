/**
 * A ride, offered.
 *
 * The hardest screen in the app to get right, because of where it is read: one
 * hand, engine running, sun on the glass, twelve seconds. Everything here
 * follows from that.
 *
 *   the fare is the biggest thing on it — it is the only number he decides on
 *   two controls, far apart, so a thumb cannot take the wrong one
 *   the bar drains rather than counting down, because a shrinking bar is read
 *     at a glance and "7" has to be converted
 *   declining is not a failure and is not styled as one; the server passes the
 *     ride straight to the next rider and nobody is penalised
 */

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ApiError } from "@/api/client";
import { trips, type TripOffer } from "@/api/driver";
import { palette, radius, space, touch, type, xaf } from "@/theme";
import { useRealtime } from "./RealtimeProvider";

const c = palette("light");

/** How the rider is paying, in the words the driver uses about it. */
const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash in your hand",
  MOMO: "MTN MoMo",
  ORANGE_MONEY: "Orange Money",
};

/** Metres, said the way a person says them. */
function walkAway(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m away`;
  return `${(metres / 1000).toFixed(1)} km away`;
}

export function OfferSheet() {
  const { offer, clearOffer } = useRealtime();
  if (!offer) return null;
  // Keyed so a second offer arriving resets the clock and the busy state rather
  // than inheriting the last one's.
  return <Offer key={offer.tripId} offer={offer} onDone={clearOffer} />;
}

function Offer({ offer, onDone }: { offer: TripOffer; onDone: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drain = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(drain, {
      toValue: 0,
      duration: offer.expiresInSeconds * 1000,
      easing: Easing.linear,
      // Width cannot run on the UI thread, and this is one bar on one screen.
      useNativeDriver: false,
    }).start();
  }, [drain, offer.expiresInSeconds]);

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      await trips.accept(offer.tripId);
      onDone();
      router.push({ pathname: "/(app)/trip/[id]", params: { id: offer.tripId } });
    } catch (err) {
      // Somebody else took it, or it expired while he was deciding. Neither is
      // his fault and neither is worth a dialog — the offer just goes.
      if (err instanceof ApiError && (err.code === "already_taken" || err.code === "offer_expired")) {
        onDone();
        return;
      }
      setError(err instanceof ApiError && err.offline ? "No network." : "That did not work.");
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    // Deliberately not awaited for the UI: he has already moved on, and the
    // server passes the ride to the next driver whether or not we hear back.
    void trips.decline(offer.tripId).catch(() => undefined);
    onDone();
  }

  const width = drain.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View
      style={[styles.scrim, { paddingBottom: insets.bottom + space.lg }]}
      accessibilityViewIsModal
      accessibilityLiveRegion="assertive"
      // The scrim swallows taps. Dismissing by tapping outside would be a way
      // to lose a ride by brushing the screen with a thumb.
      pointerEvents="auto"
    >
      <View style={styles.sheet}>
        <View style={styles.clockTrack}>
          <Animated.View style={[styles.clockFill, { width }]} />
        </View>

        <View style={styles.body}>
          <View style={styles.fareRow}>
            <Text style={styles.fare}>{xaf(offer.priceXaf)}</Text>
            <Text style={styles.fareUnit}>FCFA</Text>
          </View>
          <Text style={styles.payment}>{PAYMENT_LABEL[offer.paymentMethod] ?? offer.paymentMethod}</Text>

          <View style={styles.leg}>
            <Text style={styles.legLabel}>PICK UP</Text>
            <Text style={styles.legPlace} numberOfLines={2}>
              {offer.pickupLabel}
            </Text>
            <Text style={styles.legDistance}>{walkAway(offer.pickupDistanceM)}</Text>
          </View>

          <View style={styles.leg}>
            <Text style={styles.legLabel}>DROP</Text>
            <Text style={styles.legPlace} numberOfLines={2}>
              {offer.dropLabel}
            </Text>
          </View>

          {offer.needsHelmet ? <Text style={styles.helmet}>She needs your spare helmet</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={decline}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Leave this ride"
            style={({ pressed }) => [styles.decline, pressed && styles.pressed]}
          >
            <Text style={styles.declineLabel}>LEAVE IT</Text>
          </Pressable>

          <Pressable
            onPress={accept}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`Take this ride for ${offer.priceXaf} francs`}
            style={({ pressed }) => [styles.accept, pressed && styles.pressed, busy !== null && styles.dimmed]}
          >
            {busy === "accept" ? (
              <ActivityIndicator color={c.onAction} />
            ) : (
              <Text style={styles.acceptLabel}>TAKE IT</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.scrim,
    justifyContent: "flex-end",
    paddingHorizontal: space.md,
  },
  sheet: { backgroundColor: c.card, borderRadius: radius.lg, overflow: "hidden" },

  clockTrack: { height: 6, backgroundColor: c.fill },
  clockFill: { height: 6, backgroundColor: c.action },

  body: { padding: space.lg, gap: space.sm },

  fareRow: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  fare: { ...type.fare, color: c.ink },
  fareUnit: { ...type.heading, color: c.muted },
  payment: { ...type.body, color: c.inkSoft },

  leg: { marginTop: space.sm },
  legLabel: { ...type.label, color: c.muted },
  legPlace: { ...type.body, color: c.ink },
  legDistance: { ...type.secondary, color: c.action },

  helmet: { ...type.secondary, color: c.hill, marginTop: space.sm },
  error: { ...type.secondary, color: c.danger, marginTop: space.sm },

  actions: { flexDirection: "row", gap: space.sm, padding: space.md, paddingTop: 0 },
  decline: {
    flex: 1,
    minHeight: touch.secondaryButtonMinHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  declineLabel: { ...type.heading, color: c.muted },
  accept: {
    flex: 2,
    minHeight: touch.primaryButtonMinHeight,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptLabel: { ...type.heading, color: c.onAction, letterSpacing: 0.5 },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.7 },
});

/**
 * Her ride, while it happens.
 *
 * Built from the RideTracking artboard: the map on top with the driver dotted
 * towards her, a status pill floating over it, and a sheet holding who is
 * coming, what he drives, and what she will pay.
 *
 * The states she actually experiences:
 *
 *   REQUESTED/OFFERED  looking — nothing to do but wait
 *   ACCEPTED           somebody is coming, and here is who
 *   ARRIVED            he is outside; the PIN becomes the whole screen
 *   IN_PROGRESS        moving
 *   COMPLETED          what it cost
 *   NO_DRIVER_FOUND    nobody took it — said plainly, with a way out
 *
 * The PIN is not in the artboard and is kept anyway, because it is the safety
 * design: she reads it, he types it. A driver who could see it could start a
 * trip with somebody who never got in. At ARRIVED it takes the top of the sheet
 * and everything else waits.
 *
 * The socket says *that* something changed; this screen then re-reads the trip
 * from the API. One source of truth, and the socket is not it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share as RNShare,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PhoneCallIcon, SealCheckIcon, ShareNetworkIcon, StarIcon, WarningIcon } from "@/ui/icons";
import { ApiError, apiBaseUrl } from "@/api/client";
import { share, trips, type PaymentMethod, type TripDetail } from "@/api/rider";
import { useRealtime } from "@/realtime/RealtimeProvider";
import { findMe } from "@/ui/position";
import { MapPanel, MapPill, Sheet } from "@/ui/map";
import { palette, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

const MAP_HEIGHT = 330;

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  MOMO: "MTN MoMo",
  ORANGE_MONEY: "Orange Money",
};

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "That did not work. Try again.";
  switch (err.code) {
    case "offline":
      return "No network. Try again in a moment.";
    case "trip_over":
      return "That ride has already finished.";
    case "not_yours":
      return "That ride is not yours.";
    default:
      return "That did not work. Try again.";
  }
}

/** The line in the pill over the map. */
function stageLine(status: TripDetail["status"]): string {
  switch (status) {
    case "REQUESTED":
    case "OFFERED":
      return "Looking for a taxi";
    case "ACCEPTED":
      return "Your taxi is on the way";
    case "ARRIVED":
      return "Your taxi is outside";
    case "IN_PROGRESS":
      return "On the way";
    case "COMPLETED":
      return "You have arrived";
    case "NO_DRIVER_FOUND":
      return "Nobody took this one";
    case "CANCELLED_BY_DRIVER":
      return "He dropped the ride";
    default:
      return "This ride is over";
  }
}

/** Two letters for the avatar. "Epie Ndive" becomes EN. */
function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function Trip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { version, last, watch } = useRealtime();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setTrip(await trips.get(id));
      setError(null);
    } catch (err) {
      setError(errorFor(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Join the trip room so the driver's position starts arriving.
  useEffect(() => {
    if (id) watch(id);
  }, [id, watch]);

  /**
   * Re-read when the socket says something moved.
   *
   * Only for this trip: she could have an old trip's screen in the back stack,
   * and re-reading that one on somebody else's event is wasted data.
   */
  useEffect(() => {
    if (version === 0 || !id) return;
    if (last && last.tripId !== id) return;
    void load();
  }, [version, last, id, load]);

  /**
   * A slow poll, and only while nobody has taken it.
   *
   * The socket is the real channel. This exists because "nobody came" is the
   * one outcome where a dropped socket and a silent screen look identical, and
   * she is standing at a junction deciding whether to give up on us.
   */
  const searching = trip?.status === "REQUESTED" || trip?.status === "OFFERED";
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!searching) return;
    poll.current = setInterval(() => void load(), 10_000);
    return () => {
      if (poll.current) clearInterval(poll.current);
      poll.current = null;
    };
  }, [searching, load]);

  function confirmCancel() {
    if (!id) return;
    Alert.alert("Cancel this ride?", "He may already be on his way to you.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel it",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void trips
            .cancel(id, "rider_changed_mind")
            .then(() => router.replace("/(app)"))
            .catch((err) => setError(errorFor(err)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  /**
   * Let somebody watch.
   *
   * The link is short-lived by design — six hours, half an hour of grace after
   * the ride. A share link that outlives the trip is a tracker, and the person
   * she sent it to did not agree to be one.
   */
  async function shareTrip() {
    if (!id) return;
    setSharing(true);
    try {
      const created = await share.create(id);
      await RNShare.share({ message: `Follow my Fako Ride: ${apiBaseUrl()}${created.path}` });
    } catch (err) {
      if (err instanceof ApiError) setError(errorFor(err));
    } finally {
      setSharing(false);
    }
  }

  function getHelp() {
    if (!id) return;
    void (async () => {
      // Whatever the phone can give, immediately. The alert goes either way —
      // ops has the trip, which has a route — but "where" is the whole
      // question and waiting on a satellite lock to ask it is indefensible.
      const fix = await findMe();
      const where = fix ? { lat: fix.lat, lng: fix.lng } : {};
      try {
        await trips.sos(id, { ...where, note: "rider pressed get help" });
        Alert.alert("Help is coming", "Ops have your location and are calling you.");
      } catch {
        Alert.alert("Could not send", "Call 117 if you are in danger.");
      }
    })();
  }

  if (!trip) {
    return (
      <View style={styles.centre}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={c.action} />}
      </View>
    );
  }

  const over =
    trip.status === "COMPLETED" ||
    trip.status === "NO_DRIVER_FOUND" ||
    trip.status === "CANCELLED_BY_RIDER" ||
    trip.status === "CANCELLED_BY_DRIVER";
  const driver = trip.driver;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
    >
      <MapPanel
        height={MAP_HEIGHT}
        here={{ x: 0.5, y: 0.44 }}
        driver={driver && !over ? { x: 0.3, y: 0.74 } : undefined}
      >
        <View style={[styles.pillWrap, { top: insets.top + space.sm }]}>
          <MapPill style={styles.pill}>
            {searching ? <ActivityIndicator size="small" color={c.actionText} /> : null}
            <Text style={styles.pillText}>{stageLine(trip.status)}</Text>
          </MapPill>
        </View>
      </MapPanel>

      <Sheet handle={false} style={styles.sheet}>
        {/* The PIN takes the top of the sheet the moment he is outside. */}
        {trip.status === "ARRIVED" && trip.pin ? (
          <View style={styles.pinCard}>
            <Text style={styles.pinLabel}>TELL HIM THIS NUMBER</Text>
            <Text style={styles.pin}>{trip.pin}</Text>
            <Text style={styles.pinWarn}>Do not get in before he says it back.</Text>
          </View>
        ) : null}

        {searching ? (
          <Text style={styles.waiting}>Usually under 4 minutes on this road.</Text>
        ) : null}

        {trip.status === "NO_DRIVER_FOUND" ? (
          <Text style={styles.waiting}>
            No taxi took this one. Nothing has been charged. Try again, or walk to the junction.
          </Text>
        ) : null}

        {driver ? (
          <View style={styles.driverRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(driver.name)}</Text>
            </View>
            <View style={styles.grow}>
              <View style={styles.nameRow}>
                <Text style={styles.driverName} numberOfLines={1}>
                  {driver.name ?? "Your driver"}
                </Text>
                {driver.verified ? <SealCheckIcon size={18} color={c.actionBright} weight="fill" /> : null}
              </View>
              <View style={styles.ratingRow}>
                <StarIcon size={15} color={c.amber} weight="fill" />
                <Text style={styles.rating}>{driver.rating.toFixed(1)}</Text>
                <Text style={styles.rides}>
                  · {driver.tripCount} {driver.tripCount === 1 ? "ride" : "rides"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => void Linking.openURL(`tel:${driver.phone}`)}
              accessibilityRole="button"
              accessibilityLabel="Call your driver"
              style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
            >
              <PhoneCallIcon size={22} color={c.onAction} />
            </Pressable>
          </View>
        ) : null}

        {driver ? (
          <View style={styles.plateRow}>
            <Text style={styles.plateLabel}>Plate number</Text>
            <Text style={styles.plate}>{driver.plate}</Text>
          </View>
        ) : null}

        <View style={styles.payRow}>
          <View>
            <Text style={styles.payLabel}>
              {trip.status === "COMPLETED" ? "You paid" : "You pay on arrival"}
            </Text>
            <Text style={styles.payAmount}>{xaf(trip.priceXaf)} FCFA</Text>
          </View>
          <View style={styles.payChip}>
            <Text style={styles.payChipText}>{PAYMENT_LABEL[trip.paymentMethod]}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.spacer} />

        {over ? (
          <Pressable
            onPress={() => router.replace("/(app)")}
            accessibilityRole="button"
            accessibilityLabel={trip.status === "COMPLETED" ? "Done" : "Book another"}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaLabel}>
              {trip.status === "COMPLETED" ? "Done" : "Book another"}
            </Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.actions}>
              <Pressable
                onPress={shareTrip}
                disabled={sharing}
                accessibilityRole="button"
                accessibilityLabel="Share this trip"
                style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              >
                <ShareNetworkIcon size={18} color={c.inkSoft} />
                <Text style={styles.ghostLabel}>{sharing ? "Making a link…" : "Share trip"}</Text>
              </Pressable>
              <Pressable
                onPress={confirmCancel}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Cancel this ride"
                style={({ pressed }) => [styles.ghost, styles.ghostDanger, pressed && styles.pressed]}
              >
                <Text style={styles.ghostDangerLabel}>Cancel ride</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={getHelp}
              accessibilityRole="button"
              accessibilityLabel="Get help"
              style={({ pressed }) => [styles.help, pressed && styles.pressed]}
            >
              <WarningIcon size={18} color={c.danger} />
              <Text style={styles.helpLabel}>Get help</Text>
            </Pressable>
          </>
        )}
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.paper, padding: space.lg },
  grow: { flexGrow: 1, flexShrink: 1 },
  pressed: { opacity: 0.7 },
  sheet: { gap: space.md },

  pillWrap: { position: "absolute", left: space.lg, right: space.lg, alignItems: "center" },
  pill: { minHeight: 44, borderRadius: radius.chip },
  pillText: { ...type.secondaryStrong, color: c.actionText },

  pinCard: {
    alignItems: "center",
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.actionTint,
    borderWidth: 1,
    borderColor: c.actionTintEdge,
  },
  pinLabel: { ...type.label, color: c.actionText },
  /* Read out loud across a pavement at night: the largest type in the system. */
  pin: { ...type.fare, color: c.ink, letterSpacing: 10 },
  pinWarn: { ...type.secondary, color: c.inkSoft, textAlign: "center" },

  waiting: { ...type.bodyPlain, color: c.inkSoft },

  driverRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...type.heading, color: c.onAction },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  driverName: { ...type.heading, color: c.ink, flexShrink: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: 2 },
  rating: { ...type.secondaryStrong, color: c.inkSoft },
  rides: { ...type.secondary, color: c.muted },
  callButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },

  plateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.edge,
  },
  plateLabel: { ...type.secondary, color: c.muted },
  plate: { ...type.plate, color: c.ink },

  payRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: c.actionTint,
    borderWidth: 1,
    borderColor: c.actionTintEdge,
  },
  payLabel: { ...type.secondary, color: c.inkSoft },
  payAmount: { ...type.fareSmall, color: c.action, marginTop: 2 },
  payChip: {
    paddingHorizontal: space.md,
    height: 32,
    justifyContent: "center",
    borderRadius: radius.chip,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.actionTintEdge,
  },
  payChipText: { ...type.secondaryStrong, color: c.actionText },

  error: { ...type.secondary, color: c.danger },
  spacer: { flexGrow: 1, minHeight: space.lg },

  actions: { flexDirection: "row", gap: space.sm },
  ghost: {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: touch.secondaryButtonMinHeight,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
  },
  ghostLabel: { ...type.bodyStrong, color: c.inkSoft },
  ghostDanger: { borderColor: c.dangerEdge },
  ghostDangerLabel: { ...type.bodyStrong, color: c.danger },

  help: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: touch.min,
    marginTop: space.sm,
  },
  helpLabel: { ...type.bodyStrong, color: c.danger },

  cta: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { backgroundColor: c.actionPressed },
  ctaLabel: { ...type.button, color: c.onAction },
});

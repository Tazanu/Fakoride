/**
 * A trip, from accepted to paid.
 *
 * One screen for four states, because a driver mid-shift should never wonder
 * which screen he is on — the page is always "the ride I am doing" and only its
 * one button changes:
 *
 *   ACCEPTED     I AM HERE       he has reached her
 *   ARRIVED      the PIN gate    she reads four digits, he types them
 *   IN_PROGRESS  FINISH RIDE     he has dropped her
 *   COMPLETED    the fare, and how it is being paid
 *
 * The PIN is the whole safety design and it only works in this direction: the
 * rider holds it, the driver asks for it. He never sees it, which is why
 * TripDetail types `pin` as `undefined` — the API does not send it to him and
 * the compiler will not let a screen render it by accident.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { ApiError } from "@/api/client";
import { trips, type PaymentMethod, type TripDetail } from "@/api/driver";
import { useDriverRealtime } from "@/realtime/DriverRealtime";
import { pushPosition } from "@/realtime/socket";
import { cardShadow, palette, primaryButton, radius, space, touch, type, xaf } from "@/theme";
import { keyboardBehavior, useScrollPastKeyboard } from "@/ui/keyboard";

const c = palette("light");

/** How often his position goes up while he is carrying someone. */
const POSITION_INTERVAL_MS = 10_000;

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: "She pays you cash",
  MOMO: "Paid by MTN MoMo",
  ORANGE_MONEY: "Paid by Orange Money",
};

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "That did not work. Try again.";
  switch (err.code) {
    case "offline":
      return "No network. Try again in a moment.";
    case "wrong_pin":
      return "That is not the number she has. Ask her to read it again.";
    case "bad_state":
      return "This ride has moved on. Pull down to refresh.";
    default:
      return "That did not work. Try again.";
  }
}

/** The one line at the top that says where in the ride he is. */
function stageLine(status: TripDetail["status"]): string {
  switch (status) {
    case "ACCEPTED":
      return "Go and get her";
    case "ARRIVED":
      return "You are there";
    case "IN_PROGRESS":
      return "Carrying her now";
    case "COMPLETED":
      return "Ride finished";
    default:
      return "This ride is over";
  }
}

export default function Trip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cancelledTripId, acknowledgeCancellation } = useDriverRealtime();
  // The PIN gate puts a keypad over the bottom half of this screen.
  const scroll = useScrollPastKeyboard();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  /**
   * She cancelled.
   *
   * Told plainly and then out — leaving him on a dead trip screen is how a
   * driver ends up waiting at a junction for somebody who is not coming.
   */
  useEffect(() => {
    if (!id || cancelledTripId !== id) return;
    acknowledgeCancellation();
    Alert.alert("She cancelled", "The rider called this ride off.", [
      { text: "OK", onPress: () => router.replace("/(driver)") },
    ]);
  }, [cancelledTripId, id, acknowledgeCancellation, router]);

  /**
   * His position, while it matters.
   *
   * Only between accepting and finishing: this is what draws the taxi moving on
   * her phone and on the share link her mother is watching. It stops the moment
   * the ride ends, because after that it is only costing him data.
   */
  const status = trip?.status;
  const live = status === "ACCEPTED" || status === "ARRIVED" || status === "IN_PROGRESS";
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!live) return;
    let stopped = false;

    const send = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!stopped) pushPosition(pos.coords.latitude, pos.coords.longitude);
      } catch {
        // No fix right now. Normal under the trees on the Molyko road, and not
        // worth telling him about — the next tick will get one.
      }
    };

    void send();
    timer.current = setInterval(send, POSITION_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [live]);

  async function step(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function startRide() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await trips.start(id, pin);
      setPin("");
      await load();
    } catch (err) {
      setError(errorFor(err));
      // A wrong PIN clears the field. Re-reading four digits is quicker than
      // hunting for the one he mistyped.
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    if (!id) return;
    Alert.alert("Drop this ride?", "She is waiting for you. Only do this if you truly cannot reach her.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Drop it",
        style: "destructive",
        onPress: () =>
          void step(async () => {
            await trips.cancel(id, "driver_cannot_reach");
            router.replace("/(driver)");
          }),
      },
    ]);
  }

  function getHelp() {
    if (!id) return;
    void trips
      .sos(id, { note: "driver pressed get help" })
      .then(() => Alert.alert("Help is coming", "Ops have your location and are calling you."))
      .catch(() => Alert.alert("Could not send", "Call 117 if you are in danger."));
  }

  if (!trip) {
    return (
      <View style={styles.centre}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={c.action} />}
      </View>
    );
  }

  const done = trip.status === "COMPLETED";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={keyboardBehavior}>
      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.stage}>{stageLine(trip.status)}</Text>

        <View style={styles.fareCard}>
          <View style={styles.fareRow}>
            <Text style={styles.fare}>{xaf(trip.priceXaf)}</Text>
            <Text style={styles.fareUnit}>FCFA</Text>
          </View>
          <Text style={styles.payment}>{PAYMENT_LABEL[trip.paymentMethod]}</Text>
        </View>

        <View style={styles.legs}>
          <Leg label="PICK UP" place={trip.pickupLabel} zone={trip.from.name} />
          <Leg label="DROP" place={trip.dropLabel} zone={trip.to.name} />
        </View>

        {trip.needsHelmet && !done ? <Text style={styles.helmet}>Give her your spare helmet</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {trip.status === "ACCEPTED" ? (
          <Primary label="I AM HERE" busy={busy} onPress={() => void step(() => trips.arrived(trip.id))} />
        ) : null}

        {trip.status === "ARRIVED" ? (
          <View style={styles.pinBlock}>
            <Text style={styles.pinTitle}>Ask her for her number</Text>
            <Text style={styles.pinHelp}>
              She has four digits on her phone. Do not start until she reads them to you.
            </Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              editable={!busy}
              accessibilityLabel="Her four digit number"
              maxLength={4}
            />
            <Primary label="START THE RIDE" busy={busy} disabled={pin.length !== 4} onPress={() => void startRide()} />
          </View>
        ) : null}

        {trip.status === "IN_PROGRESS" ? (
          <Primary label="FINISH RIDE" busy={busy} onPress={() => void step(() => trips.complete(trip.id))} />
        ) : null}

        {done ? (
          <View style={styles.doneBlock}>
            <Text style={styles.doneText}>
              {trip.paymentMethod === "CASH"
                ? "Take the fare in cash. It is yours — we take nothing from it."
                : "Paid by phone. It lands in your balance."}
            </Text>
            <Primary label="DONE" busy={false} onPress={() => router.replace("/(driver)")} />
          </View>
        ) : null}

        {!done ? (
          <>
            <View style={styles.minorActions}>
              <Pressable onPress={() => void Linking.openURL("tel:")} accessibilityRole="button" style={styles.minor}>
                <Text style={styles.minorLabel}>Call her</Text>
              </Pressable>
              <Pressable onPress={confirmCancel} accessibilityRole="button" style={styles.minor}>
                <Text style={[styles.minorLabel, styles.minorDanger]}>Drop this ride</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={getHelp}
              accessibilityRole="button"
              accessibilityLabel="Get help"
              style={styles.sos}
            >
              <Text style={styles.sosLabel}>GET HELP</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * One end of the trip.
 *
 * The zone line is dropped when it only repeats the place. A landmark often
 * carries its zone's name — Checkpoint sits in Checkpoint, the University of
 * Buea is its own zone — and "Checkpoint / Checkpoint" reads as a bug to the
 * person holding the phone, not as extra detail.
 */
function Leg({ label, place, zone }: { label: string; place: string; zone: string }) {
  const zoneAddsSomething = zone.trim().toLowerCase() !== place.trim().toLowerCase();
  return (
    <View style={styles.leg}>
      <Text style={styles.legLabel}>{label}</Text>
      <Text style={styles.legPlace}>{place}</Text>
      {zoneAddsSomething ? <Text style={styles.legZone}>{zone}</Text> : null}
    </View>
  );
}

function Primary({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.primaryPressed,
        (busy || disabled) && styles.primaryDisabled,
      ]}
    >
      {busy ? <ActivityIndicator color={c.onAction} /> : <Text style={styles.primaryLabel}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.paper, padding: space.lg },
  page: { paddingHorizontal: space.lg, gap: space.md },

  stage: { ...type.title, color: c.ink },

  fareCard: {
    backgroundColor: c.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.lg,
    ...cardShadow,
  },
  fareRow: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  fare: { ...type.fare, color: c.ink },
  fareUnit: { ...type.heading, color: c.muted },
  payment: { ...type.body, color: c.inkSoft, marginTop: space.xs },

  legs: { gap: space.md },
  leg: { gap: 2 },
  legLabel: { ...type.label, color: c.muted },
  legPlace: { ...type.body, color: c.ink },
  legZone: { ...type.secondary, color: c.muted },

  helmet: { ...type.secondary, color: c.hill },
  error: { ...type.secondary, color: c.danger },

  pinBlock: { gap: space.sm },
  pinTitle: { ...type.heading, color: c.ink },
  pinHelp: { ...type.bodyPlain, color: c.inkSoft },
  pinInput: {
    ...type.fareSmall,
    color: c.ink,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: touch.min,
    letterSpacing: 8,
    textAlign: "center",
  },

  primary: { ...primaryButton, backgroundColor: c.action },
  primaryPressed: { backgroundColor: c.actionPressed },
  primaryDisabled: { opacity: 0.45 },
  primaryLabel: { ...type.heading, color: c.onAction, letterSpacing: 0.5 },

  doneBlock: { gap: space.md },
  doneText: { ...type.bodyPlain, color: c.inkSoft },

  minorActions: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  minor: { flex: 1, minHeight: touch.min, alignItems: "center", justifyContent: "center" },
  minorLabel: { ...type.body, color: c.action },
  minorDanger: { color: c.muted },

  sos: {
    minHeight: touch.secondaryButtonMinHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.danger,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.lg,
  },
  sosLabel: { ...type.heading, color: c.danger, letterSpacing: 0.5 },
});

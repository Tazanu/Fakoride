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
import { S } from "@/content/strings";
import { Face, useTripFace } from "@/ui/trip-face";
import { useT, type Phrase } from "@/ui/i18n";
import { keyboardBehavior, useScrollPastKeyboard } from "@/ui/keyboard";

const c = palette("light");

/** How often his position goes up while he is carrying someone. */
const POSITION_INTERVAL_MS = 10_000;

const PAYMENT_LABEL: Record<PaymentMethod, Phrase> = {
  CASH: S.job.paysCash,
  MOMO: S.job.paidMomo,
  ORANGE_MONEY: S.job.paidOrange,
};

function errorFor(err: unknown): Phrase {
  if (!(err instanceof ApiError)) return S.driver.didNotWorkTryAgain;
  switch (err.code) {
    case "offline":
      return S.driver.offlineMoment;
    case "wrong_pin":
      return S.job.wrongPin;
    // The API's word for "somebody already moved this trip on". This read
    // "bad_state" for a long time, so the message never once appeared.
    case "wrong_state":
      return S.job.movedOn;
    default:
      return S.driver.didNotWorkTryAgain;
  }
}

/** The one line at the top that says where in the ride he is. */
function stageLine(status: TripDetail["status"]): Phrase {
  switch (status) {
    case "ACCEPTED":
      return S.job.goGetHer;
    case "ARRIVED":
      return S.job.youAreThere;
    case "IN_PROGRESS":
      return S.job.carryingHer;
    case "COMPLETED":
      return S.job.finished;
    default:
      return S.job.over;
  }
}

export default function Trip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { cancelledTripId, acknowledgeCancellation } = useDriverRealtime();
  // The PIN gate puts a keypad over the bottom half of this screen.
  const scroll = useScrollPastKeyboard();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Phrase | null>(null);
  // Her face, while he is on his way and while he waits — the moment he is
  // looking for one person in a crowd at a junction.
  const riderFace = useTripFace(
    trip?.id,
    Boolean(trip?.rider?.hasPhoto) && (trip?.status === "ACCEPTED" || trip?.status === "ARRIVED"),
  );

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
    Alert.alert(t(S.job.sheCancelled), t(S.job.sheCancelledWhy), [
      { text: t(S.job.ok), onPress: () => router.replace("/(driver)") },
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
      // A second tap that lost the race: show where the trip actually is now.
      if (err instanceof ApiError && err.code === "wrong_state") await load();
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
    Alert.alert(t(S.job.dropAsk), t(S.job.dropWhy), [
      { text: t(S.job.keepIt), style: "cancel" },
      {
        text: t(S.job.dropIt),
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
      .then((raised) =>
        Alert.alert(
          t(S.trip.helpComing),
          raised.contactsTold > 0 ? `${t(S.trip.helpCominWhy)}\n\n${t(S.contacts.texted)}` : t(S.trip.helpCominWhy),
        ),
      )
      .catch(() => Alert.alert(t(S.trip.helpFailed), t(S.trip.callPolice)));
  }

  if (!trip) {
    return (
      <View style={styles.centre}>
        {error ? <Text style={styles.error}>{t(error)}</Text> : <ActivityIndicator color={c.action} />}
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
        <Text style={styles.stage}>{t(stageLine(trip.status))}</Text>

        <View style={styles.fareCard}>
          <View style={styles.fareRow}>
            <Text style={styles.fare}>{xaf(trip.priceXaf)}</Text>
            <Text style={styles.fareUnit}>FCFA</Text>
          </View>
          <Text style={styles.payment}>{t(PAYMENT_LABEL[trip.paymentMethod])}</Text>
        </View>

        {trip.rider && (trip.status === "ACCEPTED" || trip.status === "ARRIVED") ? (
          <View style={styles.rider}>
            <Face uri={riderFace} name={trip.rider.firstName} size={52} />
            <View style={styles.riderWords}>
              <Text style={styles.riderName}>
                {trip.rider.firstName
                  ? t(S.job.pickingUp, { name: trip.rider.firstName })
                  : t(S.job.pickingUpRider)}
              </Text>
              {riderFace ? <Text style={styles.riderHint}>{t(S.job.lookFor)}</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={styles.legs}>
          <Leg label={t(S.job.pickUp)} place={trip.pickupLabel} zone={trip.from.name} />
          <Leg label={t(S.job.drop)} place={trip.dropLabel} zone={trip.to.name} />
        </View>

        {trip.needsHelmet && !done ? <Text style={styles.helmet}>{t(S.job.spareHelmet)}</Text> : null}
        {error ? <Text style={styles.error}>{t(error)}</Text> : null}

        {trip.status === "ACCEPTED" ? (
          <Primary label={t(S.job.iAmHere)} busy={busy} onPress={() => void step(() => trips.arrived(trip.id))} />
        ) : null}

        {trip.status === "ARRIVED" ? (
          <View style={styles.pinBlock}>
            <Text style={styles.pinTitle}>{t(S.job.askHerNumber)}</Text>
            <Text style={styles.pinHelp}>{t(S.job.askHerNumberWhy)}</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              editable={!busy}
              accessibilityLabel={t(S.job.herFourDigits)}
              maxLength={4}
            />
            <Primary label={t(S.job.startRide)} busy={busy} disabled={pin.length !== 4} onPress={() => void startRide()} />
          </View>
        ) : null}

        {trip.status === "IN_PROGRESS" ? (
          <Primary label={t(S.job.finishRide)} busy={busy} onPress={() => void step(() => trips.complete(trip.id))} />
        ) : null}

        {done ? (
          <View style={styles.doneBlock}>
            <Text style={styles.doneText}>
              {t(trip.paymentMethod === "CASH" ? S.job.takeCash : S.job.paidByPhone)}
            </Text>
            <Primary label={t(S.job.done)} busy={false} onPress={() => router.replace("/(driver)")} />
          </View>
        ) : null}

        {!done ? (
          <>
            <View style={styles.minorActions}>
              <Pressable onPress={() => void Linking.openURL("tel:")} accessibilityRole="button" style={styles.minor}>
                <Text style={styles.minorLabel}>{t(S.job.callHer)}</Text>
              </Pressable>
              <Pressable onPress={confirmCancel} accessibilityRole="button" style={styles.minor}>
                <Text style={[styles.minorLabel, styles.minorDanger]}>{t(S.job.dropRide)}</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={getHelp}
              accessibilityRole="button"
              accessibilityLabel={t(S.job.getHelpLabel)}
              style={styles.sos}
            >
              <Text style={styles.sosLabel}>{t(S.job.getHelp)}</Text>
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
  rider: { flexDirection: "row", alignItems: "center", gap: space.md },
  riderWords: { flexShrink: 1, gap: 2 },
  riderName: { ...type.bodyStrong, color: c.ink },
  riderHint: { ...type.secondary, color: c.muted },
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

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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PhoneCallIcon, SealCheckIcon, ShareNetworkIcon, StarIcon, WarningIcon } from "@/ui/icons";
import { ApiError, apiBaseUrl } from "@/api/client";
import { Press, Pulse } from "@/ui/motion";
import {
  complaints,
  share,
  trips,
  type ComplaintCategory,
  type PaymentMethod,
  type TripDetail,
} from "@/api/rider";
import { useRiderRealtime } from "@/realtime/RiderRealtime";
import { findMe, useWhereIAm } from "@/ui/position";
import { MapPanel, MapPill, Sheet } from "@/ui/map";
import { Face, useTripFace } from "@/ui/trip-face";
import { RateRide } from "@/ui/rate-ride";
import { S } from "@/content/strings";
import { plural, useT, type Phrase } from "@/ui/i18n";
import { palette, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

const MAP_HEIGHT = 330;

const PAYMENT_LABEL: Record<PaymentMethod, Phrase> = {
  CASH: S.trip.cash,
  MOMO: S.trip.momo,
  ORANGE_MONEY: S.trip.orangeMoney,
};

function errorFor(err: unknown): Phrase {
  if (!(err instanceof ApiError)) return S.trip.didNotWork;
  switch (err.code) {
    case "offline":
      return S.trip.offline;
    case "trip_over":
      return S.trip.tripOver;
    case "not_yours":
      return S.trip.notYours;
    default:
      return S.trip.didNotWork;
  }
}

/** The line in the pill over the map. */
function stageLine(status: TripDetail["status"]): Phrase {
  switch (status) {
    case "REQUESTED":
    case "OFFERED":
      return S.trip.looking;
    case "ACCEPTED":
      return S.trip.coming;
    case "ARRIVED":
      return S.trip.outside;
    case "IN_PROGRESS":
      return S.trip.riding;
    case "COMPLETED":
      return S.trip.arrived;
    case "NO_DRIVER_FOUND":
      return S.trip.nobodyTook;
    case "CANCELLED_BY_DRIVER":
      return S.trip.heDropped;
    default:
      return S.trip.over;
  }
}

export default function Trip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { version, last, watch, driverPosition } = useRiderRealtime();
  // Her own position; his comes down the socket while the trip is watched.
  const where = useWhereIAm();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<Phrase | null>(null);
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
  const driverFace = useTripFace(
    trip?.id,
    trip?.status === "ACCEPTED" || trip?.status === "ARRIVED" || trip?.status === "IN_PROGRESS",
  );
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
    Alert.alert(t(S.trip.cancelAsk), t(S.trip.cancelWhy), [
      { text: t(S.trip.keepIt), style: "cancel" },
      {
        text: t(S.trip.cancelIt),
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void trips
            .cancel(id, "rider_changed_mind")
            .then(() => router.replace("/(rider)"))
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
      await RNShare.share({
        message: t(S.trip.followMe, { url: `${apiBaseUrl()}${created.path}` }),
      });
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
        const raised = await trips.sos(id, { ...where, note: "rider pressed get help" });
        // Say so when her people were texted: knowing they are already
        // following the ride is part of what calms somebody down.
        Alert.alert(
          t(S.trip.helpComing),
          raised.contactsTold > 0 ? `${t(S.trip.helpCominWhy)}\n\n${t(S.contacts.texted)}` : t(S.trip.helpCominWhy),
        );
      } catch {
        Alert.alert(t(S.trip.helpFailed), t(S.trip.callPolice));
      }
    })();
  }

  if (!trip) {
    return (
      <View style={styles.centre}>
        {error ? <Text style={styles.error}>{t(error)}</Text> : <ActivityIndicator color={c.action} />}
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
        here={where}
        driver={driver && !over ? driverPosition : null}
        destination={over ? null : trip.drop}
        sketch={{ here: { x: 0.5, y: 0.44 }, ...(driver && !over ? { driver: { x: 0.3, y: 0.74 } } : {}) }}
      >
        <View style={[styles.pillWrap, { top: insets.top + space.sm }]}>
          <MapPill style={styles.pill}>
            {/*
              A pulse rather than a spinner. A spinner says "busy"; this says
              "we are still casting about for somebody", which is the honest
              description of what the dispatcher is doing, and it is the only
              thing on this screen that tells her the app has not frozen.
            */}
            {searching ? (
              <Pulse size={18} colour={c.actionText}>
                <View style={styles.searchDot} />
              </Pulse>
            ) : null}
            <Text style={styles.pillText}>{t(stageLine(trip.status))}</Text>
          </MapPill>
        </View>
      </MapPanel>

      <Sheet handle={false} style={styles.sheet}>
        {/* The PIN takes the top of the sheet the moment he is outside. */}
        {trip.status === "ARRIVED" && trip.pin ? (
          <View style={styles.pinCard}>
            <Text style={styles.pinLabel}>{t(S.trip.tellHim)}</Text>
            <Text style={styles.pin}>{trip.pin}</Text>
            <Text style={styles.pinWarn}>{t(S.trip.tellHimWhy)}</Text>
          </View>
        ) : null}

        {searching ? (
          <Text style={styles.waiting}>{t(S.trip.usuallyQuick)}</Text>
        ) : null}

        {trip.status === "NO_DRIVER_FOUND" ? (
          <Text style={styles.waiting}>{t(S.trip.noTaxiTook)}</Text>
        ) : null}

        {driver ? (
          <View style={styles.driverRow}>
            <Face uri={driverFace} name={driver.name} />
            <View style={styles.grow}>
              <View style={styles.nameRow}>
                <Text style={styles.driverName} numberOfLines={1}>
                  {driver.name ?? t(S.trip.yourDriver)}
                </Text>
                {driver.verified ? <SealCheckIcon size={18} color={c.actionBright} weight="fill" /> : null}
              </View>
              <View style={styles.ratingRow}>
                <StarIcon size={15} color={c.amber} weight="fill" />
                {/* The 5.0 a driver starts on is not a rating, so a new one says so. */}
                <Text style={styles.rating}>
                  {driver.ratingCount > 0 ? driver.rating.toFixed(1) : t(S.trip.newDriver)}
                </Text>
                <Text style={styles.rides}>
                  {"· "}
                  {t(plural(driver.tripCount, S.trip.oneRide, S.trip.manyRides), {
                    n: driver.tripCount,
                  })}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => void Linking.openURL(`tel:${driver.phone}`)}
              accessibilityRole="button"
              accessibilityLabel={t(S.trip.callDriver)}
              style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
            >
              <PhoneCallIcon size={22} color={c.onAction} />
            </Pressable>
          </View>
        ) : null}

        {driver ? (
          <View style={styles.plateRow}>
            <Text style={styles.plateLabel}>{t(S.trip.plateNumber)}</Text>
            <Text style={styles.plate}>{driver.plate}</Text>
          </View>
        ) : null}

        <View style={styles.payRow}>
          <View>
            <Text style={styles.payLabel}>
              {t(trip.status === "COMPLETED" ? S.trip.youPaid : S.trip.payOnArrival)}
            </Text>
            <Text style={styles.payAmount}>{xaf(trip.priceXaf)} FCFA</Text>
          </View>
          <View style={styles.payChip}>
            <Text style={styles.payChipText}>{t(PAYMENT_LABEL[trip.paymentMethod])}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{t(error)}</Text> : null}

        <View style={styles.spacer} />

        {over ? (
          <>
            {trip.status === "COMPLETED" && driver ? (
              <RateRide tripId={trip.id} rated={trip.riderStars} />
            ) : null}

            <Pressable
              onPress={() => router.replace("/(rider)")}
              accessibilityRole="button"
              accessibilityLabel={t(trip.status === "COMPLETED" ? S.trip.done : S.trip.bookAnother)}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ctaLabel}>
                {t(trip.status === "COMPLETED" ? S.trip.done : S.trip.bookAnother)}
              </Text>
            </Pressable>

            {/*
              "Something wrong?" — where the API always expected it to be.
              Complaints could be filed since the beginning and no screen ever
              offered it, so ops has been staffing a queue nothing could reach.
              Quiet, under the primary action: most trips end fine.
            */}
            <Wrong tripId={trip.id} />
          </>
        ) : (
          <>
            <View style={styles.actions}>
              <Pressable
                onPress={shareTrip}
                disabled={sharing}
                accessibilityRole="button"
                accessibilityLabel={t(S.trip.shareThisTrip)}
                style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              >
                <ShareNetworkIcon size={18} color={c.inkSoft} />
                <Text style={styles.ghostLabel}>{t(sharing ? S.trip.makingLink : S.trip.shareTrip)}</Text>
              </Pressable>
              <Pressable
                onPress={confirmCancel}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t(S.trip.cancelThisRide)}
                style={({ pressed }) => [styles.ghost, styles.ghostDanger, pressed && styles.pressed]}
              >
                <Text style={styles.ghostDangerLabel}>{t(S.trip.cancelRide)}</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={getHelp}
              accessibilityRole="button"
              accessibilityLabel={t(S.trip.getHelp)}
              style={({ pressed }) => [styles.help, pressed && styles.pressed]}
            >
              <WarningIcon size={18} color={c.danger} />
              <Text style={styles.helpLabel}>{t(S.trip.getHelp)}</Text>
            </Pressable>
          </>
        )}
      </Sheet>
    </ScrollView>
  );
}


/**
 * Reporting a problem with a finished trip.
 *
 * Closed by default. A ride that went fine should not be asked about, and a
 * screen that opens with a complaint form invites complaints that were not
 * going to be made.
 *
 * The categories are the API's enum in plain words. The message has a floor of
 * a few characters because ops has promised to answer within a day and cannot
 * answer "bad".
 */
function Wrong({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ComplaintCategory>("FARE_DISPUTE");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<Phrase | null>(null);
  const t = useT();

  const KINDS: { id: ComplaintCategory; label: Phrase }[] = [
    { id: "FARE_DISPUTE", label: S.category.FARE_DISPUTE },
    { id: "DRIVER_CONDUCT", label: S.category.DRIVER_CONDUCT },
    { id: "SAFETY", label: S.wrong.feltUnsafe },
    { id: "LOST_ITEM", label: S.wrong.leftSomething },
    { id: "OTHER", label: S.category.OTHER },
  ];

  async function send() {
    if (message.trim().length < 5) {
      setFailed(S.wrong.tooShort);
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      // The API answers with a sentence of its own, and it is English every
      // time. It is thrown away here; we say the same thing in her language.
      await complaints.file({ category, message: message.trim(), tripId });
      setSent(true);
    } catch (err) {
      setFailed(err instanceof ApiError && err.offline ? S.wrong.offline : S.wrong.didNotSend);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.wrongDone}>
        <Text style={styles.wrongDoneText}>{t(S.wrong.thanks)}</Text>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.wrongLink}>{t(S.wrong.link)}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrong}>
      <Text style={styles.wrongTitle}>{t(S.wrong.title)}</Text>

      <View style={styles.wrongKinds}>
        {KINDS.map((k) => (
          <Pressable
            key={k.id}
            onPress={() => setCategory(k.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: category === k.id }}
            style={[styles.wrongChip, category === k.id && styles.wrongChipOn]}
          >
            <Text style={[styles.wrongChipText, category === k.id && styles.wrongChipTextOn]}>
              {t(k.label)}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.wrongInput}
        value={message}
        onChangeText={setMessage}
        placeholder={t(S.wrong.placeholder)}
        placeholderTextColor={c.muted}
        multiline
        editable={!busy}
      />

      {failed ? <Text style={styles.error}>{t(failed)}</Text> : null}

      <View style={styles.wrongActions}>
        <Pressable onPress={() => setOpen(false)} disabled={busy} hitSlop={8}>
          <Text style={styles.wrongCancel}>{t(S.wrong.notNow)}</Text>
        </Pressable>
        <Press onPress={() => void send()} disabled={busy} style={styles.wrongSend}>
          <Text style={styles.wrongSendLabel}>{t(busy ? S.wrong.sending : S.wrong.send)}</Text>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrongLink: { ...type.secondaryStrong, color: c.muted, textAlign: "center", paddingVertical: space.md },
  wrong: {
    gap: space.md,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  wrongTitle: { ...type.bodyStrong, color: c.ink },
  wrongKinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  wrongChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.lineStrong,
  },
  wrongChipOn: { borderColor: c.action, backgroundColor: c.actionTint },
  wrongChipText: { ...type.secondary, color: c.inkSoft },
  wrongChipTextOn: { color: c.actionText, fontWeight: "600" },
  wrongInput: {
    ...type.body,
    minHeight: 76,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
    color: c.ink,
    textAlignVertical: "top",
  },
  wrongActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wrongCancel: { ...type.body, color: c.muted },
  wrongSend: {
    minHeight: touch.min,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  wrongSendLabel: { ...type.bodyStrong, color: c.onAction },
  wrongDone: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: c.actionTint,
  },
  wrongDoneText: { ...type.secondary, color: c.actionText, textAlign: "center" },

  searchDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.actionText },
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

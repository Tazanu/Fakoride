/**
 * The driver's home screen.
 *
 * Built from the DriverHome artboard. Three things stacked under the map, in
 * the order he cares about them:
 *
 *   what he has made today, and how many rides it took
 *   the ride on offer right now, if there is one
 *   his rating, which he checks rarely and worries about often
 *
 * The offer is a deep teal card rather than a sheet over everything, which is
 * the one real departure from how the rider app handles the same moment. A
 * driver is looking at this screen *waiting* for work — the offer belongs in
 * the flow of the page, where his thumb already is, not covering it.
 *
 * The fare is the biggest thing on the card because it is the only number he
 * decides on, and the two buttons are weighted 1:2 so the common answer is the
 * easy one to hit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import { StarIcon } from "@/ui/icons";
import { ApiError } from "@/api/client";
import { shift, trips, type TodaySummary } from "@/api/driver";
import { useSession } from "@/session/SessionProvider";
import { useDriverRealtime } from "@/realtime/DriverRealtime";
import { findMe } from "@/ui/position";
import { MapPanel, Sheet } from "@/ui/map";
import { ServiceNotice } from "@/ui/notice";
import { S } from "@/content/strings";
import { useT, type Phrase } from "@/ui/i18n";
import { palette, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

const MAP_HEIGHT = 300;

export default function Home() {
  const router = useRouter();
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const { offer, clearOffer } = useDriverRealtime();
  const t = useT();

  const [today, setToday] = useState<TodaySummary | null>(null);
  const [online, setOnline] = useState(me?.driver?.online ?? false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Phrase | null>(null);
  const [answering, setAnswering] = useState(false);

  const load = useCallback(async () => {
    try {
      setToday(await shift.today());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.offline ? S.driver.offlinePullDown : null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleOnline() {
    setBusy(true);
    setError(null);
    try {
      if (online) {
        await shift.goOffline();
        setOnline(false);
      } else {
        // Dispatch searches by position, so there is nothing to go online with
        // until he grants this. Asked here, at the moment it is needed.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setError(S.driver.needLocation);
          return;
        }
        const fix = await findMe();
        if (!fix) {
          setError(S.driver.turnOnLocation);
          return;
        }
        await shift.goOnline(fix.lat, fix.lng);
        setOnline(true);
      }
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_verified") {
        router.replace("/apply");
        return;
      }
      setError(
        err instanceof ApiError && err.offline
          ? S.driver.offlineMoment
          : S.driver.didNotWorkTryAgain,
      );
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!offer) return;
    setAnswering(true);
    try {
      await trips.accept(offer.tripId);
      const id = offer.tripId;
      clearOffer();
      router.push({ pathname: "/(driver)/job/[id]", params: { id } });
    } catch (err) {
      // Somebody else took it, or it expired while he was deciding. Neither is
      // his fault and neither is worth a dialog — the offer just goes.
      if (err instanceof ApiError && (err.code === "already_taken" || err.code === "offer_expired")) {
        clearOffer();
        return;
      }
      setError(err instanceof ApiError && err.offline ? S.driver.noNetwork : S.driver.didNotWork);
    } finally {
      setAnswering(false);
    }
  }

  function decline() {
    if (!offer) return;
    // Deliberately not awaited: he has already moved on, and the server passes
    // the ride to the next driver whether or not we hear back.
    void trips.decline(offer.tripId).catch(() => undefined);
    clearOffer();
  }

  const fee = today?.accessFee;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={c.action}
          progressViewOffset={insets.top}
        />
      }
    >
      <MapPanel height={MAP_HEIGHT} here={{ x: 0.5, y: 0.47 }}>
        {/* The online switch is the whole top of the map, not a button in a bar. */}
        <View style={[styles.statusBar, { top: insets.top + space.sm }]}>
          <View style={styles.statusLeft}>
            <View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.statusText}>{t(online ? S.driver.online : S.driver.offline)}</Text>
          </View>
          <Pressable
            onPress={toggleOnline}
            disabled={busy}
            accessibilityRole="switch"
            accessibilityState={{ checked: online, busy }}
            accessibilityLabel={t(online ? S.driver.goOffline : S.driver.goOnline)}
            style={[styles.switch, online ? styles.switchOn : styles.switchOff]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={online ? c.onAction : c.muted} />
            ) : (
              <View style={[styles.knob, online ? styles.knobOn : styles.knobOff]} />
            )}
          </Pressable>
        </View>
      </MapPanel>

      <Sheet handle={false} style={styles.sheet}>
        <ServiceNotice />

        <View style={styles.stats}>
          <Stat label={t(S.driver.today)} value={`${xaf(today?.earnedXaf ?? 0)} F`} />
          <Stat label={t(S.driver.ridesToday)} value={String(today?.tripCount ?? 0)} />
        </View>

        {offer ? (
          <OfferCard
            offer={offer}
            busy={answering}
            onAccept={() => void accept()}
            onDecline={decline}
          />
        ) : null}

        {error ? <Text style={styles.error}>{t(error)}</Text> : null}

        {fee ? (
          <View style={[styles.feeRow, fee.paid ? styles.feePaid : styles.feeDue]}>
            <Text style={[styles.feeText, fee.paid ? styles.feeTextPaid : styles.feeTextDue]}>
              {t(fee.paid ? S.driver.feePaid : S.driver.feeDue, {
                amount: xaf(fee.amountXaf),
              })}
            </Text>
          </View>
        ) : null}

        <View style={styles.ratingRow}>
          <View style={styles.ratingLeft}>
            <StarIcon size={18} color={c.amber} weight="fill" />
            <Text style={styles.ratingLabel}>{t(S.driver.yourRating)}</Text>
          </View>
          <Text style={styles.ratingValue}>
            {typeof me?.driver?.rating === "number" ? me.driver.rating.toFixed(1) : "—"}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/(driver)/earnings")}
          accessibilityRole="button"
          accessibilityLabel={t(S.driver.myMoney)}
          style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
        >
          <Text style={styles.ghostLabel}>{t(S.driver.myMoney)}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/profile")}
          accessibilityRole="button"
          accessibilityLabel={t(S.driver.account)}
          style={styles.account}
        >
          <Text style={styles.accountLabel}>{t(S.driver.account)}</Text>
        </Pressable>
      </Sheet>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/**
 * The ride on offer, and its clock.
 *
 * The countdown is a number in a white disc rather than a draining bar: on this
 * card the bar would have to sit on teal, where the unfilled half is invisible.
 * A digit that ticks down reads at a glance either way.
 */
function OfferCard({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: NonNullable<ReturnType<typeof useDriverRealtime>["offer"]>;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [left, setLeft] = useState(offer.expiresInSeconds);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = useT();

  useEffect(() => {
    setLeft(offer.expiresInSeconds);
    tick.current = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
    };
  }, [offer.tripId, offer.expiresInSeconds]);

  const away =
    offer.pickupDistanceM < 1000
      ? t(S.driver.metresAway, { n: Math.round(offer.pickupDistanceM / 10) * 10 })
      : t(S.driver.kmAway, { n: (offer.pickupDistanceM / 1000).toFixed(1) });

  return (
    <View style={styles.offer}>
      <View style={styles.offerHead}>
        <Text style={styles.offerTitle}>{t(S.driver.newRide)}</Text>
        <View style={styles.clock}>
          <Text style={styles.clockText}>{left}</Text>
        </View>
      </View>

      <View style={styles.offerFareRow}>
        <Text style={styles.offerFare}>{xaf(offer.priceXaf)}</Text>
        <Text style={styles.offerUnit}>FCFA</Text>
        <Text style={styles.offerPay}>
          {"· "}
          {t(offer.paymentMethod === "CASH" ? S.driver.payCash : S.driver.payPhone)}
        </Text>
      </View>

      <View style={styles.well}>
        <View style={styles.wellRow}>
          <View style={styles.wellStart} />
          <Text style={styles.wellPlace} numberOfLines={1}>
            {offer.pickupLabel}
          </Text>
          <Text style={styles.wellAway}>· {away}</Text>
        </View>
        <View style={styles.wellRow}>
          <View style={styles.wellEnd} />
          <Text style={styles.wellPlace} numberOfLines={1}>
            {offer.dropLabel}
          </Text>
        </View>
      </View>

      <View style={styles.offerActions}>
        <Pressable
          onPress={onDecline}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t(S.driver.leaveRide)}
          style={({ pressed }) => [styles.decline, pressed && styles.pressed]}
        >
          <Text style={styles.declineLabel}>{t(S.driver.decline)}</Text>
        </Pressable>
        <Pressable
          onPress={onAccept}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t(S.driver.acceptFor, { n: offer.priceXaf })}
          style={({ pressed }) => [styles.accept, pressed && styles.pressed, busy && styles.dimmed]}
        >
          {busy ? (
            <ActivityIndicator color={c.action} />
          ) : (
            <Text style={styles.acceptLabel}>{t(S.driver.accept)}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.7 },
  sheet: { gap: space.md },

  statusBar: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.edge,
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: c.actionBright },
  dotOff: { backgroundColor: c.lineStrong },
  statusText: { ...type.bodyStrong, fontSize: 15, color: c.ink },
  switch: {
    width: 62,
    height: 34,
    borderRadius: 17,
    padding: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  switchOn: { backgroundColor: c.actionBright, justifyContent: "flex-end" },
  switchOff: { backgroundColor: c.track, justifyContent: "flex-start" },
  knob: { width: 28, height: 28, borderRadius: 14 },
  knobOn: { backgroundColor: c.card },
  knobOff: { backgroundColor: c.card },

  stats: { flexDirection: "row", gap: space.sm },
  stat: {
    flexGrow: 1,
    flexBasis: 0,
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.edge,
  },
  statLabel: { ...type.label, fontSize: 12, color: c.muted },
  statValue: { ...type.fareSmall, color: c.ink, fontVariant: ["tabular-nums"] },

  offer: { gap: space.md, padding: space.lg, borderRadius: 18, backgroundColor: c.action },
  offerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  offerTitle: { ...type.label, color: c.onActionSoft, letterSpacing: 0.6 },
  clock: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
  },
  clockText: { ...type.heading, fontSize: 15, color: c.action, fontVariant: ["tabular-nums"] },
  offerFareRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  offerFare: { ...type.fare, fontSize: 36, color: c.onAction, fontVariant: ["tabular-nums"] },
  offerUnit: { ...type.bodyStrong, fontSize: 16, color: c.onAction },
  offerPay: { ...type.secondary, fontSize: 14, color: c.onActionSoft },

  /* A well inside the card, one step darker so the stops read as inset. */
  well: { gap: space.sm, padding: space.md, borderRadius: radius.sm, backgroundColor: c.actionDeep },
  wellRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  wellStart: { width: 9, height: 9, borderRadius: 5, borderWidth: 2.5, borderColor: c.onActionBright },
  wellEnd: { width: 9, height: 9, borderRadius: 2, backgroundColor: c.amber },
  wellPlace: { ...type.secondaryStrong, fontSize: 14, color: c.onAction, flexShrink: 1 },
  wellAway: { ...type.secondary, color: c.onActionMuted },

  offerActions: { flexDirection: "row", gap: space.sm },
  decline: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.onActionEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  declineLabel: { ...type.bodyStrong, color: c.onActionSoft },
  accept: {
    flexGrow: 2,
    flexBasis: 0,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptLabel: { ...type.button, fontSize: 16, color: c.action },

  error: { ...type.secondary, color: c.danger },

  feeRow: { borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  feePaid: { backgroundColor: c.actionTint },
  feeDue: { backgroundColor: c.fill },
  feeText: { ...type.secondary },
  feeTextPaid: { color: c.actionText },
  feeTextDue: { color: c.inkSoft },

  ratingRow: {
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
  ratingLeft: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ratingLabel: { ...type.secondary, fontSize: 14, color: c.inkSoft },
  ratingValue: { ...type.plate, letterSpacing: 0, color: c.ink },

  ghost: {
    minHeight: touch.secondaryButtonMinHeight,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostLabel: { ...type.bodyStrong, color: c.inkSoft },

  account: { minHeight: touch.min, alignItems: "center", justifyContent: "center", marginTop: space.sm },
  accountLabel: { ...type.body, color: c.muted },
});

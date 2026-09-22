/**
 * Confirm your ride.
 *
 * The route drawn on the map, then three things stacked under it: where she is
 * going, what it costs, and how she will pay. The fare card is the one dark
 * surface in the whole app — deep teal, white numerals — because this screen
 * exists to make one number impossible to miss, and to promise it will not
 * move. Everything else on the page is quiet so that card can be loud.
 *
 * Payment is a three-up row of tiles rather than a list. Three options that
 * differ only in name are a choice, not a sequence, and a row says so in less
 * vertical space than three rows of the same information.
 *
 * The helmet chip from the original artboards is deliberately gone: it was a
 * moto question and Buea runs taxis. "Woman driver" stays — that one is about
 * who is driving, not what he is driving.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CaretLeftIcon,
  CheckIcon,
  CircleIcon,
  DeviceMobileIcon,
  MountainsIcon,
  UserCircleIcon,
  WalletIcon,
} from "@/ui/icons";
import { ApiError } from "@/api/client";
import { fares, trips, type PaymentMethod, type Quote } from "@/api/rider";
import { MapButton, MapPanel, Sheet } from "@/ui/map";
import { palette, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

/** Shorter than the booking map: the route matters, the surroundings do not. */
const MAP_HEIGHT = 268;

/** The three rails, in the words printed on the kiosks. */
const PAYMENTS: { key: PaymentMethod; label: string }[] = [
  { key: "CASH", label: "Cash" },
  { key: "MOMO", label: "MoMo" },
  { key: "ORANGE_MONEY", label: "Orange" },
];

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "That did not work. Try again.";
  switch (err.code) {
    case "offline":
      return "No network. Try again in a moment.";
    case "no_fare":
    case "zone_not_found":
      return "We do not have a price for that trip yet.";
    case "trip_in_progress":
      return "You already have a ride running.";
    default:
      return "That did not work. Try again.";
  }
}

export default function Confirm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toZone, toName, fromName, lat, lng } = useLocalSearchParams<{
    toZone: string;
    toName: string;
    fromName: string;
    lat: string;
    lng: string;
  }>();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("CASH");
  const [womanDriverOnly, setWomanDriverOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!toZone || !lat || !lng) return;
    try {
      setQuote(await fares.quote({ fromLat: Number(lat), fromLng: Number(lng), toZone }));
      setError(null);
    } catch (err) {
      setError(errorFor(err));
    }
  }, [toZone, lat, lng]);

  useEffect(() => {
    void load();
  }, [load]);

  async function book() {
    if (!toZone || !lat || !lng) return;
    setBusy(true);
    setError(null);
    try {
      const trip = await trips.book({
        pickupLat: Number(lat),
        pickupLng: Number(lng),
        toZone,
        paymentMethod: payment,
        womanDriverOnly,
      });
      router.replace({ pathname: "/(rider)/trip/[id]", params: { id: trip.id } });
    } catch (err) {
      setError(errorFor(err));
      setBusy(false);
    }
  }

  const price = quote ? (payment === "CASH" ? quote.priceXaf : quote.mobilePriceXaf) : null;
  const saving = quote ? quote.priceXaf - quote.mobilePriceXaf : 0;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <MapPanel height={MAP_HEIGHT} here={{ x: 0.2, y: 0.25 }} driver={{ x: 0.76, y: 0.76 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.back, { top: insets.top + space.sm }, pressed && styles.pressed]}
        >
          <MapButton>
            <CaretLeftIcon size={22} color={c.ink} />
          </MapButton>
        </Pressable>
      </MapPanel>

      <Sheet handle={false}>
        {/* The journey as one object: two stops joined by a short rule. */}
        <View style={styles.route}>
          <View style={styles.stopRow}>
            <View style={styles.stopStart} />
            <Text style={styles.stopText} numberOfLines={1}>
              {fromName || quote?.fromZoneCode || "Finding you…"}
            </Text>
          </View>
          <View style={styles.stopJoin} />
          <View style={styles.stopRow}>
            <View style={styles.stopEnd} />
            <Text style={styles.stopText} numberOfLines={1}>
              {toName || quote?.toZoneCode || ""}
            </Text>
          </View>
        </View>

        {/* The one dark surface in the app. */}
        <View style={styles.fareCard}>
          {price === null ? (
            <ActivityIndicator color={c.onAction} />
          ) : (
            <>
              <View style={styles.fareHead}>
                <Text style={styles.fareLabel}>Your fare</Text>
                {quote?.hillFare ? (
                  <View style={styles.hillRow}>
                    <MountainsIcon size={14} color={c.onActionSoft} />
                    <Text style={styles.fareLabel}>up the hill</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fare}>{xaf(price)}</Text>
                <Text style={styles.fareUnit}>FCFA</Text>
              </View>
              <View style={styles.promise}>
                <CheckIcon size={16} color={c.onActionSoft} weight="bold" />
                <Text style={styles.promiseText}>Fixed price. Your driver cannot ask for more.</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>Pay with</Text>
        <View style={styles.payRow}>
          {PAYMENTS.map((p) => {
            const chosen = payment === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPayment(p.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={p.label}
                style={({ pressed }) => [styles.payTile, chosen && styles.payTileOn, pressed && styles.pressed]}
              >
                {p.key === "CASH" ? (
                  <WalletIcon size={22} color={chosen ? c.action : c.muted} />
                ) : (
                  <DeviceMobileIcon size={22} color={chosen ? c.action : c.muted} />
                )}
                <Text style={[styles.payLabel, chosen && styles.payLabelOn]}>{p.label}</Text>
                {p.key !== "CASH" && saving > 0 ? (
                  <Text style={styles.paySave}>−{saving}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {saving > 0 ? (
          <Text style={styles.note}>Paying by phone saves you {saving} FCFA — it costs us less too.</Text>
        ) : null}

        <Pressable
          onPress={() => setWomanDriverOnly((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: womanDriverOnly }}
          accessibilityLabel="Woman driver only"
          style={({ pressed }) => [styles.toggleRow, womanDriverOnly && styles.toggleRowOn, pressed && styles.pressed]}
        >
          <UserCircleIcon size={22} color={womanDriverOnly ? c.action : c.muted} />
          <Text style={[styles.toggleLabel, womanDriverOnly && styles.toggleLabelOn]}>Woman driver</Text>
          {womanDriverOnly ? (
            <CheckIcon size={20} color={c.action} weight="bold" />
          ) : (
            <CircleIcon size={20} color={c.controlEdge} />
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={book}
          disabled={busy || price === null}
          accessibilityRole="button"
          accessibilityLabel="Find me a taxi"
          style={({ pressed }) => [
            styles.cta,
            pressed && styles.ctaPressed,
            (busy || price === null) && styles.ctaOff,
          ]}
        >
          {busy ? <ActivityIndicator color={c.onAction} /> : <Text style={styles.ctaLabel}>Find me a taxi</Text>}
        </Pressable>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  pressed: { opacity: 0.7 },
  back: { position: "absolute", left: space.lg },

  route: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.edge,
  },
  stopRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  /* Start is a ring, end is a square. Shape, not only colour, tells them apart. */
  stopStart: { width: 10, height: 10, borderRadius: 5, borderWidth: 3, borderColor: c.action },
  stopEnd: { width: 10, height: 10, borderRadius: 2, backgroundColor: c.amber },
  stopJoin: { marginLeft: 4, width: 2, height: 14, backgroundColor: c.lineStrong },
  stopText: { ...type.bodyStrong, color: c.ink, flexShrink: 1 },

  fareCard: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.action,
    gap: space.md,
  },
  fareHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fareLabel: { ...type.secondaryStrong, color: c.onActionSoft },
  hillRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  fareRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  fare: { ...type.fare, color: c.onAction, fontVariant: ["tabular-nums"] },
  fareUnit: { ...type.heading, color: c.onAction },
  promise: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: c.onActionLine,
  },
  promiseText: { ...type.secondaryStrong, color: c.onActionSoft, flexShrink: 1 },

  sectionLabel: { ...type.label, color: c.inkSoft, marginTop: space.lg, marginBottom: space.sm },
  payRow: { flexDirection: "row", gap: space.sm },
  payTile: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 76,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  payTileOn: { borderWidth: 2, borderColor: c.actionBright },
  payLabel: { ...type.secondaryStrong, color: c.inkSoft },
  payLabelOn: { color: c.ink },
  paySave: { ...type.secondary, color: c.actionText, fontVariant: ["tabular-nums"] },

  note: { ...type.secondary, color: c.muted, marginTop: space.sm },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.lg,
    minHeight: touch.secondaryButtonMinHeight,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
  },
  toggleRowOn: { borderWidth: 2, borderColor: c.actionBright },
  toggleLabel: { ...type.bodyStrong, color: c.inkSoft, flexGrow: 1 },
  toggleLabelOn: { color: c.ink },

  error: { ...type.secondary, color: c.danger, marginTop: space.md },

  cta: {
    marginTop: space.xl,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: c.action,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { backgroundColor: c.actionPressed },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { ...type.button, color: c.onAction },
});

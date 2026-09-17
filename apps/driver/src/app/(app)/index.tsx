/**
 * The driver's home screen.
 *
 * Built from the DriverHome artboard, and the three numbers across the top are
 * the whole argument for using this app: rides today, francs earned, and
 * **0 taken by us**. That last one is rendered even though it is always zero,
 * because a driver who has been paying 20% somewhere else needs to see it.
 *
 * Dense with facts, single in action — one primary control, the online toggle,
 * and everything else is information that removes a step.
 */

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { ApiError } from "@/api/client";
import { shift, type TodaySummary, type ZoneDemand } from "@/api/driver";
import { useSession } from "@/session/SessionProvider";
import { cardShadow, palette, primaryButton, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

/** The board's three words, and the colour each earns. */
const LEVEL_STYLE = {
  BUSY: { label: "BUSY", color: c.action, tint: c.actionTint },
  STEADY: { label: "steady", color: c.inkSoft, tint: c.fill },
  QUIET: { label: "quiet", color: c.muted, tint: c.fill },
} as const;

export default function Home() {
  const router = useRouter();
  const { me, signOut } = useSession();
  const insets = useSafeAreaInsets();

  const [today, setToday] = useState<TodaySummary | null>(null);
  const [zones, setZones] = useState<ZoneDemand[]>([]);
  const [online, setOnline] = useState(me?.driver?.online ?? false);
  const [zoneName, setZoneName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, board] = await Promise.all([shift.today(), shift.demand()]);
      setToday(summary);
      setZones(board.zones);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.offline ? "No network. Pull down to try again." : null);
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
        setZoneName(null);
      } else {
        // Dispatch searches by position, so there is nothing to go online with
        // until he grants this. Asked here, at the moment it is needed, rather
        // than at startup where it reads as a demand.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setError("We need your location to send you rides nearby.");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const res = await shift.goOnline(pos.coords.latitude, pos.coords.longitude);
        setOnline(true);
        setZoneName(res.zone.name);
      }
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_verified") {
        router.replace("/apply");
        return;
      }
      setError(
        err instanceof ApiError && err.offline
          ? "No network. Try again in a moment."
          : "That did not work. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const fee = today?.accessFee;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={c.action}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.grow}>
          <Text style={styles.name} numberOfLines={1}>
            {me?.name ?? "Driver"}
          </Text>
          <Text style={styles.plate}>{me?.driver?.plate}</Text>
        </View>
        <Pressable
          onPress={() => router.push("/(app)/earnings")}
          accessibilityRole="button"
          accessibilityLabel="My money"
          style={styles.headerLink}
        >
          <Text style={styles.headerLinkLabel}>My money</Text>
        </Pressable>
      </View>

      {/* One primary action on the screen. This is it. */}
      <Pressable
        onPress={toggleOnline}
        disabled={busy}
        accessibilityRole="switch"
        accessibilityState={{ checked: online, busy }}
        accessibilityLabel={online ? "Stop working" : "Start working"}
        style={({ pressed }) => [
          styles.toggle,
          online ? styles.toggleOn : styles.toggleOff,
          pressed && styles.togglePressed,
          busy && styles.toggleBusy,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={online ? c.ink : c.onAction} />
        ) : (
          <>
            <Text style={[styles.toggleLabel, online ? styles.toggleLabelOn : styles.toggleLabelOff]}>
              {online ? "YOU ARE WORKING" : "START WORKING"}
            </Text>
            {online && zoneName ? <Text style={styles.toggleZone}>in {zoneName}</Text> : null}
          </>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* The three numbers. */}
      <View style={styles.stats}>
        <Stat value={String(today?.tripCount ?? 0)} label="rides today" />
        <Stat value={today ? xaf(today.earnedXaf) : "0"} label="FCFA earned" />
        <Stat value="0" label="taken by us" highlight />
      </View>

      {fee ? (
        <View style={[styles.feeRow, fee.paid ? styles.feePaid : styles.feeDue]}>
          <Text style={[styles.feeText, fee.paid ? styles.feeTextPaid : styles.feeTextDue]}>
            {fee.paid
              ? `Today's fee paid — ${xaf(fee.amountXaf)} FCFA`
              : `Today's fee — ${xaf(fee.amountXaf)} FCFA, taken tomorrow morning`}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Where people are waiting now</Text>

      {zones.length === 0 ? (
        <Text style={styles.empty}>Nobody waiting anywhere just now.</Text>
      ) : (
        <View style={styles.board}>
          {zones.slice(0, 6).map((z) => (
            <DemandRow key={z.zone} zone={z} />
          ))}
        </View>
      )}

      <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out" style={styles.signOut}>
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DemandRow({ zone }: { zone: ZoneDemand }) {
  const level = LEVEL_STYLE[zone.level];
  return (
    <View style={styles.zoneRow}>
      <Text style={styles.zoneCount}>{zone.waitingRiders}</Text>
      <View style={styles.grow}>
        <Text style={styles.zoneName} numberOfLines={1}>
          {zone.name}
          {zone.pickupPoint ? ` · ${zone.pickupPoint}` : ""}
        </Text>
        <Text style={styles.zoneBikes}>
          {zone.bikesNearby} {zone.bikesNearby === 1 ? "bike" : "bikes"} near
        </Text>
      </View>
      <View style={[styles.levelChip, { backgroundColor: level.tint }]}>
        <Text style={[styles.levelText, { color: level.color }]}>{level.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.lg, gap: space.md },
  grow: { flexGrow: 1, flexShrink: 1 },

  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { ...type.heading, color: c.ink },
  plate: { ...type.secondary, color: c.muted },
  headerLink: { minHeight: touch.min, justifyContent: "center", paddingHorizontal: space.sm },
  headerLinkLabel: { ...type.body, color: c.action },

  toggle: { ...primaryButton, gap: space.xs },
  toggleOff: { backgroundColor: c.action },
  toggleOn: { backgroundColor: c.actionTint, borderWidth: 2, borderColor: c.action },
  togglePressed: { opacity: 0.85 },
  toggleBusy: { opacity: 0.7 },
  toggleLabel: { ...type.heading, letterSpacing: 0.5 },
  toggleLabelOff: { color: c.onAction },
  toggleLabelOn: { color: c.action },
  toggleZone: { ...type.secondary, color: c.action },

  error: { ...type.secondary, color: c.danger },

  stats: { flexDirection: "row", gap: space.sm },
  stat: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.md,
    ...cardShadow,
  },
  statValue: { ...type.fareSmall, color: c.ink },
  statValueHighlight: { color: c.action },
  statLabel: { ...type.secondary, color: c.muted, marginTop: space.xs },

  feeRow: { borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  feePaid: { backgroundColor: c.actionTint },
  feeDue: { backgroundColor: c.fill },
  feeText: { ...type.secondary },
  feeTextPaid: { color: c.action },
  feeTextDue: { color: c.inkSoft },

  sectionLabel: { ...type.label, color: c.muted, marginTop: space.sm },
  empty: { ...type.bodyPlain, color: c.muted },
  board: { gap: space.sm },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: c.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: touch.min,
  },
  zoneCount: { ...type.fareSmall, color: c.ink, minWidth: 34 },
  zoneName: { ...type.body, color: c.ink },
  zoneBikes: { ...type.secondary, color: c.muted },
  levelChip: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs },
  levelText: { ...type.label },

  signOut: { minHeight: touch.min, alignItems: "center", justifyContent: "center", marginTop: space.xl },
  signOutLabel: { ...type.body, color: c.muted },
});

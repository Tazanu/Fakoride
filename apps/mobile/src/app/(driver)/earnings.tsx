/**
 * My money.
 *
 * Built from the Earnings artboard. The screen has one job beyond arithmetic:
 * make the flat fee legible as the bargain it is. "500 FCFA a day, nothing per
 * ride" sits directly under the week's takings so the two are read together.
 *
 * The ghost-town Monday is the detail that matters most. Mondays in Buea are
 * dead, and a driver who stayed home deserves a bar that says "you chose this"
 * rather than an empty gap that reads as a bad week. The API flags it; this
 * screen names it.
 */

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ApiError } from "@/api/client";
import { money, type Balance, type WeekEarnings } from "@/api/driver";
import { PaymentHistory } from "@/ui/payment-history";
import { cardShadow, palette, primaryButton, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

/** Tall enough to read a difference, short enough to fit seven on a phone. */
const BAR_MAX_HEIGHT = 96;

export default function Earnings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [week, setWeek] = useState<WeekEarnings | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, b] = await Promise.all([money.week(), money.balance()]);
      setWeek(w);
      setBalance(b);
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

  async function cashOut() {
    if (!balance || balance.payableXaf <= 0) return;
    setCashingOut(true);
    try {
      const res = await money.cashOut();
      // "On its way", never "sent" — it lands seconds later, or it fails.
      Alert.alert(`${xaf(res.amountXaf)} FCFA`, res.next);
      await load();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.code === "offline"
            ? "No network. Try again in a moment."
            : err.code === "payout_refused"
              ? err.message
              : "That did not go through."
          : "That did not go through.";
      Alert.alert("Could not send it", message);
    } finally {
      setCashingOut(false);
    }
  }

  const peak = Math.max(1, ...(week?.days.map((d) => d.earnedXaf) ?? [1]));
  const canCashOut = (balance?.payableXaf ?? 0) > 0 && !cashingOut;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
      ]}
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
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>My money</Text>
      {week ? (
        <Text style={styles.period}>
          This week · {week.from} to {week.to}
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!week ? (
        <ActivityIndicator color={c.action} style={styles.loading} />
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroValue}>{xaf(week.earnedXaf)}</Text>
            <Text style={styles.heroUnit}>FCFA earned</Text>
          </View>

          {/* One bar per day. A missing bar has to mean something. */}
          <View style={styles.chart}>
            {week.days.map((d) => {
              const height = Math.max(3, Math.round((d.earnedXaf / peak) * BAR_MAX_HEIGHT));
              return (
                <View key={d.date} style={styles.barColumn}>
                  <View
                    accessible
                    accessibilityLabel={
                      d.ghostTown
                        ? `${d.weekday}, ghost town, you did not work`
                        : `${d.weekday}, ${xaf(d.earnedXaf)} francs from ${d.tripCount} rides`
                    }
                    style={[
                      styles.bar,
                      { height },
                      d.worked ? styles.barWorked : styles.barIdle,
                      d.ghostTown && styles.barGhost,
                    ]}
                  />
                  <Text style={[styles.barDay, d.ghostTown && styles.barDayGhost]}>{d.weekday}</Text>
                </View>
              );
            })}
          </View>

          {week.days.some((d) => d.ghostTown) ? (
            <Text style={styles.ghostNote}>A quiet Monday never counts against you.</Text>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>500 FCFA a day, nothing per ride</Text>
            <Text style={styles.cardBody}>Taken from your MoMo each morning you work.</Text>
            <Text style={styles.cardFigure}>
              {week.feesPaidCount} of {week.daysWorked} {week.daysWorked === 1 ? "day" : "days"} paid —{" "}
              {xaf(week.feesXaf)} FCFA. You kept {xaf(week.keptXaf)} FCFA.
            </Text>
          </View>

          {balance ? (
            <View style={styles.card}>
              <Text style={styles.label}>We are holding for you</Text>
              <Text style={styles.balance}>{xaf(balance.payableXaf)} FCFA</Text>
              <Text style={styles.cardBody}>{balance.note}</Text>

              {balance.unpaidFeesXaf > 0 ? (
                <Text style={styles.owing}>
                  {xaf(balance.unpaidFeesXaf)} FCFA of fees still to collect.
                </Text>
              ) : null}

              <Pressable
                onPress={cashOut}
                disabled={!canCashOut}
                accessibilityRole="button"
                accessibilityLabel="Send it to my MoMo"
                style={({ pressed }) => [
                  styles.primary,
                  !canCashOut && styles.primaryDisabled,
                  pressed && styles.primaryPressed,
                ]}
              >
                {cashingOut ? (
                  <ActivityIndicator color={c.onAction} />
                ) : (
                  <Text style={styles.primaryLabel}>SEND IT TO MY MOMO</Text>
                )}
              </Pressable>

              {balance.payableXaf <= 0 ? (
                <Text style={styles.cardBody}>
                  Cash fares are already in your pocket — there is nothing for us to send.
                </Text>
              ) : null}
            </View>
          ) : null}

          {/*
            The record.
            
            He could see a balance and press a button, and nowhere could he
            check what had actually moved — which fee came out on which
            morning, whether last week's cash-out ever landed. This is his
            income; a money screen without a history is where trust goes.
          */}
          <PaymentHistory />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.lg, gap: space.sm },

  header: { flexDirection: "row" },
  back: { minHeight: touch.min, justifyContent: "center", paddingRight: space.md },
  backLabel: { ...type.body, color: c.action },

  title: { ...type.heading, color: c.ink },
  period: { ...type.secondary, color: c.muted },
  error: { ...type.secondary, color: c.danger },
  loading: { marginTop: space.xxl },

  hero: { flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.md },
  heroValue: { ...type.fare, color: c.ink },
  heroUnit: { ...type.body, color: c.muted },

  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.xs,
    height: BAR_MAX_HEIGHT + 28,
    marginTop: space.md,
  },
  barColumn: { flex: 1, alignItems: "center", gap: space.xs },
  bar: { width: "100%", borderRadius: radius.sm },
  barWorked: { backgroundColor: c.action },
  barIdle: { backgroundColor: c.lineStrong },
  // Hill amber, which appears as text and small marks only — never a surface.
  barGhost: { backgroundColor: c.hill, opacity: 0.45 },
  barDay: { ...type.secondary, color: c.muted },
  barDayGhost: { color: c.hill },
  ghostNote: { ...type.secondary, color: c.hill },

  card: {
    backgroundColor: c.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.line,
    padding: space.lg,
    gap: space.xs,
    marginTop: space.md,
    ...cardShadow,
  },
  cardTitle: { ...type.body, color: c.ink },
  cardBody: { ...type.secondary, color: c.muted },
  cardFigure: { ...type.bodyPlain, color: c.inkSoft, marginTop: space.sm },

  label: { ...type.label, color: c.muted },
  balance: { ...type.fareSmall, color: c.ink },
  owing: { ...type.secondary, color: c.hill, marginTop: space.xs },

  primary: { ...primaryButton, backgroundColor: c.action, marginTop: space.md },
  primaryPressed: { backgroundColor: c.actionPressed },
  primaryDisabled: { opacity: 0.4 },
  primaryLabel: { ...type.heading, color: c.onAction, letterSpacing: 0.5 },
});

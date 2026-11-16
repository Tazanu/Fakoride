/**
 * Every ride on this account.
 *
 * The API has listed a person's rides since the beginning and no screen asked
 * for them. A rider who wanted to dispute last Tuesday's fare had no way to
 * find last Tuesday's ride; a driver had his day's total and nothing behind it.
 *
 * Each row opens that ride's own screen, which is where "Something wrong?",
 * a failed payment's "Try again" and the rating already live — so this screen
 * only has to find the ride, not do anything with it. A ride that was never
 * paid says so on the row.
 *
 * Newest first, twenty at a time, with a cursor rather than page numbers:
 * rides arrive while you scroll.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CaretLeftIcon, CaretRightIcon } from "@/ui/icons";
import { ApiError } from "@/api/client";
import { rides, type RideSummary } from "@/api/session";
import { useSession } from "@/session/SessionProvider";
import { Appear, Press } from "@/ui/motion";
import { S } from "@/content/strings";
import { useLang, useT, type Phrase, type Translate } from "@/ui/i18n";
import { palette, radius, space, touch, type, xaf } from "@/theme";

const c = palette("light");

function statusLine(r: RideSummary): Phrase {
  switch (r.status) {
    case "COMPLETED":
      return S.rides.done;
    case "CANCELLED_BY_RIDER":
    case "CANCELLED_BY_DRIVER":
      return S.rides.cancelled;
    case "NO_DRIVER_FOUND":
      return S.rides.noTaxi;
    default:
      return S.rides.live;
  }
}

/** What a row says about the money, when there is something to say. */
function fareLine(r: RideSummary): { phrase: Phrase; bad: boolean } | null {
  switch (r.fare.state) {
    case "FAILED":
      return { phrase: S.rides.notPaid, bad: true };
    case "WAITING":
      return { phrase: S.rides.waiting, bad: false };
    case "PAID_IN_CASH":
      return { phrase: S.rides.paidCash, bad: false };
    default:
      return null;
  }
}

/** A ride that never happened: its price is struck through, not counted. */
const offTheBooks = (r: RideSummary) => r.status.startsWith("CANCELLED") || r.status === "NO_DRIVER_FOUND";

function dayOf(t: Translate, lang: string, iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `${t(S.when.today)}, ${time}`;
  if (days === 1) return `${t(S.when.yesterday)}, ${time}`;
  return `${d.toLocaleDateString(lang, { day: "numeric", month: "short" })}, ${time}`;
}

export default function Rides() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const lang = useLang();
  const { me } = useSession();
  const asDriver = me?.role === "DRIVER";

  const [rows, setRows] = useState<RideSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<Phrase | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await rides.list();
      setRows(page.trips);
      setNext(page.nextBefore);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.offline ? S.rides.offline : S.rides.couldNotLoad);
      setRows((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function older() {
    if (!next) return;
    setMore(true);
    try {
      const page = await rides.list(next);
      setRows((current) => [...(current ?? []), ...page.trips]);
      setNext(page.nextBefore);
    } catch (err) {
      setError(err instanceof ApiError && err.offline ? S.rides.offline : S.rides.couldNotLoad);
    } finally {
      setMore(false);
    }
  }

  function open(id: string) {
    if (asDriver) router.push({ pathname: "/(driver)/job/[id]", params: { id } });
    else router.push({ pathname: "/(rider)/trip/[id]", params: { id } });
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl }]}
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
      <Press onPress={() => router.back()} accessibilityLabel={t(S.signIn.goBack)} style={styles.back}>
        <CaretLeftIcon size={24} color={c.ink} />
      </Press>

      <Text style={styles.h1}>{t(S.rides.title)}</Text>

      {error ? <Text style={styles.error}>{t(error)}</Text> : null}

      {rows === null ? (
        <Text style={styles.quiet}>{t(S.rides.loading)}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.quiet}>{t(S.rides.nothing)}</Text>
      ) : (
        <View style={styles.list}>
          {rows.map((r, i) => {
            const money = fareLine(r);
            return (
              <Appear key={r.id} index={Math.min(i, 8)}>
                <Pressable
                  onPress={() => open(r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.pickupLabel} → ${r.dropLabel}, ${xaf(r.priceXaf)} FCFA, ${t(statusLine(r))}`}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowRuled, pressed && styles.pressed]}
                >
                  <View style={styles.grow}>
                    <Text style={styles.when}>{dayOf(t, lang, r.requestedAt)}</Text>
                    <Text style={styles.route} numberOfLines={2}>
                      {r.pickupLabel} → {r.dropLabel}
                    </Text>
                    <View style={styles.tags}>
                      <Text style={styles.status}>{t(statusLine(r))}</Text>
                      {money ? (
                        <Text style={[styles.tag, money.bad ? styles.tagBad : styles.tagQuiet]}>{t(money.phrase)}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.price, offTheBooks(r) && styles.priceOff]}>{xaf(r.priceXaf)}</Text>
                  <CaretRightIcon size={18} color={c.muted} />
                </Pressable>
              </Appear>
            );
          })}
        </View>
      )}

      {next ? (
        <Pressable
          onPress={() => void older()}
          disabled={more}
          accessibilityRole="button"
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Text style={styles.moreLabel}>{t(more ? S.rides.loading : S.rides.older)}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.xl, gap: space.md },
  pressed: { opacity: 0.6 },
  back: { width: touch.min, height: touch.min, justifyContent: "center", marginLeft: -space.sm },
  h1: { ...type.title, color: c.ink },
  error: { ...type.secondary, color: c.danger },
  quiet: { ...type.bodyPlain, color: c.muted },
  grow: { flexGrow: 1, flexShrink: 1, gap: 2 },

  list: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch.min,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  rowRuled: { borderTopWidth: 1, borderTopColor: c.line },
  when: { ...type.secondary, color: c.muted },
  route: { ...type.bodyStrong, color: c.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginTop: 2 },
  status: { ...type.secondary, color: c.inkSoft },
  tag: {
    ...type.secondaryStrong,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.chip,
    overflow: "hidden",
  },
  tagBad: { color: c.danger, backgroundColor: c.dangerTint },
  tagQuiet: { color: c.actionText, backgroundColor: c.actionTint },
  price: { ...type.bodyStrong, color: c.ink },
  priceOff: { color: c.muted, textDecorationLine: "line-through" },

  more: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: touch.min,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.controlEdge,
    backgroundColor: c.card,
  },
  moreLabel: { ...type.bodyStrong, color: c.inkSoft },
});

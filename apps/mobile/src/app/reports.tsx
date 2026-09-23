/**
 * What you told us, and what came back.
 *
 * The end-of-trip form has been promising that "a person reads this and
 * answers you within a day" since the day it was written, and until now there
 * was no screen where that answer could arrive. Ops typed replies into the
 * console and they went nowhere a rider could see.
 *
 * So the shape of this screen is the promise: your words, then the deadline we
 * set ourselves, then the reply. When we are late it says so — in the rider's
 * favour, not ours. A promise you only keep when it is convenient is a slogan.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CaretLeftIcon } from "@/ui/icons";
import { ApiError } from "@/api/client";
import { complaints, type MyComplaint } from "@/api/rider";
import { Appear, Press } from "@/ui/motion";
import { palette, radius, space, touch, type } from "@/theme";

const c = palette("light");

const CATEGORY: Record<string, string> = {
  FARE_DISPUTE: "The fare",
  DRIVER_CONDUCT: "The driver",
  RIDER_CONDUCT: "The rider",
  SAFETY: "Safety",
  LOST_ITEM: "Something left behind",
  APP_PROBLEM: "The app",
  OTHER: "Something else",
};

function when(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
}

/** How late we are, said plainly rather than hidden. */
function overdueBy(respondBy: string): string | null {
  const hours = Math.floor((Date.now() - new Date(respondBy).getTime()) / 3_600_000);
  if (hours < 1) return null;
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} past when we said`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} past when we said`;
}

export default function Reports() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<MyComplaint[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await complaints.mine();
      setRows(r.complaints);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.offline
          ? "No network. Pull down to try again."
          : "Could not load these right now.",
      );
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl },
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
      <Press onPress={() => router.back()} accessibilityLabel="Go back" style={styles.back}>
        <CaretLeftIcon size={24} color={c.ink} />
      </Press>

      <Text style={styles.h1}>What you told us</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {rows === null ? (
        <Text style={styles.quiet}>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.quiet}>
          Nothing yet. If a ride goes wrong, there is a link at the end of it — a person reads
          what you send and answers within a day.
        </Text>
      ) : (
        rows.map((r, i) => {
          const late = r.response === null ? overdueBy(r.respondBy) : null;
          return (
            <Appear key={r.id} index={i}>
              <View style={styles.card}>
                <View style={styles.head}>
                  <Text style={styles.category}>{CATEGORY[r.category] ?? r.category}</Text>
                  <Text style={styles.when}>{when(r.createdAt)}</Text>
                </View>

                <Text style={styles.message}>{r.message}</Text>

                {r.response ? (
                  <View style={styles.reply}>
                    <Text style={styles.replyWho}>Fako Ride</Text>
                    <Text style={styles.replyText}>{r.response}</Text>
                  </View>
                ) : late ? (
                  // Our failure, in our words, without being asked.
                  <View style={styles.lateBox}>
                    <Text style={styles.lateText}>
                      Still no answer — {late}. We are sorry. It is still on the list.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.waiting}>
                    <Text style={styles.waitingText}>A person is reading this. Answer within a day.</Text>
                  </View>
                )}
              </View>
            </Appear>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c.paper },
  page: { paddingHorizontal: space.xl, gap: space.md },

  back: { width: touch.min, height: touch.min, justifyContent: "center", marginLeft: -space.sm },
  h1: { ...type.title, color: c.ink },

  quiet: { ...type.body, lineHeight: 24, color: c.muted, marginTop: space.sm },
  error: { ...type.secondary, color: c.danger },

  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  category: { ...type.bodyStrong, color: c.ink },
  when: { ...type.secondary, color: c.muted },

  message: {
    ...type.body,
    lineHeight: 24,
    color: c.inkSoft,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: c.fill,
  },

  reply: {
    gap: 4,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: c.actionTint,
    borderWidth: 1,
    borderColor: c.actionTintEdge,
  },
  replyWho: { ...type.label, color: c.actionText },
  replyText: { ...type.body, lineHeight: 24, color: c.ink },

  waiting: { paddingTop: 2 },
  waitingText: { ...type.secondary, color: c.muted },

  lateBox: { padding: space.md, borderRadius: radius.sm, backgroundColor: c.amberTint },
  lateText: { ...type.secondary, lineHeight: 20, color: c.hill },
});

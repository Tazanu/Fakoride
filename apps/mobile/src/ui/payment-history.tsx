/**
 * Every movement of the driver's money.
 *
 * `GET /drivers/me/payments` has answered this since the payments module was
 * written and no screen ever asked. He could see a balance and press a button
 * to cash out, and nowhere could he check what had actually happened: which
 * morning a fee came out, whether last week's payout ever landed, why one
 * failed.
 *
 * This is his income. A money screen with a figure and no history is the point
 * at which a man stops believing the figure — and the whole argument for this
 * app over the roadside is that we take a small fixed fee and nothing else,
 * which is a claim he should be able to check rather than take on trust.
 *
 * Plain words over enum names. FAILED is not "failed", it is "did not go
 * through" and it says why underneath.
 */

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { money as wallet } from "@/api/driver";
import { Appear } from "@/ui/motion";
import { palette, radius, space, type, xaf } from "@/theme";

const c = palette("light");

type Row = {
  id: string;
  purpose: string;
  status: string;
  amountXaf: number;
  createdAt: string;
  confirmedAt: string | null;
  failureReason: string | null;
};

/** What the money was for, as he would say it. */
function purposeOf(purpose: string, amount: number): { label: string; incoming: boolean } {
  switch (purpose) {
    case "ACCESS_FEE":
      return { label: "Daily fee", incoming: false };
    case "DRIVER_PAYOUT":
      return { label: "Sent to your MoMo", incoming: true };
    case "TRIP_FARE":
      return { label: "Fare paid by phone", incoming: true };
    default:
      return { label: purpose.replace(/_/g, " ").toLowerCase(), incoming: amount > 0 };
  }
}

function stateOf(status: string): { label: string; style: object } {
  switch (status) {
    case "SUCCESSFUL":
      return { label: "Done", style: styles.done };
    case "PENDING":
    case "PROCESSING":
      return { label: "On its way", style: styles.pending };
    case "FAILED":
      return { label: "Did not go through", style: styles.failed };
    case "EXPIRED":
      return { label: "Timed out", style: styles.failed };
    default:
      return { label: status.toLowerCase(), style: styles.pending };
  }
}

function dayOf(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function PaymentHistory() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await wallet.payments();
      setRows(r.payments);
      setError(null);
    } catch (err) {
      // The balance above still stands. A missing history is not worth an alarm.
      setError(err instanceof ApiError && err.offline ? "No network." : null);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Every franc in and out</Text>

      {error ? <Text style={styles.quiet}>{error}</Text> : null}

      {rows.length === 0 ? (
        <Text style={styles.quiet}>
          Nothing yet. Your daily fee and anything we send you will be listed here.
        </Text>
      ) : (
        rows.map((r, i) => {
          const what = purposeOf(r.purpose, r.amountXaf);
          const state = stateOf(r.status);
          return (
            <Appear key={r.id} index={i}>
              <View style={[styles.row, i > 0 && styles.ruled]}>
                <View style={styles.grow}>
                  <Text style={styles.what}>{what.label}</Text>
                  <Text style={styles.when}>
                    {dayOf(r.createdAt)} · <Text style={state.style}>{state.label}</Text>
                  </Text>
                  {r.failureReason ? (
                    <Text style={styles.reason}>{r.failureReason}</Text>
                  ) : null}
                </View>
                <Text style={[styles.amount, what.incoming ? styles.in : styles.out]}>
                  {what.incoming ? "+" : "−"}
                  {xaf(Math.abs(r.amountXaf))}
                </Text>
              </View>
            </Appear>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.edge,
    backgroundColor: c.card,
  },
  title: { ...type.bodyStrong, color: c.ink },
  quiet: { ...type.secondary, lineHeight: 20, color: c.muted },

  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.sm },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  grow: { flexGrow: 1, flexShrink: 1 },

  what: { ...type.body, color: c.ink },
  when: { ...type.secondary, color: c.muted, marginTop: 2 },
  reason: { ...type.secondary, color: c.danger, marginTop: 2 },

  amount: { ...type.bodyStrong },
  in: { color: c.actionText },
  out: { color: c.inkSoft },

  done: { color: c.actionText },
  pending: { color: c.hill },
  failed: { color: c.danger },
});

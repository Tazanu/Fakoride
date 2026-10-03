/**
 * The money: what moved, what did not, and what to do about it.
 *
 * The API has always been able to list payments, ask the provider again about
 * one, run the daily-fee collection and charge a single driver's day past its
 * backoff — and its own comments say ops does those things "from the console".
 * There was no screen. A payment that failed was visible to nobody: not the
 * driver whose cash-out did not arrive, not the rider whose fare was stuck, and
 * not the person whose job it is to notice.
 *
 * Failed first, because that is the tab with work in it. Every failure carries
 * the provider's reason, verbatim — an operator needs to know whether the MoMo
 * account was empty or the number was wrong, and those call for different
 * phone calls.
 *
 * Anything that puts a USSD prompt on somebody's phone takes two clicks. A
 * prompt is a real interruption on a real handset, and charging a driver twice
 * by misclick is the fastest way to lose him.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, ops, type FeeSweep, type PaymentPurpose, type PaymentRow, type PaymentStatus } from "@/api";
import { Empty, ErrorLine, Panel, Section, Tabs } from "@/ui/Section";

type Tab = "FAILED" | "PENDING" | "SUCCESSFUL" | "ALL";

const TABS: { id: Tab; label: string }[] = [
  { id: "FAILED", label: "Failed" },
  { id: "PENDING", label: "Still moving" },
  { id: "SUCCESSFUL", label: "Paid" },
  { id: "ALL", label: "Everything" },
];

const PURPOSE: Record<PaymentPurpose, string> = {
  TRIP_FARE: "Fare by phone",
  ACCESS_FEE: "Daily fee",
  DRIVER_PAYOUT: "Payout to driver",
};

const STATUS: Record<PaymentStatus, string> = {
  CREATED: "Not sent yet",
  PENDING: "Waiting on the phone",
  SUCCESSFUL: "Paid",
  FAILED: "Failed",
  EXPIRED: "Timed out",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Douala",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sweepLine(s: FeeSweep): string {
  const parts = [
    `${s.attempted} charged now`,
    s.inFlight ? `${s.inFlight} already waiting on the phone` : null,
    s.deferred ? `${s.deferred} refused recently, left to retry later` : null,
    s.exhausted ? `${s.exhausted} out of attempts — call them` : null,
    s.belowFloor ? `${s.belowFloor} below the mobile money minimum` : null,
  ].filter(Boolean);
  return `${s.due} owed from earlier days: ${parts.join(", ")}.`;
}

/**
 * A button that needs a second click within five seconds.
 *
 * For anything that rings somebody's phone. The first click says what will
 * happen; only the second does it.
 */
function TwoStep({
  label,
  confirm,
  onConfirm,
  disabled,
  small,
}: {
  label: string;
  confirm: string;
  onConfirm: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      disabled={disabled}
      className={`ops-btn ${armed ? "ops-btn-warn" : "ops-btn-quiet"}${small ? " ops-btn-sm" : ""}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 5000);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

export function Money() {
  const [tab, setTab] = useState<Tab>("FAILED");
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [counts, setCounts] = useState<{ failed: number; stillMoving: number; provider: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (which: Tab) => {
    setRows(null);
    try {
      const r = await ops.payments(which === "ALL" ? undefined : which);
      setRows(r.payments);
      setCounts({ failed: r.failed, stillMoving: r.stillMoving, provider: r.provider });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load payments.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function act(key: string, run: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await run());
      await load(tab);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  const askAgain = (p: PaymentRow) =>
    act(p.id, async () => {
      const r = await ops.refreshPayment(p.id);
      return `The provider says: ${STATUS[r.providerSaid] ?? r.providerSaid}.`;
    });

  const chargeAgain = (p: PaymentRow) =>
    act(p.id, async () => {
      const r = await ops.collectFee(p.accessFeeChargeId!);
      return r.status === "FAILED"
        ? `Refused again: ${r.failureReason ?? "no reason given"}.`
        : `A prompt is on ${p.driver ?? p.phone}'s phone for ${r.amountXaf} FCFA.`;
    });

  const sweep = () =>
    act("sweep", async () => sweepLine(await ops.collectFees()));

  const line =
    counts === null
      ? "Loading…"
      : counts.failed === 0
        ? `Nothing has failed. ${counts.stillMoving} still on its way.`
        : `${counts.failed} failed, ${counts.stillMoving} still on its way.`;

  return (
    <Section title="Money" line={line} tabs={<Tabs value={tab} onChange={setTab} options={TABS} label="Payment status" />}>
      {counts?.provider === "fake" ? (
        <p style={styles.fake}>
          The API is on the FAKE payment provider. Nothing on this screen is real money until the Fapshi keys are set.
        </p>
      ) : null}

      <div style={styles.toolbar}>
        <TwoStep
          label="Run the daily-fee collection now"
          confirm="Confirm — this prompts every phone that owes a fee"
          onConfirm={() => void sweep()}
          disabled={busy !== null}
        />
        <span style={styles.toolbarHint}>It also runs by itself. Use this after an outage.</span>
      </div>

      <ErrorLine>{error}</ErrorLine>
      {notice ? <p style={styles.notice}>{notice}</p> : null}

      <Panel label="Payments">
        <div className="ops-table-head" style={COLUMNS}>
          <span style={styles.th}>WHAT</span>
          <span style={styles.th}>WHO</span>
          <span style={styles.th}>AMOUNT</span>
          <span style={styles.th}>STATE</span>
          <span style={styles.th}>WHEN</span>
          <span style={styles.th} />
        </div>

        {rows === null || rows.length === 0 ? (
          <Empty loading={rows === null}>{tab === "FAILED" ? "Nothing has failed." : "Nothing here."}</Empty>
        ) : (
          rows.map((p) => {
            const stuck = p.status === "CREATED" || p.status === "PENDING" || p.status === "FAILED";
            return (
              <div key={p.id} className="ops-table-row" style={COLUMNS}>
                <span style={styles.what}>{PURPOSE[p.purpose] ?? p.purpose}</span>
                <span data-label="Who" style={styles.who}>
                  {p.driver ?? p.phone}
                  {p.plate ? <span style={styles.sub}>{p.plate}</span> : null}
                </span>
                <span data-label="Amount" style={styles.amount}>
                  {p.amountXaf.toLocaleString("fr-FR")} FCFA
                </span>
                <span data-label="State" style={styles.cell}>
                  <span style={p.status === "SUCCESSFUL" ? styles.ok : p.status === "FAILED" || p.status === "EXPIRED" ? styles.bad : styles.waiting}>
                    {STATUS[p.status] ?? p.status}
                  </span>
                  {p.failureReason ? <span style={styles.reason}>{p.failureReason}</span> : null}
                </span>
                <span data-label="When" style={styles.muted}>
                  {when(p.createdAt)}
                </span>
                <span style={styles.actions}>
                  {stuck && p.providerTransId ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void askAgain(p)}
                      className="ops-btn ops-btn-sm ops-btn-ghost"
                    >
                      {busy === p.id ? "Asking…" : "Ask Fapshi again"}
                    </button>
                  ) : null}
                  {p.status === "FAILED" && p.purpose === "ACCESS_FEE" && p.accessFeeChargeId ? (
                    <TwoStep
                      small
                      label="Charge again"
                      confirm="Confirm — prompt his phone"
                      onConfirm={() => void chargeAgain(p)}
                      disabled={busy !== null}
                    />
                  ) : null}
                </span>
              </div>
            );
          })
        )}
      </Panel>
    </Section>
  );
}

const COLUMNS = { "--ops-cols": "1.1fr 1.4fr 0.9fr 1.6fr 1fr 1.4fr" } as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  th: { fontSize: 12, fontWeight: 700, letterSpacing: "0.4px", color: "var(--c-muted)" },

  fake: {
    margin: "0 0 14px",
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid var(--c-danger-edge)",
    background: "var(--c-card)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--c-danger)",
  },
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 14 },
  toolbarHint: { fontSize: 13, color: "var(--c-muted)" },
  notice: { margin: "0 0 14px", fontSize: 14, color: "var(--c-action-text)" },

  what: { fontSize: 14, fontWeight: 600, color: "var(--c-ink)" },
  who: { display: "flex", flexDirection: "column", gap: 2, fontSize: 14, color: "var(--c-ink)" },
  sub: { fontSize: 12, color: "var(--c-muted)", fontFamily: "var(--font-display)", letterSpacing: "0.4px" },
  amount: { fontSize: 14, fontWeight: 700, color: "var(--c-ink)" },
  cell: { display: "flex", flexDirection: "column", gap: 2, fontSize: 14 },
  ok: { fontWeight: 600, color: "var(--c-action-text)" },
  bad: { fontWeight: 600, color: "var(--c-danger)" },
  waiting: { fontWeight: 600, color: "var(--c-hill)" },
  reason: { fontSize: 12, color: "var(--c-ink-soft)" },
  muted: { fontSize: 13, color: "var(--c-ink-soft)" },
  actions: { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
};

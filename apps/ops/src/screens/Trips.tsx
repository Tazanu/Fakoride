/**
 * What is happening on the road right now.
 *
 * The number that matters here is not how many trips are running — it is how
 * long somebody has been standing at a junction with no driver. The API sends
 * `waitingSeconds` for exactly those, and a rider past two minutes gets a red
 * edge, because that is the point where a person starts walking to the road to
 * flag a taxi down instead.
 *
 * The live list refreshes itself every ten seconds. The finished lists do not:
 * they are history, and history does not move while you read it.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, ops, type TripRow, type TripStatus } from "@/api";
import { Empty, ErrorLine, Panel, Section, Tabs, money, since } from "@/ui/Section";

const TABS: { id: TripStatus; label: string }[] = [
  { id: "LIVE", label: "Live" },
  { id: "COMPLETED", label: "Finished" },
  { id: "CANCELLED_BY_RIDER", label: "Rider cancelled" },
  { id: "CANCELLED_BY_DRIVER", label: "Driver cancelled" },
  { id: "NO_DRIVER_FOUND", label: "Nobody came" },
  { id: "CANCELLED_BY_OPS", label: "Ended by us" },
];

const STATUS_LABEL: Record<TripRow["status"], string> = {
  REQUESTED: "Looking for a driver",
  OFFERED: "Offered",
  ACCEPTED: "Driver on the way",
  ARRIVED: "Driver waiting",
  IN_PROGRESS: "Riding",
  COMPLETED: "Finished",
  CANCELLED_BY_RIDER: "Rider cancelled",
  CANCELLED_BY_DRIVER: "Driver cancelled",
  NO_DRIVER_FOUND: "Nobody came",
  CANCELLED_BY_OPS: "Ended by us",
};

/** Past this, a rider gives up on the app and flags a taxi at the roadside. */
const TOO_LONG_SECONDS = 120;

function waitLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60}s`;
}

export function Trips() {
  const [tab, setTab] = useState<TripStatus>("LIVE");
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The ride whose "end it" box is open. One at a time. */
  const [ending, setEnding] = useState<string | null>(null);

  const load = useCallback(async (status: TripStatus, quiet = false) => {
    if (!quiet) setTrips(null);
    try {
      const r = await ops.trips(status);
      setTrips(r.trips);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load trips.");
      if (!quiet) setTrips([]);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  // Only the live list moves. Refreshing quietly keeps the rows in place
  // instead of blanking the screen every ten seconds while somebody reads it.
  // It holds still while a box is open: a list that reshuffles under a
  // half-typed reason is how the wrong ride gets ended.
  useEffect(() => {
    if (tab !== "LIVE" || ending !== null) return;
    const timer = setInterval(() => void load("LIVE", true), 10_000);
    return () => clearInterval(timer);
  }, [tab, load, ending]);

  const stranded = (trips ?? []).filter(
    (t) => t.waitingSeconds !== null && t.waitingSeconds >= TOO_LONG_SECONDS,
  ).length;

  return (
    <Section
      title="Live trips"
      line={
        trips === null
          ? "Loading…"
          : tab !== "LIVE"
            ? `${trips.length} ${trips.length === 1 ? "trip" : "trips"}.`
            : stranded > 0
              ? `${trips.length} running. ${stranded} ${stranded === 1 ? "rider has" : "riders have"} been waiting over two minutes.`
              : `${trips.length} running. Nobody has been waiting long.`
      }
      tabs={<Tabs value={tab} onChange={setTab} options={TABS} label="Trip status" />}
    >
      <ErrorLine>{error}</ErrorLine>

      <Panel label="Trips">
        <div className="ops-table-head" style={COLUMNS}>
          <span style={styles.th}>ROUTE</span>
          <span style={styles.th}>FARE</span>
          <span style={styles.th}>RIDER</span>
          <span style={styles.th}>DRIVER</span>
          <span style={styles.th}>STATE</span>
          <span style={styles.th} />
        </div>

        {trips === null || trips.length === 0 ? (
          <Empty loading={trips === null}>
            {tab === "LIVE" ? "Nothing on the road right now." : "Nothing in this list."}
          </Empty>
        ) : (
          trips.map((t) => {
            const late = t.waitingSeconds !== null && t.waitingSeconds >= TOO_LONG_SECONDS;
            const open = ending === t.id;
            return (
              <div key={t.id}>
              <div
                className="ops-table-row"
                style={COLUMNS}
                {...(late ? { "data-flag": "urgent" } : {})}
              >
                <span style={styles.route}>
                  {t.from} → {t.to}
                </span>
                <span data-label="Fare" style={styles.cell}>
                  <span style={styles.stack}>
                    <span>{money(t.priceXaf)}</span>
                    <span style={styles.method}>{t.paymentMethod === "CASH" ? "cash" : "MoMo"}</span>
                  </span>
                </span>
                <span data-label="Rider" style={styles.cellMuted}>
                  {t.rider ?? t.riderPhone}
                </span>
                <span data-label="Driver" style={styles.cellMuted}>
                  {t.driver ? `${t.driver} · ${t.plate}` : "—"}
                </span>
                <span data-label="State" style={styles.cell}>
                  <span style={styles.stack}>
                    <span style={late ? styles.stateLate : styles.state}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span style={styles.age}>
                      {t.waitingSeconds !== null
                        ? `waiting ${waitLabel(t.waitingSeconds)}`
                        : t.status === "IN_PROGRESS" && t.startedAt
                          ? `started ${since(t.startedAt)}`
                          : since(t.requestedAt)}
                    </span>
                  </span>
                </span>
                <span style={styles.rowAction}>
                  {tab === "LIVE" ? (
                    <button type="button" onClick={() => setEnding(open ? null : t.id)} style={styles.endButton}>
                      {open ? "Close" : "End it"}
                    </button>
                  ) : null}
                </span>
              </div>
              {open ? (
                <EndTrip
                  trip={t}
                  onDone={() => {
                    setEnding(null);
                    void load("LIVE", true);
                  }}
                />
              ) : null}
              </div>
            );
          })
        )}
      </Panel>
    </Section>
  );
}

/**
 * The way out of a ride that has died.
 *
 * Neither the rider nor the driver can cancel once a ride has started — that is
 * deliberate — so when a driver's phone breaks mid-trip the ride sits "in
 * progress", and because a rider may have one ride running, she cannot book
 * another. This is who can let her go.
 *
 * Two endings, and the difference between them is money, so each says what it
 * does to the fare before the button is pressed.
 */
function EndTrip({ trip, onDone }: { trip: TripRow; onDone: () => void }) {
  const started = trip.status === "IN_PROGRESS";
  const [how, setHow] = useState<"complete" | "cancel">(started ? "complete" : "cancel");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (text.trim().length < 5) {
      setError("Say why. It is kept on the ride with your name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.endTrip(trip.id, how, text.trim());
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const fare = `${money(trip.priceXaf)} ${trip.paymentMethod === "CASH" ? "cash" : "MoMo"}`;

  return (
    <div style={{ ...styles.act, ...(how === "cancel" ? styles.actWarn : null) }}>
      <div style={styles.actHead}>
        End {trip.from} → {trip.to}
      </div>

      {/* Buttons, not radio inputs: the console's form styling is written for text fields. */}
      <div style={styles.choices} role="radiogroup" aria-label="How to end it">
        <button
          type="button"
          role="radio"
          aria-checked={how === "complete"}
          disabled={!started || busy}
          onClick={() => setHow("complete")}
          style={{ ...styles.choice, ...(how === "complete" ? styles.choiceOn : null), ...(!started ? styles.choiceOff : null) }}
        >
          <strong>The ride happened.</strong>{" "}
          {started
            ? trip.paymentMethod === "CASH"
              ? `The driver is credited ${fare}, as if he had pressed Finish.`
              : `The rider's phone is prompted for ${fare}, as if he had pressed Finish.`
            : "Only once the driver has started it — this one has not."}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={how === "cancel"}
          disabled={busy}
          onClick={() => setHow("cancel")}
          style={{ ...styles.choice, ...(how === "cancel" ? styles.choiceOn : null) }}
        >
          <strong>It did not, or nobody can say.</strong> Nothing is charged and nothing is credited. The rider can book
          again at once.
        </button>
      </div>

      <label style={styles.field}>
        <span style={styles.label}>Why — kept on the ride</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Driver rang: phone screen broke at Mile 16, he dropped her at Molyko."
          rows={2}
          disabled={busy}
          className="ops-textarea"
          autoFocus
        />
      </label>
      {error ? <p style={styles.error}>{error}</p> : null}
      <button type="button" onClick={() => void go()} disabled={busy} style={how === "cancel" ? styles.confirmWarn : styles.confirm}>
        {busy ? "Working…" : how === "complete" ? "Finish this ride" : "Cancel this ride"}
      </button>
    </div>
  );
}

const COLUMNS = { "--ops-cols": "2.2fr 1fr 1.2fr 1.4fr 1.3fr 0.7fr" } as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  th: { fontSize: 12, fontWeight: 700, letterSpacing: "0.4px", color: "var(--c-muted)" },
  route: { fontSize: 14, fontWeight: 600, color: "var(--c-ink)" },
  cell: { fontSize: 14, color: "var(--c-ink)" },
  /* Two lines in one cell, without stopping the row collapsing on a phone. */
  stack: { display: "flex", flexDirection: "column", gap: 2 },
  cellMuted: { fontSize: 14, color: "var(--c-ink-soft)", overflow: "hidden", textOverflow: "ellipsis" },
  method: { fontSize: 12, color: "var(--c-muted)" },
  state: { fontSize: 14, color: "var(--c-ink)" },
  stateLate: { fontSize: 14, fontWeight: 700, color: "var(--c-danger)" },
  age: { fontSize: 12, color: "var(--c-muted)" },

  rowAction: { display: "flex", justifyContent: "flex-end" },
  endButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--c-ink-soft)",
  },

  act: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "16px 18px",
    background: "var(--c-action-tint)",
    borderBottom: "1px solid var(--c-line)",
  },
  actWarn: { background: "var(--c-amber-tint)" },
  actHead: { fontSize: 15, fontWeight: 700, color: "var(--c-ink)" },
  choices: { display: "flex", flexDirection: "column", gap: 8 },
  choice: {
    display: "block",
    width: "100%",
    padding: "10px 14px",
    borderRadius: 12,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontSize: 14,
    lineHeight: 1.5,
    textAlign: "left",
    color: "var(--c-ink)",
  },
  choiceOn: { borderColor: "var(--c-action)", boxShadow: "inset 0 0 0 1px var(--c-action)" },
  choiceOff: { opacity: 0.55 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },
  error: { margin: 0, fontSize: 13, color: "var(--c-danger)" },
  confirm: {
    alignSelf: "flex-start",
    minHeight: 46,
    padding: "0 20px",
    borderRadius: 12,
    border: 0,
    background: "var(--c-action)",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--c-on-action)",
  },
  confirmWarn: {
    alignSelf: "flex-start",
    minHeight: 46,
    padding: "0 20px",
    borderRadius: 12,
    border: 0,
    background: "var(--c-danger)",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--c-on-action)",
  },
};

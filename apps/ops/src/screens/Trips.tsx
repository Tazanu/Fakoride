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
  useEffect(() => {
    if (tab !== "LIVE") return;
    const timer = setInterval(() => void load("LIVE", true), 10_000);
    return () => clearInterval(timer);
  }, [tab, load]);

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
        </div>

        {trips === null || trips.length === 0 ? (
          <Empty loading={trips === null}>
            {tab === "LIVE" ? "Nothing on the road right now." : "Nothing in this list."}
          </Empty>
        ) : (
          trips.map((t) => {
            const late = t.waitingSeconds !== null && t.waitingSeconds >= TOO_LONG_SECONDS;
            return (
              <div
                key={t.id}
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
                        : since(t.requestedAt)}
                    </span>
                  </span>
                </span>
              </div>
            );
          })
        )}
      </Panel>
    </Section>
  );
}

const COLUMNS = { "--ops-cols": "2.2fr 1fr 1.2fr 1.4fr 1.3fr" } as React.CSSProperties;

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
};

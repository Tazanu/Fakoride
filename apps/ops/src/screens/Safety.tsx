/**
 * Open alarms.
 *
 * Somebody pressed the button in the app and is waiting to find out whether
 * anyone is coming. Everything on this screen is arranged around one action —
 * calling them — so both numbers are one tap away and the minutes since the
 * alarm are the largest thing on the card.
 *
 * Nothing here closes itself. An alarm stays open until a person says what
 * happened, and "false alarm" is a separate answer from "resolved" because the
 * two mean very different things when somebody reads this back later.
 *
 * It refreshes every ten seconds. This is the one screen where stale is unsafe.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, ops, type SosAlert } from "@/api";
import { Empty, ErrorLine, Section } from "@/ui/Section";

const ROLE: Record<string, string> = { RIDER: "Rider", DRIVER: "Driver" };

export function Safety({ onCount }: { onCount: (n: number) => void }) {
  const [alerts, setAlerts] = useState<SosAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setAlerts(null);
      try {
        const r = await ops.sos();
        setAlerts(r.alerts);
        onCount(r.open);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load alarms.");
        if (!quiet) setAlerts([]);
      }
    },
    [onCount],
  );

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const open = alerts?.length ?? 0;

  return (
    <Section
      title="Safety"
      line={
        alerts === null
          ? "Loading…"
          : open === 0
            ? "No alarms open. Nobody is waiting on you."
            : `${open} ${open === 1 ? "alarm" : "alarms"} open. Call before you write anything.`
      }
    >
      <ErrorLine>{error}</ErrorLine>

      {alerts === null || alerts.length === 0 ? (
        <section className="ops-card">
          <Empty loading={alerts === null}>No alarms open. Nobody is waiting on you.</Empty>
        </section>
      ) : (
        <div style={styles.list}>
          {alerts.map((a) => (
            <Alarm key={a.id} alert={a} onDone={() => void load()} />
          ))}
        </div>
      )}
    </Section>
  );
}

function Alarm({ alert, onDone }: { alert: SosAlert; onDone: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close(status: "ACKNOWLEDGED" | "RESOLVED" | "FALSE_ALARM") {
    // Acknowledging is just "I have seen this, I am on it" and needs no words.
    // Closing one does: the next person to read this needs to know what
    // happened, and "resolved" on its own tells them nothing.
    if (status !== "ACKNOWLEDGED" && outcome.trim().length < 5) {
      setError("Say what happened before closing this.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.resolveSos(alert.id, status, outcome.trim() || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const seen = alert.status === "ACKNOWLEDGED";

  return (
    <article style={styles.card}>
      <div style={styles.head}>
        <div>
          <div style={styles.who}>
            {alert.raisedByName ?? "Somebody"}
            <span style={styles.role}>{ROLE[alert.raisedByRole] ?? alert.raisedByRole}</span>
          </div>
          <div style={styles.route}>{alert.route}</div>
        </div>
        <div style={styles.clock}>
          <span style={styles.minutes}>{alert.minutesOpen}</span>
          <span style={styles.minutesLabel}>min open</span>
        </div>
      </div>

      {alert.note ? <p style={styles.note}>“{alert.note}”</p> : null}

      <div style={styles.calls}>
        <a href={`tel:${alert.raisedByPhone}`} style={styles.call}>
          Call {ROLE[alert.raisedByRole]?.toLowerCase() ?? "them"} · {alert.raisedByPhone}
        </a>
        {alert.driverPhone && alert.raisedByRole !== "DRIVER" ? (
          <a href={`tel:${alert.driverPhone}`} style={styles.callQuiet}>
            Call driver · {alert.driverName ?? alert.plate}
          </a>
        ) : null}
        {alert.lat !== null && alert.lng !== null ? (
          <a
            href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
            target="_blank"
            rel="noreferrer"
            style={styles.callQuiet}
          >
            Where they were
          </a>
        ) : (
          <span style={styles.noFix}>No location sent</span>
        )}
      </div>

      <label style={styles.field}>
        <span style={styles.label}>What happened</span>
        <textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Called him. He had pulled over at Mile 17, the rider had already got out."
          rows={2}
          disabled={busy}
          className="ops-textarea"
        />
      </label>

      {error ? <p style={styles.error}>{error}</p> : null}

      <div style={styles.actions}>
        {!seen ? (
          <button type="button" onClick={() => void close("ACKNOWLEDGED")} disabled={busy} className="ops-btn ops-btn-quiet">
            I am on it
          </button>
        ) : (
          <span style={styles.seen}>Acknowledged</span>
        )}
        <button type="button" onClick={() => void close("FALSE_ALARM")} disabled={busy} className="ops-btn ops-btn-ghost">
          False alarm
        </button>
        <button type="button" onClick={() => void close("RESOLVED")} disabled={busy} className="ops-btn ops-btn-primary">
          {busy ? "Working…" : "Resolved"}
        </button>
      </div>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: 14 },

  card: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 18,
    borderRadius: 16,
    background: "var(--c-card)",
    border: "1px solid var(--c-danger-edge)",
    boxShadow: "inset 4px 0 0 var(--c-danger)",
  },

  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  who: { display: "flex", alignItems: "baseline", gap: 10, fontSize: 18, fontWeight: 700, color: "var(--c-ink)" },
  role: { fontSize: 12, fontWeight: 600, letterSpacing: "0.4px", color: "var(--c-muted)" },
  route: { margin: "4px 0 0", fontSize: 14, color: "var(--c-ink-soft)" },

  clock: { display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 },
  minutes: { fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: "var(--c-danger)" },
  minutesLabel: { fontSize: 12, color: "var(--c-muted)" },

  note: {
    margin: 0,
    padding: "10px 14px",
    borderRadius: 12,
    background: "var(--c-fill)",
    fontSize: 15,
    lineHeight: 1.5,
    color: "var(--c-ink)",
  },

  calls: { display: "flex", flexWrap: "wrap", gap: 8 },
  call: {
    padding: "10px 14px",
    borderRadius: 12,
    background: "var(--c-action)",
    fontSize: 14,
    fontWeight: 700,
    color: "var(--c-on-action)",
    textDecoration: "none",
  },
  callQuiet: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1.5px solid var(--c-line-strong)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--c-action-text)",
    textDecoration: "none",
  },
  noFix: { alignSelf: "center", fontSize: 13, color: "var(--c-muted)" },

  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },

  error: { margin: 0, fontSize: 13, color: "var(--c-danger)" },

  actions: { display: "flex", flexWrap: "wrap", gap: 10 },
  seen: { alignSelf: "center", fontSize: 13, fontWeight: 600, color: "var(--c-action-text)" },
};

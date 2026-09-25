/**
 * What people have told us went wrong.
 *
 * The app promised the rider a human answers within a day, and the API sorts
 * by that deadline rather than by date, so the oldest promise is at the top
 * whether or not it is the oldest complaint. Overdue rows carry an amber edge
 * and say how late they are. A promise you cannot see yourself breaking is a
 * promise you break quietly.
 *
 * Answering needs words — there is no "mark as handled" button — and closing
 * is a separate tick from answering, so a reply that opens a conversation does
 * not silently end it.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, ops, type Complaint, type ComplaintStatus } from "@/api";
import { Empty, ErrorLine, Section, Tabs, money, since } from "@/ui/Section";

const TABS: { id: ComplaintStatus; label: string }[] = [
  { id: "OPEN", label: "Open" },
  { id: "ANSWERED", label: "Answered" },
  { id: "CLOSED", label: "Closed" },
];

/** The enum as the schema spells it, in the words an operator would use. */
const CATEGORY: Record<string, string> = {
  FARE_DISPUTE: "The fare",
  DRIVER_CONDUCT: "The driver",
  RIDER_CONDUCT: "The rider",
  SAFETY: "Safety",
  LOST_ITEM: "Something left behind",
  APP_PROBLEM: "The app",
  OTHER: "Something else",
};

/** How late, in the words somebody would actually use. */
function lateBy(respondBy: string): string {
  const minutes = Math.floor((Date.now() - new Date(respondBy).getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min late`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h late`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} late`;
}

export function Complaints({ onCount }: { onCount: (n: number) => void }) {
  const [tab, setTab] = useState<ComplaintStatus>("OPEN");
  const [rows, setRows] = useState<Complaint[] | null>(null);
  const [overdue, setOverdue] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (status: ComplaintStatus) => {
      setRows(null);
      try {
        const r = await ops.complaints(status);
        setRows(r.complaints);
        setError(null);
        if (status === "OPEN") {
          setOverdue(r.overdue);
          onCount(r.complaints.length);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load complaints.");
        setRows([]);
      }
    },
    [onCount],
  );

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  return (
    <Section
      title="Complaints"
      line={
        rows === null
          ? "Loading…"
          : tab !== "OPEN"
            ? `${rows.length} ${rows.length === 1 ? "complaint" : "complaints"}.`
            : rows.length === 0
              ? "Nothing open. Everybody has had an answer."
              : overdue > 0
                ? `${rows.length} open, and ${overdue} past the day we promised.`
                : `${rows.length} open, all still inside the day we promised.`
      }
      tabs={<Tabs value={tab} onChange={setTab} options={TABS} label="Complaint status" />}
    >
      <ErrorLine>{error}</ErrorLine>

      {rows === null || rows.length === 0 ? (
        <section className="ops-card">
          <Empty loading={rows === null}>Nothing in this list.</Empty>
        </section>
      ) : (
        <div style={styles.list}>
          {rows.map((c) => (
            <Row key={c.id} complaint={c} readOnly={tab === "CLOSED"} onDone={() => void load(tab)} />
          ))}
        </div>
      )}
    </Section>
  );
}

function Row({
  complaint,
  readOnly,
  onDone,
}: {
  complaint: Complaint;
  readOnly: boolean;
  onDone: () => void;
}) {
  const [reply, setReply] = useState("");
  const [close, setClose] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (reply.trim().length < 5) {
      setError("Write an answer the person can read.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.respond(complaint.id, reply.trim(), close);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article style={{ ...styles.card, ...(complaint.overdue ? styles.cardLate : null) }}>
      <div style={styles.head}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.category}>{CATEGORY[complaint.category] ?? complaint.category}</div>
          <div style={styles.from}>
            {complaint.from ?? "No name"} · {complaint.phone}
          </div>
        </div>
        {complaint.overdue ? (
          <span style={styles.late}>{lateBy(complaint.respondBy)}</span>
        ) : (
          <span style={styles.age}>{since(complaint.createdAt)} ago</span>
        )}
      </div>

      <p style={styles.message}>{complaint.message}</p>

      {complaint.route ? (
        <div style={styles.trip}>
          <span>{complaint.route}</span>
          {complaint.priceXaf !== null ? <span>{money(complaint.priceXaf)}</span> : null}
          {complaint.plate ? <span>{complaint.plate}</span> : null}
        </div>
      ) : null}

      {!readOnly ? (
        <>
          <label style={styles.field}>
            <span style={styles.label}>Your answer — this is sent to them</span>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="We checked the fare for that trip. 700 XAF is the set price from Molyko to Mile 17."
              rows={3}
              disabled={busy}
              className="ops-textarea"
            />
          </label>

          {error ? <p style={styles.error}>{error}</p> : null}

          <div style={styles.actions}>
            <label style={styles.check}>
              <input
                type="checkbox"
                checked={close}
                onChange={(e) => setClose(e.target.checked)}
                disabled={busy}
                style={styles.checkbox}
              />
              <span>Close it — this answers everything</span>
            </label>
            <button type="button" onClick={() => void send()} disabled={busy} className="ops-btn ops-btn-primary">
              {busy ? "Sending…" : close ? "Answer and close" : "Answer"}
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: 14 },

  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 18,
    borderRadius: 16,
    background: "var(--c-card)",
    border: "1px solid var(--c-edge)",
  },
  cardLate: { boxShadow: "inset 4px 0 0 var(--c-amber)" },

  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  category: { fontSize: 17, fontWeight: 700, color: "var(--c-ink)" },
  from: { margin: "3px 0 0", fontSize: 13, color: "var(--c-muted)" },
  late: { flexShrink: 0, fontSize: 13, fontWeight: 700, color: "var(--c-hill)" },
  age: { flexShrink: 0, fontSize: 13, color: "var(--c-muted)" },

  message: {
    margin: 0,
    padding: "12px 14px",
    borderRadius: 12,
    background: "var(--c-fill)",
    fontSize: 15,
    lineHeight: 1.55,
    color: "var(--c-ink)",
  },

  trip: { display: "flex", flexWrap: "wrap", gap: 14, fontSize: 13, color: "var(--c-ink-soft)" },

  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },

  error: { margin: 0, fontSize: 13, color: "var(--c-danger)" },

  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--c-ink-soft)" },
  checkbox: { width: 18, height: 18, accentColor: "var(--c-action)" },
};

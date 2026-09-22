/**
 * Everybody on the road, and everybody taken off it.
 *
 * Driver approvals is where somebody gets let in. This is the list afterwards,
 * and the only two things it does are the two that change whether a man can
 * work tomorrow: suspending and reinstating.
 *
 * Suspending needs a reason in writing. It is recorded against the driver, it
 * knocks him offline immediately, and he will ask why — so the box is not
 * optional and there is no confirm-dialog shortcut around it.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, ops, type DriverStatus, type QueueDriver } from "@/api";
import { Empty, ErrorLine, Panel, Section, Tabs } from "@/ui/Section";

const TABS: { id: DriverStatus; label: string }[] = [
  { id: "ACTIVE", label: "Working" },
  { id: "SUSPENDED", label: "Suspended" },
  { id: "REJECTED", label: "Turned down" },
  { id: "PENDING_REVIEW", label: "Waiting" },
];

const LINE: Record<DriverStatus, (n: number) => string> = {
  ACTIVE: (n) => `${n} ${n === 1 ? "driver" : "drivers"} can accept rides.`,
  SUSPENDED: (n) =>
    n === 0 ? "Nobody is suspended." : `${n} ${n === 1 ? "driver is" : "drivers are"} off the road.`,
  REJECTED: (n) => `${n} ${n === 1 ? "application was" : "applications were"} turned down.`,
  PENDING_REVIEW: (n) =>
    n === 0 ? "Nobody is waiting." : `${n} waiting — Driver approvals is where you read them.`,
};

export function Drivers() {
  const [tab, setTab] = useState<DriverStatus>("ACTIVE");
  const [drivers, setDrivers] = useState<QueueDriver[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async (status: DriverStatus) => {
    setDrivers(null);
    setActing(null);
    try {
      const r = await ops.drivers(status);
      setDrivers(r.drivers);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load drivers.");
      setDrivers([]);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  return (
    <Section
      title="All drivers"
      line={drivers === null ? "Loading…" : LINE[tab](drivers.length)}
      tabs={<Tabs value={tab} onChange={setTab} options={TABS} label="Driver status" />}
    >
      <ErrorLine>{error}</ErrorLine>

      <Panel label="Drivers">
        <div className="ops-table-head" style={COLUMNS}>
          <span style={styles.th}>DRIVER</span>
          <span style={styles.th}>PLATE</span>
          <span style={styles.th}>USUAL ZONE</span>
          <span style={styles.th}>PAPERS</span>
          <span style={styles.th} />
        </div>

        {drivers === null || drivers.length === 0 ? (
          <Empty loading={drivers === null}>Nobody in this list.</Empty>
        ) : (
          drivers.map((d) => {
            const open = acting === d.id;
            return (
              <div key={d.id}>
                <div className="ops-table-row" style={COLUMNS}>
                  <span style={styles.name}>
                    {d.name ?? "No name"}
                    <span style={styles.phone}>{d.phone}</span>
                  </span>
                  <span data-label="Plate" style={styles.plate}>
                    {d.plate}
                  </span>
                  <span data-label="Usual zone" style={styles.cellMuted}>
                    {d.homeZone ?? "Not given"}
                  </span>
                  <span data-label="Papers" style={styles.cell}>
                    <span style={d.hasDocuments ? styles.papersOk : styles.papersShort}>
                      {d.documentsHeld} of {d.documentsRequired}
                    </span>
                  </span>
                  <span style={styles.rowAction}>
                    {tab === "ACTIVE" || tab === "SUSPENDED" ? (
                      <button
                        type="button"
                        onClick={() => setActing(open ? null : d.id)}
                        style={tab === "ACTIVE" ? styles.suspendButton : styles.reinstateButton}
                      >
                        {open ? "Cancel" : tab === "ACTIVE" ? "Suspend" : "Put back on"}
                      </button>
                    ) : null}
                  </span>
                </div>

                {open ? (
                  <Act
                    driver={d}
                    kind={tab === "ACTIVE" ? "suspend" : "reinstate"}
                    onDone={() => void load(tab)}
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

/** The reason box that opens under a row. */
function Act({
  driver,
  kind,
  onDone,
}: {
  driver: QueueDriver;
  kind: "suspend" | "reinstate";
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suspending = kind === "suspend";

  async function go() {
    // Reinstating is giving somebody their work back and needs no defence.
    // Taking it away does: he is told, and somebody will read this later.
    if (suspending && text.trim().length < 5) {
      setError("Say why. He is told this, and it stays on his record.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (suspending) await ops.suspend(driver.id, text.trim());
      else await ops.reinstate(driver.id, text.trim() || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...styles.act, ...(suspending ? styles.actWarn : null) }}>
      <div style={styles.actHead}>
        {suspending ? "Take " : "Put "}
        {driver.name ?? driver.plate}
        {suspending ? " off the road" : " back on the road"}
      </div>
      {suspending ? (
        <p style={styles.actNote}>
          He goes offline the moment you do this, and any trip he is holding is his last one
          today.
        </p>
      ) : null}
      <label style={styles.field}>
        <span style={styles.label}>
          {suspending ? "Why — he is told this" : "A note for the record (optional)"}
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            suspending
              ? "Three riders reported he refuses the app price and asks for more."
              : "Spoke to him. He understands the price is the price."
          }
          rows={2}
          disabled={busy}
          style={styles.textarea}
          autoFocus
        />
      </label>
      {error ? <p style={styles.error}>{error}</p> : null}
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        style={suspending ? styles.confirmWarn : styles.confirm}
      >
        {busy ? "Working…" : suspending ? "Suspend this driver" : "Put him back on"}
      </button>
    </div>
  );
}

const COLUMNS = { "--ops-cols": "1.8fr 1.1fr 1.2fr 0.9fr 1.1fr" } as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  th: { fontSize: 12, fontWeight: 700, letterSpacing: "0.4px", color: "var(--c-muted)" },

  name: { display: "flex", flexDirection: "column", gap: 2, fontSize: 14, fontWeight: 600, color: "var(--c-ink)" },
  phone: { fontSize: 12, fontWeight: 400, color: "var(--c-muted)" },
  plate: { fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, letterSpacing: "0.4px", color: "var(--c-ink)" },
  cell: { fontSize: 14 },
  cellMuted: { fontSize: 14, color: "var(--c-ink-soft)" },
  papersOk: { fontSize: 13, fontWeight: 600, color: "var(--c-action-text)" },
  papersShort: { fontSize: 13, fontWeight: 600, color: "var(--c-hill)" },

  rowAction: { display: "flex", justifyContent: "flex-end" },
  suspendButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1.5px solid var(--c-danger-edge)",
    background: "var(--c-card)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--c-danger)",
  },
  reinstateButton: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--c-action-text)",
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
  actNote: { margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--c-ink-soft)" },

  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },
  textarea: {
    resize: "vertical",
    minHeight: 58,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontFamily: "var(--font-ui)",
    fontSize: 15,
    lineHeight: 1.45,
    color: "var(--c-ink)",
  },

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

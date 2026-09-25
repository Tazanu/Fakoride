/**
 * The driver approval queue.
 *
 * The reason this console exists. Nobody may be dispatched a passenger until a
 * person has looked at their ID and said yes, so this screen's whole job is to
 * make that judgement quick and hard to get wrong.
 *
 * Two panels: the application being read, and the queue it came from. The
 * queue stays visible while the application is open because "how many more"
 * changes how carefully somebody reads — and hiding it behind a back button
 * turns seven applications into seven navigations.
 *
 * The document count is the column that matters. An application missing a
 * photograph cannot be approved at all, so it is coloured amber in the list
 * and says so plainly on the panel, rather than letting somebody read three
 * fields and press a button that will fail.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchDocumentUrl,
  ops,
  type DocumentKind,
  type DocumentRow,
  type DriverStatus,
  type QueueDriver,
} from "@/api";

const TABS: { id: DriverStatus; label: string }[] = [
  { id: "PENDING_REVIEW", label: "Pending" },
  { id: "ACTIVE", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
];

const DOC_LABEL: Record<DocumentKind, string> = {
  NATIONAL_ID: "National ID",
  VEHICLE_REGISTRATION: "Car papers",
  DRIVER_PHOTO: "Face photo",
};

function initials(name: string | null): string {
  if (!name) return "?";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** "2 hours", "1 day" — the column reads as a delay, not a timestamp. */
function waited(appliedAt: string): string {
  const ms = Date.now() - new Date(appliedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The same delay as a sentence.
 *
 * "just now" is already a whole phrase, and hanging "ago" off it gave the card
 * "Applied just now ago". A duration wants the "ago"; an adverb does not.
 */
function appliedPhrase(appliedAt: string): string {
  const delay = waited(appliedAt);
  return delay === "just now" ? "Applied just now" : `Applied ${delay} ago`;
}

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "That did not work. Try again.";
  switch (err.code) {
    case "offline":
      return "Could not reach the API. Is it running?";
    case "already_active":
      return "This driver is already approved.";
    case "documents_missing":
      return "This driver has not sent every document. Use “Approve without them” if you have seen them yourself.";
    case "override_needs_reason":
      return "Say where you saw the documents before approving without them.";
    case "invalid_request":
      return "The licence number is required, and the reason must be a sentence.";
    default:
      return err.message;
  }
}

export function Approvals({ onCount }: { onCount: (n: number) => void }) {
  const [tab, setTab] = useState<DriverStatus>("PENDING_REVIEW");
  const [drivers, setDrivers] = useState<QueueDriver[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  /**
   * Choosing somebody from the list.
   *
   * On one column the applicant opens underneath the list, off the bottom of
   * the screen, so the tap looks like it did nothing at all — bring the card
   * up to meet it. This hangs off the tap rather than off `selectedId`,
   * because the first row is selected for you when the queue loads, and being
   * dropped halfway down a page you have not read yet is worse than the
   * problem it fixes. Side by side there is nothing to scroll to.
   */
  function choose(id: string): void {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 900px)").matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const load = useCallback(
    async (status: DriverStatus) => {
      setDrivers(null);
      try {
        const r = await ops.drivers(status);
        setDrivers(r.drivers);
        setSelectedId((current) =>
          current && r.drivers.some((d) => d.id === current) ? current : (r.drivers[0]?.id ?? null),
        );
        if (status === "PENDING_REVIEW") onCount(r.drivers.length);
        setError(null);
      } catch (err) {
        setDrivers([]);
        setError(errorFor(err));
      }
    },
    [onCount],
  );

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const selected = drivers?.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="ops-page">
      <header className="ops-page-head">
        <div>
          <h1 className="ops-title">Driver approvals</h1>
          <p style={styles.subtitle}>
            {drivers === null
              ? "Loading…"
              : tab === "PENDING_REVIEW"
                ? `${drivers.length} ${drivers.length === 1 ? "application" : "applications"} waiting. No driver can accept a ride until you approve them.`
                : `${drivers.length} ${drivers.length === 1 ? "driver" : "drivers"}.`}
          </p>
        </div>

        <div className="ops-tabs" role="tablist" aria-label="Application status">
          {TABS.map((t) => {
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className="ops-tab"
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}

      <div className="ops-panels">
        <section ref={detailRef} className="ops-card ops-detail" aria-label="Application">
          {selected ? (
            <Application
              key={selected.id}
              driver={selected}
              readOnly={tab !== "PENDING_REVIEW"}
              onDone={() => void load(tab)}
            />
          ) : (
            <div style={styles.empty}>
              <p style={styles.emptyText}>
                {drivers === null ? "Loading…" : "Nothing here. That is a good thing."}
              </p>
            </div>
          )}
        </section>

        <section className="ops-card ops-queue" aria-label="Queue">
          <div className="ops-table-head" style={COLUMNS}>
            <span style={styles.th}>DRIVER</span>
            <span style={styles.th}>PLATE</span>
            <span style={styles.th}>DOCUMENTS</span>
            <span style={styles.th}>WAITING</span>
          </div>

          {drivers === null ? (
            <p style={styles.loading}>Loading…</p>
          ) : drivers.length === 0 ? (
            <p style={styles.loading}>Nobody in this list.</p>
          ) : (
            drivers.map((d) => {
              const on = d.id === selectedId;
              const short = d.documentsHeld < d.documentsRequired;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => choose(d.id)}
                  aria-current={on ? "true" : undefined}
                  className="ops-table-row"
                  style={COLUMNS}
                >
                  <span style={{ ...styles.cell, fontWeight: on ? 700 : 600 }}>
                    {d.name ?? "No name"}
                  </span>
                  <span data-label="Plate" style={styles.cellMuted}>
                    {d.plate}
                  </span>
                  <span
                    data-label="Papers"
                    style={{ ...styles.cell, color: short ? "var(--c-hill)" : "var(--c-action-text)", fontWeight: 600 }}
                  >
                    {d.documentsHeld} of {d.documentsRequired}
                  </span>
                  <span data-label="Waiting" style={styles.cellMuted}>
                    {waited(d.appliedAt)}
                  </span>
                </button>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

/** One application, read and acted on. */
function Application({
  driver,
  readOnly,
  onDone,
}: {
  driver: QueueDriver;
  readOnly: boolean;
  onDone: () => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [licence, setLicence] = useState("");
  const [rejecting, setRejecting] = useState(false);
  /** Set when ops chooses to approve somebody whose photographs are not all here. */
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ kind: DocumentKind; url: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void ops
      .documents(driver.id)
      .then((r) => alive && setDocs(r.documents))
      .catch(() => alive && setDocs([]));
    return () => {
      alive = false;
    };
  }, [driver.id]);

  // A blob URL is a live handle on memory; letting them pile up leaks.
  useEffect(() => {
    return () => {
      if (viewing) URL.revokeObjectURL(viewing.url);
    };
  }, [viewing]);

  async function open(kind: DocumentKind) {
    setError(null);
    try {
      const url = await fetchDocumentUrl(driver.id, kind);
      setViewing((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { kind, url };
      });
    } catch (err) {
      setError(errorFor(err));
    }
  }

  async function approve() {
    if (!licence.trim()) {
      setError("Type the licence number off the card before approving.");
      return;
    }
    // The API refuses an override without a reason, so catch it here where the
    // person can still fix it rather than bouncing them off a 400.
    if (short && reason.trim().length < 5) {
      setError("Say where you saw the documents before approving without them.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.verify(driver.id, licence.trim(), short ? reason.trim() : undefined, short);
      onDone();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Rejecting asks for a reason in the card, not in a browser prompt.
   *
   * The driver is shown this sentence, so it is the most consequential text
   * anybody types in this console. `window.prompt` gave it an unstyled box
   * that Chrome can suppress outright, and a reason under five characters
   * was dropped on the floor without a word.
   */
  async function reject() {
    const text = reason.trim();
    if (text.length < 5) {
      setError("Say why, in a sentence the driver can act on.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.reject(driver.id, text);
      onDone();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  const held = new Set((docs ?? []).map((d) => d.kind));
  const short = driver.documentsHeld < driver.documentsRequired;

  return (
    <>
      <div style={styles.appHead}>
        <span style={styles.avatar}>{initials(driver.name)}</span>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={styles.appName}>{driver.name ?? "No name"}</div>
          <div style={styles.appMeta}>
            {appliedPhrase(driver.appliedAt)}
            {driver.homeZone ? ` · ${driver.homeZone}` : ""}
          </div>
        </div>
        <span style={styles.pending}>{readOnly ? "REVIEWED" : "PENDING"}</span>
      </div>

      <div className="ops-app-body">
      <dl style={styles.facts}>
        <Fact label="Phone" value={driver.phone} />
        <Fact label="Plate number" value={driver.plate} mono />
        <Fact label="Usual zone" value={driver.homeZone ?? "Not given"} />
        <Fact label="Vehicle" value={driver.vehicleType === "CAR" ? "Taxi" : "Moto"} />
      </dl>

      <div style={styles.docsHead}>
        <span style={styles.docsLabel}>Documents</span>
        {short ? (
          <span style={styles.docsShort}>
            {driver.documentsHeld} of {driver.documentsRequired} — cannot approve yet
          </span>
        ) : null}
      </div>

      <div style={styles.docsGrid}>
        {(["NATIONAL_ID", "VEHICLE_REGISTRATION", "DRIVER_PHOTO"] as DocumentKind[]).map((kind) => {
          const there = held.has(kind);
          return (
            <button
              key={kind}
              type="button"
              disabled={!there}
              onClick={() => void open(kind)}
              style={{ ...styles.doc, ...(there ? null : styles.docMissing) }}
              title={there ? "Open this document" : "Not sent yet"}
            >
              <DocIcon kind={kind} present={there} />
              <span style={styles.docName}>{DOC_LABEL[kind]}</span>
              {!there ? <span style={styles.docMissingText}>Not sent</span> : null}
            </button>
          );
        })}
      </div>

      {viewing ? (
        <div style={styles.viewer}>
          <img src={viewing.url} alt={DOC_LABEL[viewing.kind]} style={styles.viewerImg} />
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(viewing.url);
              setViewing(null);
            }}
            className="ops-btn ops-btn-quiet"
          >
            Close {DOC_LABEL[viewing.kind]}
          </button>
        </div>
      ) : null}

      {error ? <p style={styles.appError}>{error}</p> : null}
      </div>

      {!readOnly ? (
        <div style={styles.actions}>
          {rejecting ? (
            <label style={styles.licence}>
              <span style={styles.licenceLabel}>Why? The driver is told this.</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="The registration is in somebody else's name."
                disabled={busy}
                rows={2}
                autoFocus
                className="ops-textarea"
              />
            </label>
          ) : (
            <>
              <label style={styles.licence}>
                <span style={styles.licenceLabel}>Licence number, off the card</span>
                <input
                  value={licence}
                  onChange={(e) => setLicence(e.target.value)}
                  placeholder="SW-LIC-4192"
                  disabled={busy}
                />
              </label>

              {/*
                Approving without every photograph is possible and deliberate.
                The reason is not paperwork: it is the only thing that will
                tell the next person why an unchecked driver is on the road.
              */}
              {short && overriding ? (
                <label style={styles.licence}>
                  <span style={styles.licenceLabel}>
                    Where did you see the missing documents?
                  </span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="He brought the card and the registration to the office; his phone would not upload."
                    disabled={busy}
                    rows={2}
                    autoFocus
                    className="ops-textarea"
                  />
                </label>
              ) : null}
            </>
          )}
          <div style={styles.buttons}>
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (rejecting) {
                  void reject();
                } else {
                  setRejecting(true);
                }
              }}
              disabled={busy}
              className="ops-btn ops-btn-quiet"
            >
              {rejecting ? "Confirm rejection" : "Reject"}
            </button>
            {rejecting ? (
              <button
                type="button"
                onClick={() => {
                  setRejecting(false);
                  setReason("");
                  setError(null);
                }}
                disabled={busy}
                className="ops-btn ops-btn-quiet"
              >
                Cancel
              </button>
            ) : short && !overriding ? (
              <button
                type="button"
                onClick={() => {
                  setOverriding(true);
                  setError(null);
                }}
                disabled={busy}
                className="ops-btn ops-btn-warn"
                title="Only if you have seen the documents yourself"
              >
                Approve without them
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void approve()}
                disabled={busy}
                className="ops-btn ops-btn-primary" style={{ ...(busy ? styles.approveOff : null) }}
              >
                {busy ? "Working…" : short ? "Approve anyway" : "Approve driver"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.factLabel}>{label}</dt>
      <dd style={{ ...styles.factValue, ...(mono ? styles.factMono : null) }}>{value}</dd>
    </div>
  );
}

function DocIcon({ kind, present }: { kind: DocumentKind; present: boolean }) {
  const stroke = present ? "var(--c-action-text)" : "var(--c-muted)";
  if (kind === "DRIVER_PHOTO") {
    return (
      <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
        <circle cx={12} cy={9} r={3.6} fill="none" stroke={stroke} strokeWidth={1.7} />
        <path
          d="M5 19.5 C5 15.9 8.1 13.8 12 13.8 C15.9 13.8 19 15.9 19 19.5"
          fill="none"
          stroke={stroke}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
      <rect x={3} y={5} width={18} height={14} rx={2.5} fill="none" stroke={stroke} strokeWidth={1.7} />
      <circle cx={8.5} cy={10} r={1.8} fill="none" stroke={stroke} strokeWidth={1.7} />
      <path
        d="M4 17 L10 12 L14 15 L17.5 12.5 L20 15"
        fill="none"
        stroke={stroke}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}

const COLUMNS = { "--ops-cols": "1.6fr 1fr 1fr 1fr" } as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  subtitle: { margin: "6px 0 0", fontSize: 14, color: "var(--c-muted)" },


  error: { margin: 0, fontSize: 14, color: "var(--c-danger)" },


  empty: { display: "grid", placeItems: "center", flexGrow: 1, padding: 32 },
  emptyText: { fontSize: 15, color: "var(--c-muted)", textAlign: "center" },

  appHead: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 18px",
    background: "var(--c-action-tint)",
    borderBottom: "1px solid var(--c-action-tint-edge)",
  },
  avatar: {
    display: "grid",
    placeItems: "center",
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "var(--c-action)",
    color: "var(--c-on-action)",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 15,
    flexShrink: 0,
  },
  appName: { fontSize: 15, fontWeight: 700, color: "var(--c-ink)" },
  appMeta: { fontSize: 13, color: "var(--c-ink-soft)", marginTop: 2 },
  pending: {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: "0 10px",
    borderRadius: 13,
    background: "var(--c-amber-tint)",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--c-hill)",
    flexShrink: 0,
  },

  /**
   * Everything between the head and the buttons scrolls.
   *
   * `detail` is a fixed-height card with overflow hidden, so without this the
   * card silently ate whatever did not fit — and the first thing off the bottom
   * was the approve/reject bar. Opening a document pushed it out of reach on
   * any laptop shorter than about 900px, with no scrollbar to say so.
   */

  facts: { margin: 0, padding: "4px 18px" },
  fact: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "13px 0",
    borderTop: "1px solid var(--c-line)",
  },
  factLabel: { fontSize: 14, color: "var(--c-muted)" },
  factValue: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--c-ink)", textAlign: "right" },
  factMono: { fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.5px" },

  docsHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 18px 0",
  },
  docsLabel: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },
  docsShort: { fontSize: 13, fontWeight: 600, color: "var(--c-hill)" },

  docsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    padding: "10px 18px 18px",
  },
  doc: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 104,
    borderRadius: 12,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-fill)",
    fontSize: 12,
  },
  docMissing: { borderStyle: "dashed", background: "transparent", opacity: 0.7 },
  docName: { fontSize: 12, fontWeight: 600, color: "var(--c-ink-soft)" },
  docMissingText: { fontSize: 11, color: "var(--c-muted)" },

  viewer: { padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 8 },
  viewerImg: {
    width: "100%",
    maxHeight: 280,
    objectFit: "contain",
    borderRadius: 12,
    border: "1px solid var(--c-edge)",
    background: "var(--c-fill)",
  },

  appError: { margin: "0 18px 8px", fontSize: 13, color: "var(--c-danger)" },

  actions: {
    flexShrink: 0,
    borderTop: "1px solid var(--c-line)",
    padding: "14px 18px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  licence: { display: "flex", flexDirection: "column", gap: 6 },
  /* Amber, not teal: possible, deliberate, and not the ordinary path. */
  licenceLabel: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },
  buttons: { display: "flex", gap: 10 },
  approve: {
    flexGrow: 2,
    minHeight: 48,
    borderRadius: 12,
    border: 0,
    background: "var(--c-action)",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--c-on-action)",
  },
  approveOff: { opacity: 0.45 },

  th: { fontSize: 12, fontWeight: 700, letterSpacing: "0.4px", color: "var(--c-muted)" },
  cell: { fontSize: 14, color: "var(--c-ink)", overflow: "hidden", textOverflow: "ellipsis" },
  cellMuted: { fontSize: 14, color: "var(--c-ink-soft)", overflow: "hidden", textOverflow: "ellipsis" },
  loading: { padding: 18, fontSize: 14, color: "var(--c-muted)" },
};

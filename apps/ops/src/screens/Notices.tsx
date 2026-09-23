/**
 * Telling the town something.
 *
 * "Taxis running normally in Buea today", or the morning that is not true: a
 * road closed at Mile 17, rain on the Soppo climb, a strike. It goes to the top
 * of both home screens.
 *
 * This screen exists because the banner shipped without it. The API could take
 * a notice and both apps could show one, and the only way to write one was a
 * terminal — which means in practice nobody would have, and a rider standing in
 * the rain would have gone on wondering why no taxi was coming.
 *
 * Both languages are required, by the API and by this form. A notice is the one
 * message that reaches everybody at once, and half the country reads French.
 * Writing it twice is a small price for not handing somebody a sentence they
 * cannot read.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, ops, type Notice, type NoticeSeverity, type Zone } from "@/api";
import { Empty, ErrorLine, Panel, Section } from "@/ui/Section";

const SEVERITIES: { id: NoticeSeverity; label: string; hint: string }[] = [
  { id: "INFO", label: "Something to know", hint: "Quiet. A fact worth having." },
  { id: "WARNING", label: "Expect trouble", hint: "Slower or dearer than usual." },
  {
    id: "SERVICE_SUSPENDED",
    label: "Do not wait for a taxi",
    hint: "Nothing is running. Say this only when it is true.",
  },
];

function toneOf(severity: NoticeSeverity): React.CSSProperties {
  if (severity === "SERVICE_SUSPENDED") return styles.stopped;
  if (severity === "WARNING") return styles.warning;
  return styles.info;
}

export function Notices() {
  const [rows, setRows] = useState<Notice[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [messageFr, setMessageFr] = useState("");
  const [severity, setSeverity] = useState<NoticeSeverity>("INFO");
  const [zone, setZone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await ops.notices();
      setRows(r.notices);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load notices.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void ops
      .zones()
      .then((r) => setZones(r.zones))
      .catch(() => setZones([]));
  }, [load]);

  async function post() {
    if (message.trim().length < 3 || messageFr.trim().length < 3) {
      setError("Write it in both languages. The apps run in both.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.postNotice({
        message: message.trim(),
        messageFr: messageFr.trim(),
        severity,
        ...(zone ? { zone } : {}),
      });
      setMessage("");
      setMessageFr("");
      setSeverity("INFO");
      setZone("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not post.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await ops.removeNotice(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not come down.");
    } finally {
      setBusy(false);
    }
  }

  const live = (rows ?? []).filter((n) => n.live).length;

  return (
    <Section
      title="Service notice"
      line={
        rows === null
          ? "Loading…"
          : live === 0
            ? "Nothing showing in the apps. Riders see their home screen as usual."
            : `${live} showing at the top of every home screen right now.`
      }
    >
      <ErrorLine>{error}</ErrorLine>

      <section className="ops-card" style={styles.composer}>
        <div style={styles.severities}>
          {SEVERITIES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSeverity(s.id)}
              aria-pressed={severity === s.id}
              style={{ ...styles.sev, ...(severity === s.id ? toneOf(s.id) : null) }}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label style={styles.field}>
          <span style={styles.label}>In English</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Heavy rain on the Soppo climb. Expect fewer taxis this evening."
            rows={2}
            maxLength={300}
            disabled={busy}
            style={styles.textarea}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>En français</span>
          <textarea
            value={messageFr}
            onChange={(e) => setMessageFr(e.target.value)}
            placeholder="Fortes pluies sur la montée de Soppo. Moins de taxis ce soir."
            rows={2}
            maxLength={300}
            disabled={busy}
            style={styles.textarea}
          />
        </label>

        <div style={styles.postRow}>
          <label style={styles.field}>
            <span style={styles.label}>One zone only (optional)</span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              disabled={busy}
              style={styles.select}
            >
              <option value="">Everywhere</option>
              {zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => void post()} disabled={busy} style={styles.post}>
            {busy ? "Posting…" : "Show this in both apps"}
          </button>
        </div>
      </section>

      <Panel label="Notices">
        {rows === null || rows.length === 0 ? (
          <Empty loading={rows === null}>Nothing has been posted.</Empty>
        ) : (
          rows.map((n) => (
            <div key={n.id} className="ops-table-row" style={ROW}>
              <span style={styles.body}>
                <span style={styles.en}>{n.message}</span>
                <span style={styles.fr}>{n.messageFr}</span>
              </span>
              <span data-label="Where" style={styles.cellMuted}>
                {n.zone ?? "Everywhere"}
              </span>
              <span data-label="State" style={styles.cell}>
                <span style={{ ...styles.badge, ...toneOf(n.severity) }}>
                  {n.live ? "Showing" : "Not showing"}
                </span>
              </span>
              <span style={styles.rowAction}>
                {n.live ? (
                  <button type="button" onClick={() => void remove(n.id)} disabled={busy} style={styles.take}>
                    Take it down
                  </button>
                ) : null}
              </span>
            </div>
          ))
        )}
      </Panel>
    </Section>
  );
}

const ROW = { "--ops-cols": "2.6fr 1fr 1fr 1fr" } as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  composer: { padding: 18, display: "flex", flexDirection: "column", gap: 14 },

  severities: { display: "flex", flexWrap: "wrap", gap: 8 },
  sev: {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 999,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--c-ink-soft)",
  },
  info: { borderColor: "var(--c-action)", background: "var(--c-action-tint)", color: "var(--c-action-text)" },
  warning: { borderColor: "var(--c-amber)", background: "var(--c-amber-tint)", color: "var(--c-hill)" },
  stopped: { borderColor: "var(--c-danger-edge)", background: "var(--c-card)", color: "var(--c-danger)" },

  field: { display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 },
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
  select: {
    height: 48,
    padding: "0 12px",
    borderRadius: 12,
    border: "1.5px solid var(--c-control-edge)",
    background: "var(--c-card)",
    fontFamily: "var(--font-ui)",
    fontSize: 15,
    color: "var(--c-ink)",
  },

  postRow: { display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" },
  post: {
    minHeight: 48,
    padding: "0 20px",
    borderRadius: 12,
    border: 0,
    background: "var(--c-action)",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--c-on-action)",
  },

  body: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  en: { fontSize: 14, color: "var(--c-ink)" },
  fr: { fontSize: 13, color: "var(--c-muted)" },
  cell: { fontSize: 14 },
  cellMuted: { fontSize: 14, color: "var(--c-ink-soft)" },
  badge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 700,
  },
  rowAction: { display: "flex", justifyContent: "flex-end" },
  take: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--c-ink-soft)",
  },
};

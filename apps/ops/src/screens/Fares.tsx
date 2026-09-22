/**
 * The price of every zone pair, and how much of it is still a guess.
 *
 * Rows come out of the seed formula — a distance estimate with a hill
 * allowance — and stay that way until somebody walks the route, asks what
 * drivers actually charge, and types the real number here. Writing a price
 * marks the row FIELD, and the formula never touches it again.
 *
 * So the headline is not how many fares exist. It is how many are still the
 * computer's opinion rather than a price somebody checked.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, ops, type Fare, type Zone } from "@/api";
import { Empty, ErrorLine, Panel, Section, Tabs, money } from "@/ui/Section";

type Filter = "ALL" | "FORMULA" | "FIELD";

const TABS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "FORMULA", label: "Still a guess" },
  { id: "FIELD", label: "Checked" },
];

/** The API refuses anything that is not a multiple of this. Riders think in 50s. */
const ROUNDING = 50;

function errorFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "That did not save.";
  switch (err.code) {
    case "same_zone":
      return "A fare needs two different zones.";
    case "zone_not_found":
      return "One of those zone codes does not exist.";
    case "below_floor":
    case "not_round":
      return err.message;
    default:
      return err.message;
  }
}

export function Fares() {
  const [tab, setTab] = useState<Filter>("ALL");
  const [fares, setFares] = useState<Fare[] | null>(null);
  const [provisional, setProvisional] = useState(0);
  const [byHand, setByHand] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async (filter: Filter) => {
    setFares(null);
    try {
      const r = await ops.fares(filter === "ALL" ? undefined : filter);
      setFares(r.fares);
      setProvisional(r.stillProvisional);
      setByHand(r.pricedByHand);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the fare table.");
      setFares([]);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  // The zone list comes from the gazetteer, not from the rows on screen: the
  // whole point of the form is pricing a pair that has no row yet, and the
  // "Checked" filter would otherwise offer four zones out of thirty.
  const [zones, setZones] = useState<Zone[]>([]);
  useEffect(() => {
    void ops
      .zones()
      .then((r) => setZones(r.zones))
      .catch(() => setZones([]));
  }, []);

  return (
    <Section
      title="Fare rules"
      line={
        fares === null
          ? "Loading…"
          : `${byHand} ${byHand === 1 ? "price has" : "prices have"} been checked on the road. ${provisional} ${provisional === 1 ? "is" : "are"} still the formula's guess.`
      }
      tabs={<Tabs value={tab} onChange={setTab} options={TABS} label="Fare source" />}
    >
      <ErrorLine>{error}</ErrorLine>

      <PriceByHand zones={zones} onSaved={() => void load(tab)} />

      <Panel label="Fares">
        <div className="ops-table-head" style={COLUMNS}>
          <span style={styles.th}>FROM</span>
          <span style={styles.th}>TO</span>
          <span style={styles.th}>PRICE</span>
          <span style={styles.th}>SOURCE</span>
          <span style={styles.th} />
        </div>

        {fares === null || fares.length === 0 ? (
          <Empty loading={fares === null}>No fares in this list.</Empty>
        ) : (
          fares.map((f) => {
            const open = editing?.from === f.from && editing?.to === f.to;
            return (
              <div key={`${f.from}-${f.to}-${f.vehicleType}`}>
                <div
                  className="ops-table-row"
                  style={COLUMNS}
                  {...(f.source === "FORMULA" ? { "data-flag": "late" } : {})}
                >
                  <span style={styles.zone}>{f.from}</span>
                  <span data-label="To" style={styles.zone}>
                    {f.to}
                  </span>
                  <span data-label="Price" style={styles.price}>
                    {money(f.priceXaf)}
                  </span>
                  <span data-label="Source" style={styles.cell}>
                    <span style={f.source === "FIELD" ? styles.checked : styles.guess}>
                      {f.source === "FIELD" ? "Checked" : "Still a guess"}
                    </span>
                  </span>
                  <span style={styles.rowAction}>
                    <button
                      type="button"
                      onClick={() => setEditing(open ? null : { from: f.from, to: f.to })}
                      style={styles.edit}
                    >
                      {open ? "Cancel" : "Set price"}
                    </button>
                  </span>
                </div>

                {open ? (
                  <Inline
                    from={f.from}
                    to={f.to}
                    current={f.priceXaf}
                    onSaved={() => {
                      setEditing(null);
                      void load(tab);
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

/** The price field that appears under a row you chose to correct. */
function Inline({
  from,
  to,
  current,
  onSaved,
}: {
  from: string;
  to: string;
  current: number;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(String(current));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = Number(price);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Type the price in XAF.");
      return;
    }
    if (value % ROUNDING !== 0) {
      setError(`Round it to the nearest ${ROUNDING}. A ${value} XAF fare is not a real price.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.setFare(from, to, value, note.trim() || undefined);
      onSaved();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.inline}>
      <div style={styles.inlineHead}>
        {from} → {to}
      </div>
      <div style={styles.inlineFields}>
        <label style={styles.field}>
          <span style={styles.label}>Price in XAF</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            disabled={busy}
            autoFocus
          />
        </label>
        <label style={{ ...styles.field, flexGrow: 1 }}>
          <span style={styles.label}>Where this came from</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Asked four drivers at the Mile 17 park."
            disabled={busy}
          />
        </label>
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={busy} style={styles.save}>
        {busy ? "Saving…" : "Save this price"}
      </button>
    </div>
  );
}

/** A pair that has no row yet, priced from scratch. */
function PriceByHand({ zones, onSaved }: { zones: Zone[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = Number(price);
    if (!from || !to) {
      setError("Pick both zones.");
      return;
    }
    if (!Number.isInteger(value) || value <= 0 || value % ROUNDING !== 0) {
      setError(`Type a price in XAF, rounded to the nearest ${ROUNDING}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ops.setFare(from, to, value);
      setOpen(false);
      setPrice("");
      onSaved();
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={styles.addButton}>
        Price a pair that is not in the table
      </button>
    );
  }

  return (
    <div style={styles.add}>
      <div style={styles.inlineFields}>
        <label style={styles.field}>
          <span style={styles.label}>From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} style={styles.select}>
            <option value="">Choose…</option>
            {zones.map((z) => (
              <option key={z.code} value={z.code}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.field}>
          <span style={styles.label}>To</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} style={styles.select}>
            <option value="">Choose…</option>
            {zones.map((z) => (
              <option key={z.code} value={z.code}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.field}>
          <span style={styles.label}>Price in XAF</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            disabled={busy}
          />
        </label>
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
      <div style={styles.addActions}>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} style={styles.cancel}>
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={busy} style={styles.save}>
          {busy ? "Saving…" : "Save this price"}
        </button>
      </div>
    </div>
  );
}

const COLUMNS = { "--ops-cols": "1.2fr 1.2fr 1fr 1.1fr 0.9fr" } as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  th: { fontSize: 12, fontWeight: 700, letterSpacing: "0.4px", color: "var(--c-muted)" },
  zone: { fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, letterSpacing: "0.3px", color: "var(--c-ink)" },
  price: { fontSize: 14, fontWeight: 600, color: "var(--c-ink)" },
  cell: { fontSize: 14 },
  checked: { fontSize: 13, fontWeight: 600, color: "var(--c-action-text)" },
  guess: { fontSize: 13, fontWeight: 600, color: "var(--c-hill)" },

  rowAction: { display: "flex", justifyContent: "flex-end" },
  edit: {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--c-ink-soft)",
  },

  inline: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "16px 18px",
    background: "var(--c-action-tint)",
    borderBottom: "1px solid var(--c-line)",
  },
  inlineHead: { fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--c-ink)" },
  inlineFields: { display: "flex", flexWrap: "wrap", gap: 12 },

  add: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 18,
    borderRadius: 16,
    background: "var(--c-card)",
    border: "1px solid var(--c-edge)",
  },
  addButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 12,
    border: "1.5px dashed var(--c-line-strong)",
    background: "transparent",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--c-action-text)",
  },
  addActions: { display: "flex", gap: 10 },

  field: { display: "flex", flexDirection: "column", gap: 6, minWidth: 150 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--c-ink-soft)" },
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

  error: { margin: 0, fontSize: 13, color: "var(--c-danger)" },

  save: {
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
  cancel: {
    minHeight: 46,
    padding: "0 18px",
    borderRadius: 12,
    border: "1.5px solid var(--c-line-strong)",
    background: "var(--c-card)",
    fontSize: 15,
    fontWeight: 600,
    color: "var(--c-ink-soft)",
  },
};

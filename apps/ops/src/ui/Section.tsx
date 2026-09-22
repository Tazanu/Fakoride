/**
 * The frame every section shares: a title, a sentence, and the tabs that
 * narrow what is listed.
 *
 * The sentence is not decoration. Each screen uses it to say the one number
 * that decides whether anybody needs to act — how many are waiting, how many
 * are late, how much of the fare table is still a guess — so the answer is
 * there before the list has finished loading.
 */

import type { ReactNode } from "react";

export function Section({
  title,
  line,
  tabs,
  children,
}: {
  title: string;
  line: string;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ops-page">
      <header className="ops-page-head">
        <div>
          <h1 className="ops-title">{title}</h1>
          <p style={styles.line}>{line}</p>
        </div>
        {tabs}
      </header>
      {children}
    </div>
  );
}

/** The tab strip. Selected state is the ARIA attribute, styled in `theme.ts`. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string }[];
  label: string;
}) {
  return (
    <div className="ops-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className="ops-tab"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A card holding one list, with the console's border and radius. */
export function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="ops-card" aria-label={label} style={styles.panel}>
      {children}
    </section>
  );
}

/**
 * What a list says when it has nothing in it.
 *
 * An empty queue in this console is usually good news — nobody waiting, no
 * alarms open — so the wording says so rather than leaving a blank rectangle
 * that reads like a failure to load.
 */
export function Empty({ loading, children }: { loading: boolean; children: string }) {
  return <p style={styles.empty}>{loading ? "Loading…" : children}</p>;
}

export function ErrorLine({ children }: { children: string | null }) {
  if (!children) return null;
  return <p style={styles.error}>{children}</p>;
}

/** XAF, grouped. Prices in this market are read in hundreds. */
export function money(xaf: number): string {
  return `${xaf.toLocaleString("en-US").replace(/,/g, " ")} XAF`;
}

/** "3 min", "2 h", "4 days" — a delay, never a timestamp. */
export function since(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

const styles: Record<string, React.CSSProperties> = {
  line: { margin: "6px 0 0", fontSize: 14, color: "var(--c-muted)" },
  panel: { flexGrow: 1, minHeight: 0, overflow: "auto" },
  empty: { padding: 20, fontSize: 14, color: "var(--c-muted)" },
  error: { margin: 0, fontSize: 13, color: "var(--c-danger)" },
};

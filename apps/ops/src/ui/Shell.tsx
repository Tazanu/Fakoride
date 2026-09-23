/**
 * The console's frame: the deep teal rail, and whatever is open beside it.
 *
 * The rail carries counts, not just labels. "Driver approvals 7" is the only
 * reason somebody opens this console in the morning, and a number on the item
 * answers the question before the click. The amber badge is reserved for work
 * that is waiting on a person; the quieter one is for counts that are merely
 * true.
 *
 * On a narrow screen the rail lies down and becomes a bar across the top, with
 * the sections scrolling sideways. The layout lives in `theme.ts`, because a
 * style object cannot carry a media query.
 */

import type { ReactNode } from "react";

export type Section =
  | "approvals"
  | "safety"
  | "trips"
  | "complaints"
  | "fares"
  | "drivers"
  | "notices";

const ITEMS: { id: Section; label: string }[] = [
  // Safety sits second, under approvals: it is empty almost always, and the
  // one morning it is not, it must not be somewhere you scroll to find.
  { id: "approvals", label: "Driver approvals" },
  { id: "safety", label: "Safety" },
  { id: "trips", label: "Live trips" },
  { id: "complaints", label: "Complaints" },
  { id: "fares", label: "Fare rules" },
  { id: "drivers", label: "All drivers" },
  // Last: it is the only one that speaks to everybody at once, and the only
  // one you open knowing what you came to say.
  { id: "notices", label: "Service notice" },
];

export function Shell({
  section,
  onSection,
  counts,
  onSignOut,
  children,
}: {
  section: Section;
  onSection: (s: Section) => void;
  counts: Partial<Record<Section, { value: number; urgent?: boolean }>>;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="ops-shell">
      <nav className="ops-rail" aria-label="Sections">
        <div className="ops-brand">
          <Badge />
          <span className="ops-brand-name">FakoRide</span>
        </div>

        <ul className="ops-nav">
          {ITEMS.map((item) => {
            const count = counts[item.id];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="ops-nav-item"
                  onClick={() => onSection(item.id)}
                  aria-current={section === item.id ? "page" : undefined}
                >
                  <span>{item.label}</span>
                  {count && count.value > 0 ? (
                    <span
                      style={{
                        ...styles.badge,
                        ...(count.urgent ? styles.badgeUrgent : styles.badgeQuiet),
                      }}
                    >
                      {count.value}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="ops-rail-foot">
          <button type="button" className="ops-sign-out" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </nav>

      <main className="ops-main">{children}</main>
    </div>
  );
}

/** Mount Cameroon over a bicycle, at rail size. */
function Badge() {
  return (
    <svg viewBox="0 0 260 260" width={34} height={34} aria-hidden="true">
      <circle cx={130} cy={130} r={122} fill="none" stroke="var(--logo-mint)" strokeWidth={8} />
      <polygon points="46,150 92,98 114,120 138,48 164,120 186,98 214,150" fill="var(--logo-mint)" />
      <circle cx={100} cy={206} r={16} fill="none" stroke="var(--logo-amber)" strokeWidth={8} />
      <circle cx={166} cy={206} r={16} fill="none" stroke="var(--logo-amber)" strokeWidth={8} />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 22,
    padding: "0 7px",
    borderRadius: 11,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--c-on-action)",
  },
  /* Amber: work waiting on a person. */
  badgeUrgent: { background: "var(--c-amber)" },
  /* Quiet: a count that is merely true. */
  badgeQuiet: { background: "var(--c-action-deep)" },
};


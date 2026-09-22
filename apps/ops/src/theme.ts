/**
 * The design tokens, as CSS custom properties.
 *
 * Imported from `design/tokens.json` rather than copied, so a contrast fix made
 * there reaches this console the same way it reaches both apps. The one job of
 * this file is to translate: JSON in, `--colour-*` out, and nothing in a
 * component ever writes a hex.
 */

import tokens from "@design/tokens.json";

const light = tokens.color.light as Record<string, string>;
const logo = tokens.color.logo as Record<string, string>;

/** `actionTintEdge` becomes `--c-action-tint-edge`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function vars(): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(light)) {
    if (name.startsWith("$")) continue;
    lines.push(`  --c-${kebab(name)}: ${value};`);
  }
  for (const [name, value] of Object.entries(logo)) {
    if (name.startsWith("$")) continue;
    lines.push(`  --logo-${kebab(name)}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.space)) {
    lines.push(`  --space-${name}: ${value}px;`);
  }
  for (const [name, value] of Object.entries(tokens.radius)) {
    lines.push(`  --radius-${name}: ${value}px;`);
  }
  return lines.join("\n");
}

/**
 * Everything global, in one string.
 *
 * A single stylesheet rather than a CSS-in-JS runtime: this console is five
 * screens read by a handful of people in one office, and a build-time
 * dependency earning nothing is a dependency to maintain forever.
 */
export const globalCss = `
:root {
${vars()}

  --font-display: 'Archivo', system-ui, sans-serif;
  --font-ui: 'Manrope', system-ui, sans-serif;
}

* { box-sizing: border-box; }

html, body, #root { height: 100%; }

body {
  margin: 0;
  background: var(--c-paper);
  color: var(--c-ink);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 { font-family: var(--font-display); margin: 0; }

button { font-family: var(--font-ui); cursor: pointer; }

/* A disabled control has to look disabled. The sign-in button sat there in
   full teal with nine digits still missing, looking exactly like a button that
   would do something — the cursor was the only tell, and on a touch screen
   there is no cursor. */
button:disabled { cursor: not-allowed; opacity: 0.45; }

/* A visible focus ring on everything focusable. Removing it is the one
   accessibility failure that is never worth the tidiness. */
:focus-visible {
  outline: 2px solid var(--c-action-bright);
  outline-offset: 2px;
  border-radius: 4px;
}

input {
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--c-ink);
  background: var(--c-card);
  border: 1.5px solid var(--c-control-edge);
  border-radius: var(--radius-md);
  padding: 0 14px;
  height: 48px;
  width: 100%;
}
input:focus { border-color: var(--c-action-bright); }

/* The rule above is written for text fields. A checkbox is not one, and would
   otherwise come out as a 48px-tall bordered box. */
input[type="checkbox"] {
  width: auto;
  height: auto;
  padding: 0;
  border: 0;
  accent-color: var(--c-action);
}

/* ---------------------------------------------------------------------------
 * Layout.
 *
 * These live here rather than in the components because they are the only
 * styles that have to change with the width of the screen, and an inline
 * a style object cannot hold a media query. Everything else stays inline next
 * to the markup it dresses.
 *
 * Selected state is read off the ARIA attributes the markup already carries —
 * aria-current, aria-selected — so there is one source of truth for "this
 * one is chosen" instead of an attribute for the screen reader and a spread
 * style object for the eye.
 * ------------------------------------------------------------------------- */

.ops-shell { display: flex; height: 100%; min-height: 100vh; }

.ops-rail {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 26px 16px;
  background: var(--c-action);
}
.ops-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.ops-brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 19px;
  color: var(--c-on-action);
}

.ops-nav { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ops-nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 46px;
  padding: 0 14px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--c-on-action-soft);
  font-size: 15px;
  font-weight: 500;
  text-align: left;
}
.ops-nav-item[aria-current="page"] {
  background: var(--c-action-deep);
  color: var(--c-on-action);
  font-weight: 600;
}

.ops-rail-foot { margin-top: auto; }
.ops-sign-out {
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--c-on-action-soft);
  font-size: 14px;
  font-weight: 500;
}

.ops-main { flex-grow: 1; min-width: 0; padding: 30px 32px; overflow: auto; }

.ops-page { display: flex; flex-direction: column; gap: 22px; height: 100%; }
.ops-page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.ops-title { font-size: 28px; letter-spacing: -0.3px; color: var(--c-ink); }

.ops-tabs { display: flex; gap: 8px; flex-shrink: 0; }
.ops-tab {
  flex-shrink: 0;
  height: 42px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-muted);
}
.ops-tab[aria-selected="true"] {
  border: 1.5px solid var(--c-line-strong);
  background: var(--c-card);
  font-weight: 600;
  color: var(--c-ink);
}

.ops-panels { display: flex; gap: 22px; flex-grow: 1; min-height: 0; align-items: stretch; }

.ops-card {
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--c-card);
  border: 1px solid var(--c-edge);
  overflow: hidden;
}
.ops-detail { width: 452px; flex-shrink: 0; }
.ops-queue { flex-grow: 1; min-width: 0; }

/*
 * Everything between the applicant's name and the buttons scrolls. Without it
 * the card silently ate whatever did not fit, and the first thing off the
 * bottom was the approve/reject bar.
 */
.ops-app-body { flex-grow: 1; min-height: 0; overflow-y: auto; }

/*
 * One table, used by every list in the console.
 *
 * The column widths come from --ops-cols, set on the section, so a five-column
 * fare table and a four-column queue are the same component with a different
 * measure rather than two things that drift apart.
 */
.ops-table-head, .ops-table-row {
  display: grid;
  grid-template-columns: var(--ops-cols, repeat(4, minmax(0, 1fr)));
  gap: 12px;
}
.ops-table-head {
  padding: 14px 18px;
  background: var(--c-fill);
  border-bottom: 1px solid var(--c-edge);
}
.ops-table-row {
  align-items: center;
  width: 100%;
  padding: 16px 18px;
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: transparent;
  text-align: left;
}
.ops-table-row:last-child { border-bottom: 0; }
.ops-table-row[aria-current="true"] { background: var(--c-action-tint); }
.ops-table-row[data-flag="urgent"] { box-shadow: inset 3px 0 0 var(--c-danger); }
.ops-table-row[data-flag="late"] { box-shadow: inset 3px 0 0 var(--c-amber); }

/* ---------------------------------------------------------------------------
 * One column.
 *
 * Below this width the two panels cannot sit side by side — 452px of detail
 * plus a four-column table is wider than the phone this gets read on when
 * somebody is away from the office. The rail becomes a bar across the top, the
 * queue comes first because that is what you are choosing from, and the
 * applicant opens underneath it.
 * ------------------------------------------------------------------------- */
@media (max-width: 900px) {
  .ops-shell { flex-direction: column; min-height: 100dvh; }

  .ops-rail {
    width: auto;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    position: sticky;
    top: 0;
    z-index: 5;
  }
  .ops-brand { padding: 0; flex-shrink: 0; }
  /* The badge carries the name well enough; the word costs a section of rail. */
  .ops-brand-name { display: none; }

  .ops-nav { flex-direction: row; gap: 6px; flex-grow: 1; overflow-x: auto; scrollbar-width: none; }
  .ops-nav::-webkit-scrollbar { display: none; }
  .ops-nav-item {
    width: auto;
    flex-shrink: 0;
    min-height: 40px;
    padding: 0 12px;
    font-size: 14px;
    /* In a row, a label that wraps makes the whole bar two lines tall, and a
       half-visible "C" at the edge reads as a rendering fault rather than as
       something to scroll towards. */
    white-space: nowrap;
  }

  .ops-rail-foot { margin-top: 0; flex-shrink: 0; }
  .ops-sign-out { width: auto; min-height: 40px; padding: 0 10px; white-space: nowrap; }

  .ops-main { padding: 18px 16px 32px; overflow: visible; }

  .ops-page { height: auto; gap: 16px; }
  .ops-page-head { flex-direction: column; align-items: stretch; gap: 14px; }
  .ops-title { font-size: 23px; }

  .ops-tabs { overflow-x: auto; scrollbar-width: none; }
  .ops-tabs::-webkit-scrollbar { display: none; }
  .ops-tab { height: 38px; padding: 0 13px; white-space: nowrap; }

  .ops-panels { flex-direction: column; gap: 16px; }

  /* The list first, the applicant it opened second. */
  .ops-queue { order: 1; }
  .ops-detail {
    width: 100%;
    order: 2;
    overflow: visible;
    /* Clears the bar, which is sticky: scrolled to exactly its top, the
       applicant's name would sit underneath it. */
    scroll-margin-top: 70px;
  }
  .ops-app-body { overflow-y: visible; }

  /*
   * Four columns across a phone leaves seventy pixels each, and a heading row
   * far above the value it names is no help. Each row becomes its own little
   * record: the name on its own line, then every other field labelled beside
   * its value.
   */
  .ops-table-head { display: none; }
  .ops-table-row { grid-template-columns: 1fr; gap: 3px; padding: 13px 16px; }
  .ops-table-row > * { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
  .ops-table-row > [data-label]::before {
    content: attr(data-label);
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--c-muted);
  }
  /* The first cell is the headline and names itself. */
  .ops-table-row > :first-child::before { content: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;

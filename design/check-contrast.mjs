#!/usr/bin/env node
/**
 * Verifies every colour pair in tokens.json against its WCAG floor.
 *
 * This exists because the palette was not eyeballed. The first muted grey we
 * tried (#6B7C73) looked fine and failed at 4.42:1; it was darkened until it
 * passed. Run this after any colour change — a token that reads well on a
 * laptop in an office can be unreadable on a cheap LCD in Buea sun.
 *
 *   node design/check-contrast.mjs
 *
 * Exits non-zero on any failure, so it can go straight into CI.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));

/** sRGB channel to linear light. */
function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, per WCAG 2.2. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;
let checks = 0;

for (const [scheme, pairs] of Object.entries(tokens.contrastPairs)) {
  if (scheme.startsWith("$")) continue;

  const palette = tokens.color[scheme];
  if (!palette) {
    console.error(`no palette for scheme "${scheme}"`);
    failures += 1;
    continue;
  }

  console.log(`\n${scheme}`);
  for (const pair of pairs) {
    const fg = palette[pair.fg];
    const bg = palette[pair.bg];
    if (!fg || !bg) {
      console.error(`  MISSING  ${pair.fg} on ${pair.bg}`);
      failures += 1;
      continue;
    }

    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= pair.min;
    checks += 1;
    if (!ok) failures += 1;

    console.log(
      `  ${ok ? "ok  " : "FAIL"}  ${ratio.toFixed(2).padStart(5)}:1  (needs ${pair.min})  ` +
        `${pair.fg} on ${pair.bg} — ${pair.note}`,
    );
  }
}

console.log(
  `\n${checks} pairs checked, ${failures} failing.` +
    (failures ? "\nFix the token, do not lower the floor." : ""),
);
process.exit(failures ? 1 : 0);

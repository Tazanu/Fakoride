/**
 * When an unpaid access fee starts to stop a driver going online.
 *
 * A money rule that turns on a calendar day, in Cameroon time — the same kind
 * of boundary time.test.ts guards, and worth the same care: an off-by-one here
 * either locks out a man whose debit failed this morning, or never locks out
 * anybody.
 */

import { describe, expect, it } from "vitest";
import { overdueFeeCutoff } from "../src/lib/time";

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
/** Noon in Buea on that date — 11:00 UTC. */
const noonWat = (key: string) => new Date(`${key}T11:00:00.000Z`);

describe("the overdue cutoff", () => {
  it("with three days' grace, Monday's fee stops him from Thursday", () => {
    // 2026-11-16 is a Monday.
    const monday = day("2026-11-16");
    const cutoffOn = (key: string) => overdueFeeCutoff(noonWat(key), 3)!;

    expect(monday.getTime() <= cutoffOn("2026-11-17").getTime()).toBe(false); // Tuesday: still asking
    expect(monday.getTime() <= cutoffOn("2026-11-18").getTime()).toBe(false); // Wednesday: still in grace
    expect(monday.getTime() <= cutoffOn("2026-11-19").getTime()).toBe(true); // Thursday: stopped
  });

  it("never counts today's fee, or yesterday's", () => {
    const cutoff = overdueFeeCutoff(noonWat("2026-11-19"), 3)!;
    expect(day("2026-11-19").getTime() <= cutoff.getTime()).toBe(false);
    expect(day("2026-11-18").getTime() <= cutoff.getTime()).toBe(false);
  });

  it("turns on the Cameroon day, not the UTC one", () => {
    // 23:30 UTC on the 18th is already 00:30 on the 19th in Buea.
    const justAfterMidnightWat = new Date("2026-11-18T23:30:00.000Z");
    expect(overdueFeeCutoff(justAfterMidnightWat, 3)!.toISOString().slice(0, 10)).toBe("2026-11-16");
    // An hour earlier it is still the 18th there.
    const justBeforeMidnightWat = new Date("2026-11-18T22:30:00.000Z");
    expect(overdueFeeCutoff(justBeforeMidnightWat, 3)!.toISOString().slice(0, 10)).toBe("2026-11-15");
  });

  it("is switched off by zero", () => {
    expect(overdueFeeCutoff(noonWat("2026-11-19"), 0)).toBeNull();
  });
});

/**
 * The earnings screen is the only screen a driver checks every evening, and the
 * promise it makes is that a quiet Monday never counts against him. That
 * promise is a line of arithmetic, so it is tested like one.
 */

import { describe, expect, it } from "vitest";
import { foldEarningsDays, type FeeRow, type LedgerRow } from "../src/modules/earnings-math";

/** Monday 14 Sept 2026 to Sunday 20 Sept, as the week endpoint builds it. */
const WEEK_FROM = new Date("2026-09-13T23:00:00Z"); // WAT midnight on the Monday
const WEEK_TO = new Date("2026-09-20T22:59:59Z"); // last moment of the Sunday

const fare = (isoDay: string, hourUtc: number, amountXaf: number, type = "FARE_CASH"): LedgerRow => ({
  type,
  amountXaf,
  createdAt: new Date(`${isoDay}T${String(hourUtc).padStart(2, "0")}:00:00Z`),
});

const fee = (isoDay: string, amountXaf = 500, paid = true): FeeRow => ({
  serviceDate: new Date(`${isoDay}T00:00:00.000Z`),
  amountXaf,
  paid,
});

describe("the shape of the week", () => {
  it("always returns seven days, Monday first", () => {
    const days = foldEarningsDays({ from: WEEK_FROM, to: WEEK_TO, ledger: [], fees: [] });
    expect(days).toHaveLength(7);
    expect(days[0]!.date).toBe("2026-09-14");
    expect(days[0]!.weekday).toBe("Mon");
    expect(days[6]!.date).toBe("2026-09-20");
    expect(days[6]!.weekday).toBe("Sun");
  });

  it("shows a day he did not work as empty rather than missing", () => {
    const days = foldEarningsDays({ from: WEEK_FROM, to: WEEK_TO, ledger: [], fees: [] });
    expect(days.every((d) => d.earnedXaf === 0 && d.tripCount === 0 && !d.worked)).toBe(true);
  });
});

describe("a quiet Monday", () => {
  it("is named as a ghost town when he stayed off the road", () => {
    const days = foldEarningsDays({
      from: WEEK_FROM,
      to: WEEK_TO,
      ledger: [fare("2026-09-15", 10, 250)],
      fees: [fee("2026-09-15")],
    });
    const monday = days.find((d) => d.date === "2026-09-14")!;
    expect(monday.ghostTown).toBe(true);
    expect(monday.worked).toBe(false);
    expect(monday.feeXaf).toBe(0);
  });

  it("costs him nothing — no fee is folded in for a day he did not work", () => {
    const days = foldEarningsDays({
      from: WEEK_FROM,
      to: WEEK_TO,
      ledger: [],
      fees: [fee("2026-09-15"), fee("2026-09-16")],
    });
    expect(days.reduce((sum, d) => sum + d.feeXaf, 0)).toBe(1000);
    expect(days.filter((d) => d.worked)).toHaveLength(2);
  });

  it("is not a ghost town if he did work it", () => {
    const days = foldEarningsDays({
      from: WEEK_FROM,
      to: WEEK_TO,
      ledger: [fare("2026-09-14", 9, 300)],
      fees: [fee("2026-09-14")],
    });
    const monday = days.find((d) => d.date === "2026-09-14")!;
    expect(monday.ghostTown).toBe(false);
    expect(monday.worked).toBe(true);
    expect(monday.earnedXaf).toBe(300);
  });

  it("only ever names a Monday, never a quiet Wednesday", () => {
    const days = foldEarningsDays({ from: WEEK_FROM, to: WEEK_TO, ledger: [], fees: [] });
    expect(days.filter((d) => d.ghostTown).map((d) => d.date)).toEqual(["2026-09-14"]);
  });
});

describe("fares landing on the right day", () => {
  it("puts a trip ridden at half past midnight on that day, not the one before", () => {
    // 23:30 UTC Monday is 00:30 Tuesday in Cameroon.
    const days = foldEarningsDays({
      from: WEEK_FROM,
      to: WEEK_TO,
      ledger: [{ type: "FARE_CASH", amountXaf: 450, createdAt: new Date("2026-09-14T23:30:00Z") }],
      fees: [],
    });
    expect(days.find((d) => d.date === "2026-09-14")!.earnedXaf).toBe(0);
    expect(days.find((d) => d.date === "2026-09-15")!.earnedXaf).toBe(450);
  });

  it("counts cash and mobile fares alike and ignores fee entries", () => {
    const days = foldEarningsDays({
      from: WEEK_FROM,
      to: WEEK_TO,
      ledger: [
        fare("2026-09-16", 8, 250),
        fare("2026-09-16", 9, 235, "FARE_MOBILE"),
        // The fee is a ledger row too; it must not read as a trip.
        { type: "ACCESS_FEE", amountXaf: -500, createdAt: new Date("2026-09-16T06:00:00Z") },
      ],
      fees: [fee("2026-09-16")],
    });
    const wednesday = days.find((d) => d.date === "2026-09-16")!;
    expect(wednesday.tripCount).toBe(2);
    expect(wednesday.earnedXaf).toBe(485);
    expect(wednesday.feeXaf).toBe(500);
  });

  it("drops anything outside the week rather than folding it into an edge day", () => {
    const days = foldEarningsDays({
      from: WEEK_FROM,
      to: WEEK_TO,
      ledger: [fare("2026-09-13", 10, 999), fare("2026-09-21", 10, 999)],
      fees: [],
    });
    expect(days.reduce((sum, d) => sum + d.earnedXaf, 0)).toBe(0);
  });
});

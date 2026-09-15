/**
 * Service days decide money: which day an access fee is charged for, and which
 * day's bar a fare lands in on the earnings screen. Cameroon is UTC+1, so a
 * trip at half past midnight and a trip at eleven at night fall on opposite
 * sides of the boundary depending on whether you get this right.
 *
 * These are the cases that were wrong when the boundary was UTC.
 */

import { describe, expect, it } from "vitest";
import {
  endOfServiceDay,
  isMonday,
  serviceDate,
  serviceDateKey,
  serviceDateRange,
  startOfServiceDay,
  startOfServiceWeek,
} from "../src/lib/time";

describe("which day a moment belongs to", () => {
  it("puts half past midnight in Buea on today, not yesterday", () => {
    // 23:30 UTC on the 13th is 00:30 on the 14th in Cameroon.
    expect(serviceDateKey(new Date("2026-09-13T23:30:00Z"))).toBe("2026-09-14");
  });

  it("puts a late evening trip on the day it was ridden", () => {
    // 22:00 UTC is 23:00 the same evening in Cameroon — still today.
    expect(serviceDateKey(new Date("2026-09-14T22:00:00Z"))).toBe("2026-09-14");
  });

  it("agrees with UTC through the middle of the day", () => {
    expect(serviceDateKey(new Date("2026-09-14T12:00:00Z"))).toBe("2026-09-14");
  });

  it("returns the calendar day at UTC midnight, for a date column", () => {
    const date = serviceDate(new Date("2026-09-14T22:00:00Z"));
    expect(date.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});

describe("the edges of a service day", () => {
  it("starts a Cameroon day an hour before UTC midnight", () => {
    expect(startOfServiceDay(new Date("2026-09-14T12:00:00Z")).toISOString()).toBe("2026-09-13T23:00:00.000Z");
  });

  it("runs exactly twenty-four hours", () => {
    const at = new Date("2026-09-14T12:00:00Z");
    expect(endOfServiceDay(at).getTime() - startOfServiceDay(at).getTime()).toBe(86_400_000);
  });

  it("round-trips: every instant inside a day maps back to that day", () => {
    const at = new Date("2026-09-14T12:00:00Z");
    const start = startOfServiceDay(at);
    const lastMoment = new Date(endOfServiceDay(at).getTime() - 1);
    expect(serviceDateKey(start)).toBe("2026-09-14");
    expect(serviceDateKey(lastMoment)).toBe("2026-09-14");
  });
});

describe("the week the earnings screen shows", () => {
  it("starts on Monday", () => {
    // 15 Sept 2026 is a Tuesday.
    expect(startOfServiceWeek(new Date("2026-09-15T12:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // 20 Sept 2026 is a Sunday; its week still begins on the 14th.
    expect(startOfServiceWeek(new Date("2026-09-20T12:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });

  it("is idempotent on a Monday", () => {
    expect(startOfServiceWeek(new Date("2026-09-14T09:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});

describe("listing days", () => {
  it("is inclusive at both ends", () => {
    const days = serviceDateRange(new Date("2026-09-14T00:00:00Z"), new Date("2026-09-16T00:00:00Z"));
    expect(days).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("gives a single day when both ends are the same day", () => {
    const days = serviceDateRange(new Date("2026-09-14T06:00:00Z"), new Date("2026-09-14T20:00:00Z"));
    expect(days).toEqual(["2026-09-14"]);
  });
});

describe("Monday", () => {
  it("knows which day it is", () => {
    expect(isMonday("2026-09-14")).toBe(true);
    expect(isMonday("2026-09-15")).toBe(false);
    expect(isMonday("2026-09-20")).toBe(false);
  });
});

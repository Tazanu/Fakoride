/**
 * The week, folded into one row per day.
 *
 * This is the arithmetic behind the only screen a driver looks at every
 * evening, so it lives away from the database the same way fare-math does —
 * the numbers have to be checkable without one.
 */

import { isMonday, serviceDateKey, serviceDateRange } from "../lib/time";

export type LedgerRow = { type: string; amountXaf: number; createdAt: Date };
export type FeeRow = { serviceDate: Date; amountXaf: number; paid: boolean };

export type EarningsDay = {
  date: string;
  weekday: string;
  earnedXaf: number;
  tripCount: number;
  feeXaf: number;
  /** He went online, so the day was charged. No charge means he chose not to. */
  worked: boolean;
  /**
   * A Monday he did not work. Named on the earnings screen so that a missing
   * bar reads as a choice rather than as a bad week — Mondays in Buea are
   * ghost towns, and the numbers must never make that look like his fault.
   */
  ghostTown: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function foldEarningsDays(opts: {
  from: Date;
  to: Date;
  ledger: LedgerRow[];
  fees: FeeRow[];
}): EarningsDay[] {
  const days = new Map<string, EarningsDay>();

  for (const date of serviceDateRange(opts.from, opts.to)) {
    days.set(date, {
      date,
      weekday: WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()]!,
      earnedXaf: 0,
      tripCount: 0,
      feeXaf: 0,
      worked: false,
      ghostTown: false,
    });
  }

  for (const entry of opts.ledger) {
    const day = days.get(serviceDateKey(entry.createdAt));
    if (!day) continue;
    if (entry.type === "FARE_CASH" || entry.type === "FARE_MOBILE") {
      day.earnedXaf += entry.amountXaf;
      day.tripCount += 1;
    }
  }

  for (const fee of opts.fees) {
    // serviceDate is already a Cameroon calendar day, stored at UTC midnight.
    const day = days.get(fee.serviceDate.toISOString().slice(0, 10));
    if (!day) continue;
    day.feeXaf += fee.amountXaf;
    day.worked = true;
  }

  for (const day of days.values()) {
    day.ghostTown = !day.worked && isMonday(day.date);
  }

  return [...days.values()];
}

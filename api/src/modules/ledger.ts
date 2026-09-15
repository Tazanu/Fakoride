/**
 * The ledger.
 *
 * Fako Ride does not take a cut of fares, so most entries here are a record of
 * money we never touched: the rider hands cash to the driver and the driver keeps
 * all of it. The only thing we actually charge is a flat access fee, once per
 * service day a driver actually worked.
 *
 * Sign convention: positive is money to the driver, negative is money from him.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { logger } from "../lib/logger";
import { serviceDate, serviceDateKey, startOfServiceDay, startOfServiceWeek, WAT_OFFSET_MINUTES } from "../lib/time";
import { foldEarningsDays, type EarningsDay } from "./earnings-math";

export { foldEarningsDays } from "./earnings-math";
export type { EarningsDay, FeeRow, LedgerRow } from "./earnings-math";

const MS_PER_DAY = 86_400_000;

/** Records the completed fare. Cash entries are informational — we held nothing. */
export async function recordFare(tripId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip?.driverId) return;

  const type = trip.paymentMethod === "CASH" ? "FARE_CASH" : "FARE_MOBILE";
  const existing = await prisma.ledgerEntry.findFirst({ where: { tripId, type } });
  if (existing) return; // completing twice must not pay twice

  await prisma.ledgerEntry.create({
    data: {
      driverId: trip.driverId,
      tripId,
      type,
      amountXaf: trip.priceXaf,
      note: trip.paymentMethod === "CASH" ? "Collected directly by the driver" : "Collected by mobile money",
    },
  });
}

/**
 * Charge the access fee for a driver's working day.
 *
 * Called when a driver first goes online on a given day — never on a schedule.
 * A driver who stayed off the road on a ghost-town Monday is never charged for
 * it, and the unique constraint makes a second call that day a no-op.
 *
 * The day is a Cameroon day, not a UTC one. Going online at half past midnight
 * must not be billed as yesterday, and an evening trip must not land in
 * tomorrow's earnings — see lib/time.
 */
export async function ensureAccessFee(driverId: string, when: Date = new Date()): Promise<void> {
  const date = serviceDate(when);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.accessFeeCharge.create({
        data: { driverId, serviceDate: date, amountXaf: env.ACCESS_FEE_XAF },
      });
      await tx.ledgerEntry.create({
        data: {
          driverId,
          type: "ACCESS_FEE",
          amountXaf: -env.ACCESS_FEE_XAF,
          note: `Access fee for ${serviceDateKey(when)}`,
        },
      });
    });
    logger.info({ driverId, serviceDate: date }, "access fee raised");
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // already charged today
    throw err;
  }
}

export type DriverBalance = {
  earnedXaf: number;
  feesXaf: number;
  keptXaf: number;
  tripCount: number;
};

/** Totals over an arbitrary window. */
export async function driverBalance(driverId: string, since: Date): Promise<DriverBalance> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { driverId, createdAt: { gte: since } },
    select: { type: true, amountXaf: true },
  });

  let earnedXaf = 0;
  let feesXaf = 0;
  let tripCount = 0;
  for (const e of entries) {
    if (e.type === "FARE_CASH" || e.type === "FARE_MOBILE") {
      earnedXaf += e.amountXaf;
      tripCount += 1;
    } else {
      feesXaf += Math.abs(e.amountXaf);
    }
  }

  return { earnedXaf, feesXaf, keptXaf: earnedXaf - feesXaf, tripCount };
}

// --- the week, one bar per day --------------------------------------------

export type WeekEarnings = {
  from: string;
  to: string;
  days: EarningsDay[];
  earnedXaf: number;
  feesXaf: number;
  keptXaf: number;
  tripCount: number;
  daysWorked: number;
  feesPaidCount: number;
};

/** The earnings screen: Monday to Sunday, in Cameroon time. */
export async function weeklyEarnings(driverId: string, at: Date = new Date()): Promise<WeekEarnings> {
  const weekStart = startOfServiceWeek(at);
  const from = new Date(weekStart.getTime() - WAT_OFFSET_MINUTES * 60_000); // WAT midnight, as real UTC
  const to = new Date(from.getTime() + 7 * MS_PER_DAY);

  const [ledger, fees] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { driverId, createdAt: { gte: from, lt: to } },
      select: { type: true, amountXaf: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.accessFeeCharge.findMany({
      where: {
        driverId,
        serviceDate: { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * MS_PER_DAY) },
      },
      select: { serviceDate: true, amountXaf: true, paid: true },
    }),
  ]);

  const days = foldEarningsDays({ from, to: new Date(to.getTime() - 1), ledger, fees });
  const earnedXaf = days.reduce((sum, d) => sum + d.earnedXaf, 0);
  const feesXaf = days.reduce((sum, d) => sum + d.feeXaf, 0);

  return {
    from: days[0]?.date ?? serviceDateKey(from),
    to: days[days.length - 1]?.date ?? serviceDateKey(to),
    days,
    earnedXaf,
    feesXaf,
    keptXaf: earnedXaf - feesXaf,
    tripCount: days.reduce((sum, d) => sum + d.tripCount, 0),
    daysWorked: days.filter((d) => d.worked).length,
    feesPaidCount: fees.filter((f) => f.paid).length,
  };
}

export type TodaySummary = {
  date: string;
  tripCount: number;
  earnedXaf: number;
  /** Always zero, and said out loud. It is the whole pitch to a driver. */
  commissionXaf: 0;
  accessFee: { amountXaf: number; paid: boolean } | null;
  keptXaf: number;
};

/** The three numbers across the top of the driver's home screen. */
export async function todaySummary(driverId: string, at: Date = new Date()): Promise<TodaySummary> {
  const dayStart = startOfServiceDay(at);

  const [fares, fee] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        driverId,
        createdAt: { gte: dayStart },
        type: { in: ["FARE_CASH", "FARE_MOBILE"] },
      },
      select: { amountXaf: true },
    }),
    prisma.accessFeeCharge.findUnique({
      where: { driverId_serviceDate: { driverId, serviceDate: serviceDate(at) } },
      select: { amountXaf: true, paid: true },
    }),
  ]);

  const earnedXaf = fares.reduce((sum, f) => sum + f.amountXaf, 0);

  return {
    date: serviceDateKey(at),
    tripCount: fares.length,
    earnedXaf,
    commissionXaf: 0,
    accessFee: fee ? { amountXaf: fee.amountXaf, paid: fee.paid } : null,
    keptXaf: earnedXaf - (fee?.amountXaf ?? 0),
  };
}

/**
 * Moving money, and what it does to the ledger.
 *
 * One rule runs through all of it: **the ledger is written when money lands,
 * never when it is asked for.** A driver's earnings must never include a fare
 * whose MoMo prompt was declined, and a day's access fee must not read as paid
 * because we tried. Every write here is guarded by the Payment row reaching
 * SUCCESSFUL, and guarded again by `ledgerEntryId` so a webhook arriving twice
 * cannot pay twice.
 *
 * The three money movements:
 *
 *   TRIP_FARE      rider → us, when they chose MoMo over cash. We hold it.
 *   ACCESS_FEE     driver → us, once per service day he worked.
 *   DRIVER_PAYOUT  us → driver, for the mobile fares we are holding.
 *
 * Cash never appears here. The driver takes it in his hand and we never touch
 * it — which is the whole commercial design, and the reason this file is as
 * small as it is.
 */

import { Prisma, type Payment, type PaymentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../env";
import { logger } from "../../lib/logger";
import { emitToDriver, emitToRider } from "../../realtime";
import { serviceDateKey } from "../../lib/time";
import { payments } from "./index";
import { MIN_TRANSFER_XAF, PaymentProviderError, type ProviderStatusResult } from "./provider";

const TERMINAL: PaymentStatus[] = ["SUCCESSFUL", "FAILED", "EXPIRED"];

const isTerminal = (status: PaymentStatus) => TERMINAL.includes(status);

/** Fapshi wants "mobile money" or "orange money"; our trips say MOMO or ORANGE_MONEY. */
function mediumFor(method: string): "mobile money" | "orange money" | undefined {
  if (method === "MOMO") return "mobile money";
  if (method === "ORANGE_MONEY") return "orange money";
  return undefined;
}

// --- collecting a fare ------------------------------------------------------

/**
 * Charge a completed trip that the rider chose to pay by phone.
 *
 * Called after the trip is already COMPLETED, because the trip record must not
 * depend on a payment provider being reachable — a driver on the Soppo climb
 * finishing a ride has to be able to finish it. If the charge then fails, the
 * fare becomes cash owed and both phones are told so.
 */
export async function chargeTripFare(tripId: string): Promise<Payment | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { rider: { select: { name: true, phone: true } } },
  });
  if (!trip?.driverId) return null;
  if (trip.paymentMethod === "CASH") return null;

  // Completing twice must not charge twice.
  const existing = await prisma.payment.findFirst({
    where: { tripId, purpose: "TRIP_FARE", status: { notIn: ["FAILED", "EXPIRED"] } },
  });
  if (existing) return existing;

  const payment = await prisma.payment.create({
    data: {
      purpose: "TRIP_FARE",
      amountXaf: trip.priceXaf,
      phone: trip.rider.phone,
      medium: mediumFor(trip.paymentMethod),
      tripId,
      driverId: trip.driverId,
      provider: payments.name,
    },
  });

  return initiate(payment, "collect", {
    message: `Fako Ride — ${trip.pickupLabel} to ${trip.dropLabel}`,
    name: trip.rider.name ?? undefined,
  });
}

// --- the daily access fee ---------------------------------------------------

/**
 * What happened when we tried to take a day's fee.
 *
 * The sweep has to tell these apart to report honestly. A fee we deferred is
 * not a fee that is paid, and a driver we have stopped asking needs a person to
 * call him, not another sweep. Collapsing all of it into `Payment | null` is
 * what made the run log say drivers were square when they were four refusals
 * deep — the one number you would actually want to trust.
 */
export type AccessFeeOutcome =
  | { kind: "charged"; payment: Payment }
  | { kind: "in_flight"; payment: Payment }
  | { kind: "deferred"; retryAfter: Date }
  | { kind: "exhausted"; attempts: number }
  | { kind: "already_paid" }
  | { kind: "no_charge" }
  | { kind: "below_floor"; amountXaf: number };

/**
 * One caller at a time for one key, while `decide` runs.
 *
 * "Is a payment already in flight? If not, record one" is two steps, and two
 * requests can both pass the first before either reaches the second. That is
 * how five cash-outs sent at once became four payouts of the same balance, and
 * how the background fee job and a manual sweep could both put a USSD prompt
 * on one driver's phone for one day's fee.
 *
 * A Postgres advisory lock held for the length of a transaction makes the pair
 * atomic: the second caller waits, then sees the row the first one wrote. It
 * holds across API instances, because the lock lives in the database. The call
 * to the provider happens afterwards, outside the lock, so a slow provider
 * never keeps anybody else waiting.
 */
async function oneAtATime<T>(key: string, decide: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // FROM, not a bare SELECT: the function returns void, which Prisma cannot read.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
    return decide(tx);
  });
}

/**
 * Debit one day's access fee from the driver's own MoMo, and say what happened.
 *
 * The charge row was raised the moment he went online; this is the separate act
 * of actually taking the 500. Never charges a day twice, and never charges a day
 * he did not work, because no charge row exists for one.
 */
export async function collectAccessFeeOutcome(
  accessFeeChargeId: string,
  opts: { force?: boolean } = {},
): Promise<AccessFeeOutcome> {
  const charge = await prisma.accessFeeCharge.findUnique({
    where: { id: accessFeeChargeId },
    include: { driver: { include: { user: { select: { name: true, phone: true } } } } },
  });
  if (!charge) return { kind: "no_charge" };

  // Everything that decides whether to ask his phone for money, under one lock
  // per charge. Only the decision; the asking happens after the lock is gone.
  type Decision = AccessFeeOutcome | { kind: "create"; payment: Payment };
  const decided = await oneAtATime(`access-fee:${accessFeeChargeId}`, async (tx): Promise<Decision> => {
    const fresh = await tx.accessFeeCharge.findUnique({ where: { id: accessFeeChargeId }, select: { paid: true } });
    if (!fresh) return { kind: "no_charge" };
    if (fresh.paid) return { kind: "already_paid" };

    const inFlight = await tx.payment.findFirst({
      where: { accessFeeChargeId, status: { notIn: ["FAILED", "EXPIRED"] } },
    });
    if (inFlight) return { kind: "in_flight", payment: inFlight };

    /**
     * Back off after a refusal.
     *
     * Every attempt puts a USSD prompt on a real person's handset. Without this,
     * a driver whose MoMo is empty gets one every time the sweep runs — every
     * thirty seconds, all day, for 500 francs he does not have. That is how an
     * app gets uninstalled.
     *
     * `force` is how ops overrides it from the console, which is the right
     * escape hatch: a person has decided to try again, usually because the driver
     * is on the phone saying he has topped up.
     */
    if (!opts.force) {
      // Anything not terminal was caught by the in-flight check above, so every
      // row here is a refusal.
      const attempts = await tx.payment.findMany({
        where: { accessFeeChargeId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      if (attempts.length >= env.ACCESS_FEE_MAX_ATTEMPTS) {
        // Stop asking. Somebody has to talk to him now, and the ops queue shows
        // the failure with its reason.
        return { kind: "exhausted", attempts: attempts.length };
      }

      const last = attempts[0]?.createdAt;
      const waitMs = env.ACCESS_FEE_RETRY_AFTER_MINUTES * 60_000;
      if (last && Date.now() - last.getTime() < waitMs) {
        return { kind: "deferred", retryAfter: new Date(last.getTime() + waitMs) };
      }
    }

    if (charge.amountXaf < MIN_TRANSFER_XAF) {
      logger.error({ accessFeeChargeId, amountXaf: charge.amountXaf }, "access fee is below the mobile money floor");
      return { kind: "below_floor", amountXaf: charge.amountXaf };
    }

    const payment = await tx.payment.create({
      data: {
        purpose: "ACCESS_FEE",
        amountXaf: charge.amountXaf,
        phone: charge.driver.user.phone,
        driverId: charge.driverId,
        accessFeeChargeId,
        provider: payments.name,
      },
    });
    return { kind: "create", payment };
  });

  if (decided.kind !== "create") return decided;
  return {
    kind: "charged",
    payment: await initiate(decided.payment, "collect", {
      message: `Fako Ride access fee for ${serviceDateKey(charge.serviceDate)}`,
      name: charge.driver.user.name ?? undefined,
    }),
  };
}

/**
 * The same thing, for callers that only need the Payment.
 *
 * The ops console retries one driver and wants the row back to show him; it has
 * already checked the charge is unpaid and passes `force`, so the outcomes it
 * can hit are "charged" or a refusal it renders as one.
 */
export async function collectAccessFee(
  accessFeeChargeId: string,
  opts: { force?: boolean } = {},
): Promise<Payment | null> {
  const outcome = await collectAccessFeeOutcome(accessFeeChargeId, opts);
  return outcome.kind === "charged" || outcome.kind === "in_flight" ? outcome.payment : null;
}

/**
 * What one sweep did.
 *
 * Every charge the sweep looked at lands in exactly one of these, and they sum
 * to `due`. That property is the point: it is what stops a deferred fee from
 * being quietly counted as a paid one.
 */
export type AccessFeeSweep = {
  /** Charges we put a fresh prompt on. The only number that cost anybody a USSD. */
  attempted: number;
  /** A prompt from an earlier run is still outstanding. */
  inFlight: number;
  /** Refused recently — waiting out the backoff, and still owed. */
  deferred: number;
  /** Out of attempts. These need a person to call the driver. */
  exhausted: number;
  /** Paid between the query and the attempt. A race, so normally zero. */
  alreadyPaid: number;
  /** Below the mobile money floor. A data problem, not a driver problem. */
  belowFloor: number;
  /** Charges that vanished mid-sweep. Normally zero. */
  missing: number;
  /** How many unpaid charges the sweep looked at. */
  due: number;
};

/**
 * The morning sweep.
 *
 * Collects every fee raised for a day that is already over. Deliberately not
 * "every unpaid fee": a driver still out working today is charged tomorrow
 * morning, which is what the driver app promises him and gives him the day's
 * takings to pay it from.
 */
export async function runAccessFeeCollection(now: Date = new Date()): Promise<AccessFeeSweep> {
  const today = serviceDateKey(now);
  const due = await prisma.accessFeeCharge.findMany({
    where: { paid: false, serviceDate: { lt: new Date(`${today}T00:00:00.000Z`) } },
    orderBy: { serviceDate: "asc" },
    take: 200,
    select: { id: true },
  });

  const sweep: AccessFeeSweep = {
    attempted: 0,
    inFlight: 0,
    deferred: 0,
    exhausted: 0,
    alreadyPaid: 0,
    belowFloor: 0,
    missing: 0,
    due: due.length,
  };

  for (const charge of due) {
    const outcome = await collectAccessFeeOutcome(charge.id);
    switch (outcome.kind) {
      case "charged":
        sweep.attempted += 1;
        break;
      case "in_flight":
        sweep.inFlight += 1;
        break;
      case "deferred":
        sweep.deferred += 1;
        break;
      case "exhausted":
        sweep.exhausted += 1;
        break;
      case "already_paid":
        sweep.alreadyPaid += 1;
        break;
      case "below_floor":
        sweep.belowFloor += 1;
        break;
      case "no_charge":
        sweep.missing += 1;
        break;
    }
  }

  // Quiet when the sweep had nothing to do, which is most of the time. Loud
  // when money moved, and loud when drivers have run out of attempts, because
  // that is the queue somebody has to work through.
  if (sweep.attempted > 0 || sweep.exhausted > 0) {
    logger.info(sweep, "access fee collection run");
  }
  return sweep;
}

// --- paying a driver out ----------------------------------------------------

export type DriverPayable = {
  /** Mobile fares we are holding for him, less what we have already sent. */
  payableXaf: number;
  heldXaf: number;
  paidOutXaf: number;
};

/**
 * What we still owe a driver.
 *
 * Only mobile fares count. Cash he was handed at the roadside is already his,
 * and we were never holding it — which is why this number is usually small and
 * why the daily fee is taken from his own MoMo rather than netted off it.
 */
export async function driverPayable(driverId: string): Promise<DriverPayable> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { driverId, type: { in: ["FARE_MOBILE", "PAYOUT", "ADJUSTMENT"] } },
    select: { type: true, amountXaf: true },
  });

  let heldXaf = 0;
  let paidOutXaf = 0;
  for (const e of entries) {
    if (e.type === "PAYOUT") paidOutXaf += Math.abs(e.amountXaf);
    else heldXaf += e.amountXaf;
  }

  return { payableXaf: heldXaf - paidOutXaf, heldXaf, paidOutXaf };
}

/** "Send it to my MoMo". Refuses to send more than we are holding. */
export async function requestPayout(driverId: string, amountXaf?: number): Promise<Payment> {
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: driverId },
    include: { user: { select: { name: true, phone: true } } },
  });

  // One at a time per driver, or concurrent requests all pass the balance
  // check and each sends the whole balance. Under the lock the second request
  // sees the first one's payout row and is turned away.
  const payment = await oneAtATime(`payout:${driverId}`, async (tx) => {
    const inFlight = await tx.payment.findFirst({
      where: { driverId, purpose: "DRIVER_PAYOUT", status: { notIn: ["FAILED", "EXPIRED"] }, confirmedAt: null },
    });
    if (inFlight) throw new PaymentProviderError("A payout is already on its way.", false, 409);

    const { payableXaf } = await driverPayable(driverId);
    const amount = amountXaf ?? payableXaf;

    if (amount <= 0) throw new PaymentProviderError("There is nothing to send yet.", false, 400);
    if (amount > payableXaf) {
      throw new PaymentProviderError(`We are only holding ${payableXaf} XAF for you.`, false, 400);
    }
    if (amount < MIN_TRANSFER_XAF) {
      throw new PaymentProviderError(`Mobile money will not move less than ${MIN_TRANSFER_XAF} XAF.`, false, 400);
    }

    return tx.payment.create({
      data: {
        purpose: "DRIVER_PAYOUT",
        amountXaf: amount,
        phone: driver.user.phone,
        driverId,
        provider: payments.name,
      },
    });
  });

  const sent = await initiate(payment, "payout", {
    message: "Fako Ride earnings",
    name: driver.user.name ?? undefined,
  });
  return sent;
}

// --- talking to the provider ------------------------------------------------

/**
 * Hand a prepared Payment row to the provider.
 *
 * The row is written first, always. If the call then times out we still have a
 * record with our externalId on it, and reconciliation can find out what
 * happened — whereas calling first and recording after loses money silently.
 */
async function initiate(
  payment: Payment,
  direction: "collect" | "payout",
  extra: { message: string; name?: string },
): Promise<Payment> {
  try {
    const ref = await payments[direction]({
      amountXaf: payment.amountXaf,
      phone: payment.phone,
      medium: payment.medium as "mobile money" | "orange money" | undefined,
      externalId: payment.id,
      message: extra.message,
      name: extra.name,
    });

    return await prisma.payment.update({
      where: { id: payment.id },
      data: { providerTransId: ref.transId, status: "PENDING" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    const retryable = err instanceof PaymentProviderError ? err.retryable : false;

    // A retryable failure is left CREATED so the reconciler tries again; a
    // refusal is final, and pretending otherwise puts the same declined prompt
    // on somebody's phone every minute.
    const failed = await prisma.payment.update({
      where: { id: payment.id },
      data: retryable ? { failureReason: message } : { status: "FAILED", failureReason: message },
    });

    logger.error({ paymentId: payment.id, purpose: payment.purpose, retryable, err: message }, "payment failed");
    if (!retryable) await onFailure(failed);
    return failed;
  }
}

/**
 * Apply what the provider says about a payment. The only path to SUCCESSFUL.
 *
 * Idempotent in both directions: a webhook and a reconciler poll can both
 * deliver the same result, in either order, and the ledger is written once.
 */
export async function applyProviderStatus(
  paymentId: string,
  result: ProviderStatusResult,
): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;

  // Money that landed does not un-land. Once a payment is SUCCESSFUL nothing
  // moves it again — a late or out-of-order FAILED must never take a fare back
  // out of a driver's earnings, and a replayed SUCCESSFUL must not pay twice.
  if (payment.status === "SUCCESSFUL") return payment;
  // A settled failure only changes if the provider now says the money moved.
  if (isTerminal(payment.status) && result.status !== "SUCCESSFUL") return payment;

  // The provider moved a different sum from the one we asked for. Settling it
  // would write our figure into the ledger over a transfer that was not that
  // figure, so it stays where it is and a person looks at it.
  if (
    result.status === "SUCCESSFUL" &&
    result.amountXaf !== undefined &&
    result.amountXaf !== payment.amountXaf
  ) {
    logger.error(
      { paymentId: payment.id, expected: payment.amountXaf, reported: result.amountXaf },
      "payment: provider reports a different amount — NOT settled, needs a person",
    );
    return payment;
  }

  if (result.status !== "SUCCESSFUL") {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: result.status,
        failureReason: result.reason ?? payment.failureReason,
        ...(result.financialTransId ? { financialTransId: result.financialTransId } : {}),
      },
    });
    if (isTerminal(updated.status)) await onFailure(updated);
    return updated;
  }

  // The provider says the money moved. Everything below happens once.
  return settle(payment, result);
}

/**
 * Settle a payment the provider has confirmed.
 *
 * What gets written depends on what the money was for, and the difference
 * matters:
 *
 *   TRIP_FARE      a new FARE_MOBILE entry — this is the moment it becomes
 *                  earnings, and the only moment it could have
 *   DRIVER_PAYOUT  a new PAYOUT entry, reducing what we still hold for him
 *   ACCESS_FEE     **no ledger entry at all.** The fee was already written the
 *                  moment he went online: he owes it for the day he worked
 *                  whether or not the debit goes through, and the ledger
 *                  records the obligation, not the collection. Writing another
 *                  one here would charge him twice on the earnings screen.
 *                  Whether it was actually paid lives on AccessFeeCharge.
 *
 * The claim is the idempotency guard: only the transition *into* SUCCESSFUL
 * does any work, so a webhook and a reconciler poll arriving together — or the
 * same webhook twice — settle once.
 */
async function settle(payment: Payment, result: ProviderStatusResult): Promise<Payment> {
  const confirmedAt = result.confirmedAt ? new Date(result.confirmedAt) : new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "SUCCESSFUL" } },
        data: {
          status: "SUCCESSFUL",
          confirmedAt,
          ...(result.financialTransId ? { financialTransId: result.financialTransId } : {}),
        },
      });
      // Somebody else got here first, and did everything below.
      if (claimed.count === 0) return await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });

      if (payment.purpose === "ACCESS_FEE") {
        if (payment.accessFeeChargeId) {
          await tx.accessFeeCharge.update({
            where: { id: payment.accessFeeChargeId },
            data: { paid: true, paidAt: confirmedAt, providerRef: payment.providerTransId, failureCode: null },
          });
        }
        // No ledger entry: the obligation was recorded when he went online.
        return await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      }

      const entry = await tx.ledgerEntry.create({
        data: {
          driverId: payment.driverId!,
          tripId: payment.tripId,
          type: payment.purpose === "TRIP_FARE" ? "FARE_MOBILE" : "PAYOUT",
          // Positive is money to the driver. A fare he earned is positive; a
          // payout leaves the balance we are holding for him.
          amountXaf: payment.purpose === "TRIP_FARE" ? payment.amountXaf : -payment.amountXaf,
          note: payment.purpose === "TRIP_FARE" ? "Collected by mobile money" : "Sent to your MoMo",
        },
      });

      return await tx.payment.update({
        where: { id: payment.id },
        data: { ledgerEntryId: entry.id },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Two settlements raced. The other one won, which is the correct outcome.
      return await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }
    throw err;
  }
}

/**
 * A payment that will not happen.
 *
 * Nobody is left guessing: a failed fare becomes cash the driver has to collect
 * before the rider walks away, and both phones are told immediately.
 */
async function onFailure(payment: Payment): Promise<void> {
  if (payment.purpose === "ACCESS_FEE" && payment.accessFeeChargeId) {
    await prisma.accessFeeCharge.update({
      where: { id: payment.accessFeeChargeId },
      data: { failureCode: payment.failureReason?.slice(0, 200) ?? "failed" },
    });
    return;
  }

  if (payment.purpose === "TRIP_FARE" && payment.tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: payment.tripId },
      select: { riderId: true, driverId: true, priceXaf: true },
    });
    if (!trip) return;

    await prisma.tripEvent.create({
      data: {
        tripId: payment.tripId,
        status: "COMPLETED",
        actor: "system",
        meta: { mobilePaymentFailed: true, reason: payment.failureReason },
      },
    });

    const detail = { tripId: payment.tripId, amountXaf: trip.priceXaf, reason: payment.failureReason };
    emitToRider(trip.riderId, "trip:payment_failed", detail);
    if (trip.driverId) emitToDriver(trip.driverId, "trip:payment_failed", detail);
  }
}

// --- reconciliation ---------------------------------------------------------

/**
 * Ask the provider what happened to one payment, and apply its answer.
 *
 * What the webhook calls. A webhook is a message that says "go and look", not
 * a statement to be believed: its only proof is a shared secret, and a secret
 * leaks — a log line, a screenshot of the dashboard, a former contractor. Taken
 * at its word it would let whoever holds the secret mark any pending fare paid.
 * Asked about by our stored reference, the provider can only tell us the truth
 * about transactions that are really ours.
 */
export async function verifyWithProvider(paymentId: string): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.providerTransId) return payment;
  const result = await payments.status(payment.providerTransId);
  return applyProviderStatus(payment.id, result);
}

/**
 * Ask the provider about payments we have not heard back on.
 *
 * Webhooks get lost — a deploy, a dropped connection, a misconfigured URL — and
 * a lost webhook here means a driver is never paid. This is the backstop, and
 * it is the reason webhooks are an optimisation rather than the mechanism.
 */
export async function reconcilePendingPayments(limit = 50): Promise<number> {
  const cutoff = new Date(Date.now() - env.PAYMENT_RECONCILE_AFTER_SECONDS * 1000);
  const stale = await prisma.payment.findMany({
    where: { status: { in: ["CREATED", "PENDING"] }, updatedAt: { lt: cutoff } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let settled = 0;
  for (const payment of stale) {
    // No transId means the provider never accepted it. Try again from scratch.
    if (!payment.providerTransId) {
      await retryInitiation(payment);
      continue;
    }
    try {
      const result = await payments.status(payment.providerTransId);
      const updated = await applyProviderStatus(payment.id, result);
      if (updated && isTerminal(updated.status)) settled += 1;
    } catch (err) {
      logger.warn({ paymentId: payment.id, err: String(err) }, "could not reconcile payment");
    }
  }
  return settled;
}

/** A payment the provider never accepted. Re-sent, not re-created. */
async function retryInitiation(payment: Payment): Promise<void> {
  if (payment.purpose === "TRIP_FARE" && payment.tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: payment.tripId },
      select: { pickupLabel: true, dropLabel: true },
    });
    await initiate(payment, "collect", {
      message: trip ? `Fako Ride — ${trip.pickupLabel} to ${trip.dropLabel}` : "Fako Ride fare",
    });
    return;
  }
  if (payment.purpose === "ACCESS_FEE") {
    await initiate(payment, "collect", { message: "Fako Ride access fee" });
    return;
  }
  await initiate(payment, "payout", { message: "Fako Ride earnings" });
}

/**
 * Both background jobs, on one timer.
 *
 * An interval rather than an external cron so a single-box deployment needs no
 * extra moving part. The access-fee sweep is safe to run often: it only ever
 * picks up charges for days that are already over, and never charges twice.
 */
export function startPaymentJobs(intervalMs = env.PAYMENT_JOB_INTERVAL_SECONDS * 1000): NodeJS.Timeout {
  return setInterval(() => {
    void reconcilePendingPayments().catch((err) => logger.error({ err }, "payment reconciliation failed"));
    void runAccessFeeCollection().catch((err) => logger.error({ err }, "access fee collection failed"));
  }, intervalMs);
}

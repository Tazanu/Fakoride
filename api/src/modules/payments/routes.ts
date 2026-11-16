/**
 * The endpoints around money.
 *
 * Three audiences: the provider (one webhook), the driver (his balance and
 * "send it to my MoMo"), and ops (what failed, and why).
 */

import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { env } from "../../env";
import { ApiError, asyncHandler, param } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { logger } from "../../lib/logger";
import { oneAtATime } from "../../lib/locks";
import { payments } from "./index";
import { PaymentProviderError } from "./provider";
import { serviceDate, serviceDateKey } from "../../lib/time";
import { overdueAccessFees } from "../ledger";
import {
  applyProviderStatus,
  collectAccessFee,
  collectAccessFeeOutcome,
  driverPayable,
  requestPayout,
  runAccessFeeCollection,
  verifyWithProvider,
} from "./service";

/** Fapshi posts the payment-status body; these are the fields we act on. */
const webhookSchema = z
  .object({
    transId: z.string().min(1),
    status: z.string().optional(),
    externalId: z.string().optional(),
    amount: z.number().optional(),
    financialTransId: z.string().optional(),
    reason: z.string().optional(),
    dateConfirmed: z.string().optional(),
  })
  .passthrough();

/**
 * Constant-time compare, so a wrong secret cannot be discovered a byte at a
 * time by timing the responses.
 */
function secretMatches(supplied: string | undefined, expected: string): boolean {
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function paymentsWebhookRouter(): Router {
  const router = Router();

  /**
   * Fapshi calls this when a payment reaches SUCCESSFUL, FAILED or EXPIRED.
   *
   * Unauthenticated in the usual sense — there is no bearer token — so the
   * shared secret in `x-wh-secret` is the whole of the authentication, and a
   * deployment without one refuses every webhook rather than trusting anybody
   * who can find the URL. Losing webhooks is survivable; the reconciler polls.
   * Accepting forged ones is not: it would let a stranger mark fares paid.
   */
  router.post(
    "/webhook",
    asyncHandler(async (req, res) => {
      if (!env.FAPSHI_WEBHOOK_SECRET) {
        logger.error("a payment webhook arrived but FAPSHI_WEBHOOK_SECRET is not set — refusing it");
        throw new ApiError(503, "webhook_not_configured", "Webhooks are not configured.");
      }
      if (!secretMatches(req.header("x-wh-secret") ?? undefined, env.FAPSHI_WEBHOOK_SECRET)) {
        logger.warn({ ip: req.ip }, "payment webhook with a bad secret");
        throw new ApiError(401, "bad_signature", "No.");
      }

      const body = webhookSchema.parse(req.body);

      // externalId is our own Payment id and is the reliable key; transId is
      // the fallback for a provider that does not echo it back.
      const payment = body.externalId
        ? await prisma.payment.findUnique({ where: { id: body.externalId } })
        : await prisma.payment.findUnique({ where: { providerTransId: body.transId } });

      if (!payment) {
        // 200, deliberately: a webhook for something we do not know about must
        // not be retried forever by the provider.
        logger.warn({ transId: body.transId, externalId: body.externalId }, "webhook for an unknown payment");
        res.json({ received: true, matched: false });
        return;
      }

      // What the body says happened is not used. It is a prompt to go and ask:
      // the answer comes from the provider, about our own stored reference.
      try {
        const updated = await verifyWithProvider(payment.id);
        res.json({ received: true, matched: true, status: updated?.status ?? payment.status });
      } catch (err) {
        if (!(err instanceof PaymentProviderError)) throw err;
        // The provider could not be asked just now. 200 all the same, so the
        // webhook is not retried into a storm; the reconciler asks again shortly.
        logger.warn({ paymentId: payment.id, err: err.message }, "webhook: could not verify with the provider yet");
        res.json({ received: true, matched: true, status: payment.status, verified: false });
      }
    }),
  );

  return router;
}

/** Mounted under /drivers — the money half of the driver app. */
export function driverPaymentsRouter(): Router {
  const router = Router();

  async function currentDriverId(userId: string): Promise<string> {
    const driver = await prisma.driver.findUnique({ where: { userId }, select: { id: true } });
    if (!driver) throw new ApiError(403, "not_a_driver", "This account is not registered as a driver.");
    return driver.id;
  }

  /** What we are holding for him, which is only ever mobile fares. */
  router.get(
    "/me/balance",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driverId = await currentDriverId(req.user!.sub);
      const [payable, overdue, unpaidFees] = await Promise.all([
        driverPayable(driverId),
        overdueAccessFees(driverId),
        prisma.accessFeeCharge.findMany({
          where: { driverId, paid: false },
          orderBy: { serviceDate: "asc" },
          select: { serviceDate: true, amountXaf: true, failureCode: true },
        }),
      ]);

      res.json({
        ...payable,
        // Cash fares never appear here; he already has that money.
        note: "Cash fares are already yours. This is only what we are holding.",
        unpaidFees: unpaidFees.map((f) => ({
          date: f.serviceDate.toISOString().slice(0, 10),
          amountXaf: f.amountXaf,
          lastFailure: f.failureCode,
        })),
        unpaidFeesXaf: unpaidFees.reduce((sum, f) => sum + f.amountXaf, 0),
        // The part of that old enough to stop him going online. Zero: he may.
        overdueFeesXaf: overdue.owedXaf,
      });
    }),
  );

  /**
   * "Pay it now."
   *
   * The sweep asks his MoMo on its own schedule and gives up after a few
   * refusals. A driver who has topped up and wants to work should not have to
   * ring anybody: this puts the prompt for his oldest unpaid day on his phone
   * straight away. One day per press — two prompts at once on one handset is
   * how the second gets dismissed unread.
   *
   * Only days that are over. Today's fee is taken tomorrow morning, as the app
   * has always told him.
   */
  router.post(
    "/me/fees/pay",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driverId = await currentDriverId(req.user!.sub);
      const today = serviceDate();
      const due = await prisma.accessFeeCharge.findMany({
        where: { driverId, paid: false, serviceDate: { lt: today } },
        orderBy: { serviceDate: "asc" },
        select: { id: true, serviceDate: true, amountXaf: true },
      });
      const oldest = due[0];
      if (!oldest) {
        res.json({ status: "NOTHING_DUE", remainingXaf: 0 });
        return;
      }

      // force: he asked. The backoff exists to stop us pestering him.
      const outcome = await collectAccessFeeOutcome(oldest.id, { force: true });
      const remainingXaf = due.reduce((sum, c) => sum + c.amountXaf, 0);
      const day = oldest.serviceDate.toISOString().slice(0, 10);

      if (outcome.kind === "charged" || outcome.kind === "in_flight") {
        res.status(outcome.kind === "charged" ? 201 : 200).json({
          // PENDING: the prompt is on his phone. FAILED: his MoMo said no.
          status: outcome.payment.status,
          paymentId: outcome.payment.id,
          amountXaf: outcome.payment.amountXaf,
          day,
          failureReason: outcome.payment.failureReason,
          remainingXaf,
        });
        return;
      }
      if (outcome.kind === "already_paid") {
        res.json({ status: "SUCCESSFUL", amountXaf: oldest.amountXaf, day, remainingXaf: remainingXaf - oldest.amountXaf });
        return;
      }
      throw new ApiError(409, "not_collectable", "That fee cannot be collected. Call us.");
    }),
  );

  /** "Send it to my MoMo." */
  router.post(
    "/me/cashout",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { amountXaf } = z.object({ amountXaf: z.number().int().positive().optional() }).parse(req.body ?? {});
      const driverId = await currentDriverId(req.user!.sub);

      try {
        const payment = await requestPayout(driverId, amountXaf);
        res.status(201).json({
          id: payment.id,
          amountXaf: payment.amountXaf,
          status: payment.status,
          // Never "sent": it is on its way, and saying otherwise to somebody
          // watching their phone for a notification is a lie.
          next: payment.status === "FAILED" ? "That did not go through." : "On its way to your MoMo.",
          failureReason: payment.failureReason,
        });
      } catch (err) {
        if (err instanceof PaymentProviderError) {
          throw new ApiError(err.status ?? 400, "payout_refused", err.message);
        }
        throw err;
      }
    }),
  );

  /** Every movement of real money on this account. */
  router.get(
    "/me/payments",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driverId = await currentDriverId(req.user!.sub);
      const rows = await prisma.payment.findMany({
        where: { driverId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          purpose: true,
          status: true,
          amountXaf: true,
          createdAt: true,
          confirmedAt: true,
          failureReason: true,
        },
      });
      res.json({ payments: rows });
    }),
  );

  return router;
}

/** Mounted under /admin. */
export function adminPaymentsRouter(): Router {
  const router = Router();

  /** What is stuck or broken, worst first. */
  router.get(
    "/payments",
    asyncHandler(async (req, res) => {
      const { status, purpose } = z
        .object({
          status: z.enum(["CREATED", "PENDING", "SUCCESSFUL", "FAILED", "EXPIRED"]).optional(),
          purpose: z.enum(["TRIP_FARE", "ACCESS_FEE", "DRIVER_PAYOUT"]).optional(),
        })
        .parse(req.query);

      const [rows, failed, pending] = await Promise.all([
        prisma.payment.findMany({
          where: { ...(status ? { status } : {}), ...(purpose ? { purpose } : {}) },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { driver: { select: { plate: true, user: { select: { name: true } } } } },
        }),
        prisma.payment.count({ where: { status: "FAILED" } }),
        prisma.payment.count({ where: { status: { in: ["CREATED", "PENDING"] } } }),
      ]);

      res.json({
        provider: payments.name,
        failed,
        stillMoving: pending,
        payments: rows.map((p) => ({
          id: p.id,
          purpose: p.purpose,
          status: p.status,
          amountXaf: p.amountXaf,
          phone: p.phone,
          driver: p.driver?.user.name ?? null,
          plate: p.driver?.plate ?? null,
          providerTransId: p.providerTransId,
          financialTransId: p.financialTransId,
          failureReason: p.failureReason,
          // What it was for, so the console can act on the thing itself:
          // charge the day again, or open the trip.
          accessFeeChargeId: p.accessFeeChargeId,
          tripId: p.tripId,
          createdAt: p.createdAt,
          confirmedAt: p.confirmedAt,
        })),
      });
    }),
  );

  /** Ask the provider again about one payment, when somebody is on the phone. */
  router.post(
    "/payments/:id/refresh",
    asyncHandler(async (req, res) => {
      const payment = await prisma.payment.findUnique({ where: { id: param(req, "id") } });
      if (!payment) throw new ApiError(404, "no_payment", "No such payment.");
      if (!payment.providerTransId) {
        throw new ApiError(409, "never_sent", "The provider never accepted this one.");
      }

      const result = await payments.status(payment.providerTransId);
      const updated = await applyProviderStatus(payment.id, result);
      res.json({ id: payment.id, status: updated?.status, providerSaid: result.status });
    }),
  );

  /** Run the morning sweep now, rather than waiting for the timer. */
  router.post(
    "/access-fees/collect",
    asyncHandler(async (_req, res) => {
      res.json(await runAccessFeeCollection());
    }),
  );

  /**
   * Retry one driver's fee.
   *
   * What ops does when a debit failed and the driver has since topped up — the
   * sweep would get there eventually, but "eventually" is not an answer to give
   * somebody who is on the phone.
   */
  router.post(
    "/access-fees/:id/collect",
    asyncHandler(async (req, res) => {
      const chargeId = param(req, "id");
      const charge = await prisma.accessFeeCharge.findUnique({ where: { id: chargeId } });
      if (!charge) throw new ApiError(404, "no_charge", "No such access fee.");
      if (charge.paid) throw new ApiError(409, "already_paid", "That day is already paid.");

      // force: a person decided to try again, usually with the driver on the
      // phone saying he has topped up. The backoff is for the automatic sweep.
      const payment = await collectAccessFee(chargeId, { force: true });
      if (!payment) throw new ApiError(409, "not_collectable", "That fee cannot be collected.");

      res.json({
        paymentId: payment.id,
        status: payment.status,
        amountXaf: payment.amountXaf,
        failureReason: payment.failureReason,
      });
    }),
  );

  /**
   * Let one day's fee go.
   *
   * Now that an old unpaid fee stops a driver going online, there has to be a
   * way to say "this one was our mistake" — he was charged for a day the app
   * was down, or went online by accident and off again. Without it the only
   * tools ops had were "ask his MoMo again" and nothing.
   *
   * The charge is settled at zero and the ledger entry that raised it is
   * written back, with the reason, so his earnings screen stops counting a fee
   * he was let off. Nothing is deleted: both rows stay, and say what happened.
   */
  router.post(
    "/access-fees/:id/waive",
    asyncHandler(async (req, res) => {
      const { reason } = z.object({ reason: z.string().trim().min(5).max(300) }).parse(req.body);
      const chargeId = param(req, "id");

      const waived = await oneAtATime(`access-fee:${chargeId}`, async (tx) => {
        const charge = await tx.accessFeeCharge.findUnique({ where: { id: chargeId } });
        if (!charge) throw new ApiError(404, "no_charge", "No such access fee.");
        if (charge.paid) throw new ApiError(409, "already_paid", "That day is already settled.");

        const inFlight = await tx.payment.findFirst({
          where: { accessFeeChargeId: chargeId, status: { in: ["CREATED", "PENDING"] } },
          select: { id: true },
        });
        if (inFlight) {
          throw new ApiError(409, "payment_in_flight", "A payment for that day is still on his phone. Wait for it to settle.");
        }

        const day = charge.serviceDate.toISOString().slice(0, 10);
        await tx.ledgerEntry.create({
          data: {
            driverId: charge.driverId,
            type: "ACCESS_FEE",
            amountXaf: charge.amountXaf,
            note: `Access fee for ${day} waived on ${serviceDateKey()}: ${reason}`,
            // Dated with the fee it cancels, so any window that counts the one
            // counts the other, and no week ever shows a negative fee.
            createdAt: charge.createdAt,
          },
        });
        return tx.accessFeeCharge.update({
          where: { id: chargeId },
          data: { amountXaf: 0, paid: true, paidAt: new Date(), providerRef: "WAIVED", failureCode: null },
        });
      });

      logger.info({ chargeId, by: req.user!.sub, reason }, "access fee waived");
      res.json({ id: waived.id, waived: true });
    }),
  );

  /**
   * Correct what we are holding for a driver.
   *
   * The one money movement the provider cannot make for us. A rider charged
   * twice is refunded from the Fapshi dashboard by a person; the fare the
   * driver was credited for it then has to come back off what we hold for him,
   * and until now nothing could write that. Positive adds to what we hold,
   * negative takes from it, and it can never take more than is there.
   */
  router.post(
    "/drivers/:id/adjustments",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          amountXaf: z.number().int().refine((n) => n !== 0, "An adjustment of nothing is not an adjustment."),
          reason: z.string().trim().min(5).max(300),
        })
        .parse(req.body);
      const driverId = param(req, "id");

      // The same lock a cash-out takes, so the two cannot both spend one balance.
      const result = await oneAtATime(`payout:${driverId}`, async (tx) => {
        const driver = await tx.driver.findUnique({ where: { id: driverId }, select: { id: true } });
        if (!driver) throw new ApiError(404, "no_driver", "No such driver.");

        const entries = await tx.ledgerEntry.findMany({
          where: { driverId, type: { in: ["FARE_MOBILE", "PAYOUT", "ADJUSTMENT"] } },
          select: { amountXaf: true },
        });
        const holding = entries.reduce((sum, e) => sum + e.amountXaf, 0);
        if (holding + body.amountXaf < 0) {
          throw new ApiError(409, "more_than_held", `We are only holding ${holding} XAF for this driver.`);
        }

        const entry = await tx.ledgerEntry.create({
          data: { driverId, type: "ADJUSTMENT", amountXaf: body.amountXaf, note: `${body.reason} (by ${req.user!.sub})` },
        });
        return { id: entry.id, payableXaf: holding + body.amountXaf };
      });

      logger.info({ driverId, amountXaf: body.amountXaf, by: req.user!.sub }, "ledger adjusted by ops");
      res.status(201).json(result);
    }),
  );

  return router;
}

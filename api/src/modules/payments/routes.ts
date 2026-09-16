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
import { payments } from "./index";
import { normaliseStatus, PaymentProviderError } from "./provider";
import {
  applyProviderStatus,
  collectAccessFee,
  driverPayable,
  requestPayout,
  runAccessFeeCollection,
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

      await applyProviderStatus(payment.id, {
        transId: body.transId,
        status: normaliseStatus(body.status),
        amountXaf: body.amount,
        financialTransId: body.financialTransId,
        externalId: body.externalId,
        reason: body.reason,
        confirmedAt: body.dateConfirmed,
      });

      res.json({ received: true, matched: true });
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
      const [payable, unpaidFees] = await Promise.all([
        driverPayable(driverId),
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
      });
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

      const payment = await collectAccessFee(chargeId);
      if (!payment) throw new ApiError(409, "not_collectable", "That fee cannot be collected.");

      res.json({
        paymentId: payment.id,
        status: payment.status,
        amountXaf: payment.amountXaf,
        failureReason: payment.failureReason,
      });
    }),
  );

  return router;
}

/**
 * The trip lifecycle.
 *
 * REQUESTED → OFFERED → ACCEPTED → ARRIVED → IN_PROGRESS → COMPLETED
 *
 * Two rules hold the whole thing together:
 *   1. The price is quoted once, at request time, and never recalculated. A fare
 *      that can move after booking is the thing we are replacing.
 *   2. Every transition appends a TripEvent. A driver's phone dropping signal on
 *      the Soppo climb must never be able to lose a trip record.
 */

import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { TripStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { ApiError, asyncHandler, param } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { redis, offerKey, driverActiveTripKey } from "../lib/redis";
import { resolveZoneForPoint, nearestLandmark, placeLabel } from "./geo";
import { quoteZonePair } from "./fares";
import { offerToNextDriver } from "./dispatch";
import { recordFare } from "./ledger";
import { chargeTripFare } from "./payments/service";
import { tripShareRouter } from "./share";
import { tripSosRouter } from "./safety";
import { tripPhotoRouter } from "./profile";
import { emitToDriver, emitToRider, emitToTrip } from "../realtime";
import { logger } from "../lib/logger";

const createSchema = z.object({
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupLabel: z.string().trim().max(120).optional(),
  toZone: z.string().min(2),
  dropLabel: z.string().trim().max(120).optional(),
  dropLat: z.number().optional(),
  dropLng: z.number().optional(),
  paymentMethod: z.enum(["CASH", "MOMO", "ORANGE_MONEY"]).default("CASH"),
  vehicleType: z.enum(["MOTO", "CAR"]).default("CAR"),
  /**
   * The two chips on the confirm screen. They narrow who may be offered the
   * trip and never touch the price — a rider asking for a helmet is asking for
   * something the driver should already carry, not buying an upgrade.
   */
  needsHelmet: z.boolean().default(false),
  womanDriverOnly: z.boolean().default(false),
});

function generatePin(): string {
  return String(crypto.randomInt(0, 10_000)).padStart(4, "0");
}

async function transition(tripId: string, status: TripStatus, actor: string, data: Record<string, unknown> = {}) {
  const [trip] = await prisma.$transaction([
    prisma.trip.update({ where: { id: tripId }, data: { status, ...data } }),
    prisma.tripEvent.create({ data: { tripId, status, actor } }),
  ]);
  return trip;
}

/** Load a trip and check the caller is actually part of it. */
async function loadTripForDriver(tripId: string, userId: string) {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) throw new ApiError(403, "not_a_driver", "This account is not a driver.");
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new ApiError(404, "no_trip", "That trip does not exist.");
  return { trip, driver };
}

function expectStatus(actual: TripStatus, allowed: TripStatus[]): void {
  if (!allowed.includes(actual)) {
    throw new ApiError(409, "wrong_state", `This trip is ${actual.toLowerCase()} and cannot change that way.`);
  }
}

export function tripsRouter(): Router {
  const router = Router();

  /** Rider books. The fare is fixed here and nowhere else. */
  router.post(
    "/",
    requireAuth("RIDER", "ADMIN"),
    asyncHandler(async (req, res) => {
      const body = createSchema.parse(req.body);

      const fromZone = await resolveZoneForPoint(body.pickupLat, body.pickupLng);
      const toZone = await prisma.zone.findUnique({ where: { code: body.toZone } });
      if (!toZone) throw new ApiError(404, "zone_not_found", "Unknown drop-off.");

      const quote = await quoteZonePair({
        fromZoneId: fromZone.id,
        toZoneId: toZone.id,
        vehicleType: body.vehicleType,
        mobileDiscountXaf: env.MOBILE_PAYMENT_DISCOUNT_XAF,
      });

      const priceXaf = body.paymentMethod === "CASH" ? quote.priceXaf : quote.mobilePriceXaf;
      const near = body.pickupLabel ? null : await nearestLandmark(body.pickupLat, body.pickupLng);

      const trip = await prisma.trip.create({
        data: {
          riderId: req.user!.sub,
          fromZoneId: fromZone.id,
          toZoneId: toZone.id,
          pickupLat: body.pickupLat,
          pickupLng: body.pickupLng,
          pickupLabel: body.pickupLabel ?? placeLabel(near?.landmark.name, fromZone.name),
          dropLat: body.dropLat ?? toZone.centroidLat,
          dropLng: body.dropLng ?? toZone.centroidLng,
          dropLabel: body.dropLabel ?? toZone.name,
          priceXaf,
          paymentMethod: body.paymentMethod,
          vehicleType: body.vehicleType,
          needsHelmet: body.needsHelmet,
          womanDriverOnly: body.womanDriverOnly,
          pin: generatePin(),
        },
      });
      await prisma.tripEvent.create({ data: { tripId: trip.id, status: "REQUESTED", actor: req.user!.sub } });

      const offered = await offerToNextDriver(trip.id);

      res.status(201).json({
        id: trip.id,
        status: offered ? "OFFERED" : "NO_DRIVER_FOUND",
        priceXaf: trip.priceXaf,
        paymentMethod: trip.paymentMethod,
        pin: trip.pin,
        pickupLabel: trip.pickupLabel,
        dropLabel: trip.dropLabel,
        hillFare: quote.hillFare,
        needsHelmet: trip.needsHelmet,
        womanDriverOnly: trip.womanDriverOnly,
      });
    }),
  );

  /**
   * The Trips tab: what this account has actually done.
   *
   * Serves a rider his own trips and a driver his own, because the two apps ask
   * the same question and there is no reason to answer it twice.
   */
  router.get(
    "/",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const { limit, before } = z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          before: z.coerce.date().optional(),
        })
        .parse(req.query);

      const driver =
        req.user!.role === "DRIVER"
          ? await prisma.driver.findUnique({ where: { userId: req.user!.sub }, select: { id: true } })
          : null;

      const trips = await prisma.trip.findMany({
        where: {
          ...(driver ? { driverId: driver.id } : { riderId: req.user!.sub }),
          ...(before ? { requestedAt: { lt: before } } : {}),
        },
        orderBy: { requestedAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          priceXaf: true,
          paymentMethod: true,
          pickupLabel: true,
          dropLabel: true,
          requestedAt: true,
          completedAt: true,
          toZone: { select: { code: true, name: true } },
        },
      });

      res.json({
        trips,
        // A cursor rather than a page number: trips arrive while you scroll.
        nextBefore: trips.length === limit ? trips[trips.length - 1]!.requestedAt : null,
      });
    }),
  );

  /**
   * The one-tap chips at the top of the home screen.
   *
   * Where this rider actually goes, priced from where he is standing right now.
   * This is the density rule doing real work: two taps saved on the trip he
   * takes four times a week, and the price is on the chip before he commits.
   */
  router.get(
    "/repeats",
    requireAuth("RIDER", "ADMIN"),
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          fromZone: z.string().optional(),
          fromLat: z.coerce.number().optional(),
          fromLng: z.coerce.number().optional(),
          limit: z.coerce.number().int().min(1).max(6).default(3),
        })
        .parse(req.query);

      let fromZone: { id: string; code: string; name: string };
      if (q.fromZone) {
        const zone = await prisma.zone.findUnique({ where: { code: q.fromZone } });
        if (!zone) throw new ApiError(404, "zone_not_found", "Unknown pickup zone.");
        fromZone = zone;
      } else if (q.fromLat !== undefined && q.fromLng !== undefined) {
        fromZone = await resolveZoneForPoint(q.fromLat, q.fromLng);
      } else {
        throw new ApiError(400, "missing_pickup", "Give either fromZone or fromLat/fromLng.");
      }

      const history = await prisma.trip.groupBy({
        by: ["toZoneId"],
        where: { riderId: req.user!.sub, status: "COMPLETED" },
        _count: { _all: true },
        _max: { completedAt: true },
        orderBy: [{ _count: { toZoneId: "desc" } }, { _max: { completedAt: "desc" } }],
        take: q.limit + 1, // one spare, in case the top one is where he already is
      });

      const repeats = [];
      for (const row of history) {
        if (row.toZoneId === fromZone.id) continue; // he is already there
        if (repeats.length >= q.limit) break;

        const quote = await quoteZonePair({
          fromZoneId: fromZone.id,
          toZoneId: row.toZoneId,
          mobileDiscountXaf: env.MOBILE_PAYMENT_DISCOUNT_XAF,
        });

        // What he called it last time, not what the gazetteer calls it.
        const last = await prisma.trip.findFirst({
          where: { riderId: req.user!.sub, toZoneId: row.toZoneId, status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          select: { dropLabel: true, toZone: { select: { code: true, name: true } } },
        });
        if (!last) continue;

        repeats.push({
          zone: last.toZone.code,
          name: last.toZone.name,
          label: last.dropLabel,
          tripCount: row._count._all,
          priceXaf: quote.priceXaf,
          mobilePriceXaf: quote.mobilePriceXaf,
          hillFare: quote.hillFare,
        });
      }

      res.json({ from: { code: fromZone.code, name: fromZone.name }, repeats });
    }),
  );

  router.get(
    "/:id",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const trip = await prisma.trip.findUnique({
        where: { id: param(req, "id") },
        include: {
          driver: { include: { user: { select: { name: true, phone: true } } } },
          fromZone: { select: { code: true, name: true } },
          toZone: { select: { code: true, name: true } },
        },
      });
      if (!trip) throw new ApiError(404, "no_trip", "That trip does not exist.");

      const isRider = trip.riderId === req.user!.sub;
      const isDriver = trip.driver?.userId === req.user!.sub;
      if (!isRider && !isDriver && req.user!.role !== "ADMIN") {
        throw new ApiError(403, "not_yours", "That trip is not yours.");
      }

      res.json({
        id: trip.id,
        status: trip.status,
        priceXaf: trip.priceXaf,
        paymentMethod: trip.paymentMethod,
        pickupLabel: trip.pickupLabel,
        dropLabel: trip.dropLabel,
        from: trip.fromZone,
        to: trip.toZone,
        // Only the rider reads the PIN out; the driver types what he is told.
        pin: isRider ? trip.pin : undefined,
        driver: trip.driver
          ? {
              name: trip.driver.user.name,
              phone: trip.driver.user.phone,
              plate: trip.driver.plate,
              rating: trip.driver.rating,
              tripCount: trip.driver.tripCount,
              verified: trip.driver.status === "ACTIVE",
              // "ID checked · helmet on board" — both halves of that line.
              hasSpareHelmet: trip.driver.hasSpareHelmet,
            }
          : null,
        needsHelmet: trip.needsHelmet,
        womanDriverOnly: trip.womanDriverOnly,
        requestedAt: trip.requestedAt,
        acceptedAt: trip.acceptedAt,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
      });
    }),
  );

  /** Driver accepts — only the driver currently holding the offer. */
  router.post(
    "/:id/accept",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { trip, driver } = await loadTripForDriver(param(req, "id"), req.user!.sub);
      expectStatus(trip.status, ["OFFERED"]);

      const holder = await redis.get(offerKey(trip.id));
      if (holder !== driver.id) {
        throw new ApiError(409, "offer_gone", "That request has moved to another rider.");
      }
      await redis.del(offerKey(trip.id));

      const updated = await transition(trip.id, "ACCEPTED", driver.id, {
        driverId: driver.id,
        acceptedAt: new Date(),
      });

      // So a position ping knows which trip room to broadcast into. Expires on
      // its own: a driver whose phone dies mid-trip must not pin this forever.
      await redis.set(driverActiveTripKey(driver.id), trip.id, "EX", 4 * 3600);

      emitToRider(trip.riderId, "trip:accepted", { tripId: trip.id, driverId: driver.id });
      emitToTrip(trip.id, "trip:status", { tripId: trip.id, status: "ACCEPTED" });
      res.json({ status: updated.status, pickupLabel: updated.pickupLabel, priceXaf: updated.priceXaf });
    }),
  );

  router.post(
    "/:id/arrived",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { trip, driver } = await loadTripForDriver(param(req, "id"), req.user!.sub);
      if (trip.driverId !== driver.id) throw new ApiError(403, "not_yours", "That trip is not yours.");
      expectStatus(trip.status, ["ACCEPTED"]);

      await transition(trip.id, "ARRIVED", driver.id, { arrivedAt: new Date() });
      emitToRider(trip.riderId, "trip:arrived", { tripId: trip.id });
      emitToTrip(trip.id, "trip:status", { tripId: trip.id, status: "ARRIVED" });
      res.json({ status: "ARRIVED" });
    }),
  );

  /** The PIN gate. No correct PIN, no trip — safety check and fraud check in one. */
  router.post(
    "/:id/start",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(req.body);
      const { trip, driver } = await loadTripForDriver(param(req, "id"), req.user!.sub);
      if (trip.driverId !== driver.id) throw new ApiError(403, "not_yours", "That trip is not yours.");
      expectStatus(trip.status, ["ACCEPTED", "ARRIVED"]);

      const supplied = Buffer.from(pin);
      const expected = Buffer.from(trip.pin);
      const ok = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
      if (!ok) {
        await prisma.tripEvent.create({
          data: { tripId: trip.id, status: trip.status, actor: driver.id, meta: { pinAttemptFailed: true } },
        });
        throw new ApiError(400, "wrong_pin", "That code does not match. Ask the rider to read it again.");
      }

      await transition(trip.id, "IN_PROGRESS", driver.id, { pinVerified: true, startedAt: new Date() });
      emitToRider(trip.riderId, "trip:started", { tripId: trip.id });
      emitToTrip(trip.id, "trip:status", { tripId: trip.id, status: "IN_PROGRESS" });
      res.json({ status: "IN_PROGRESS" });
    }),
  );

  router.post(
    "/:id/complete",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { trip, driver } = await loadTripForDriver(param(req, "id"), req.user!.sub);
      if (trip.driverId !== driver.id) throw new ApiError(403, "not_yours", "That trip is not yours.");
      expectStatus(trip.status, ["IN_PROGRESS"]);

      await transition(trip.id, "COMPLETED", driver.id, { completedAt: new Date() });
      // Cash is already in his hand, so that entry is written now. A mobile
      // fare only becomes a ledger entry when the provider confirms it landed —
      // completing the trip must not depend on Fapshi being reachable from the
      // Soppo climb, and a declined prompt must not show up as earnings.
      await recordFare(trip.id);
      const fare = await chargeTripFare(trip.id).catch((err) => {
        logger.error({ tripId: trip.id, err: String(err) }, "could not start the mobile charge");
        return null;
      });
      await prisma.driver.update({ where: { id: driver.id }, data: { tripCount: { increment: 1 } } });
      await redis.del(driverActiveTripKey(driver.id));

      emitToRider(trip.riderId, "trip:completed", { tripId: trip.id, priceXaf: trip.priceXaf });
      emitToTrip(trip.id, "trip:status", { tripId: trip.id, status: "COMPLETED" });
      logger.info({ tripId: trip.id, driverId: driver.id }, "trip completed");
      res.json({
        status: "COMPLETED",
        priceXaf: trip.priceXaf,
        paymentMethod: trip.paymentMethod,
        // PENDING means a prompt is on the rider's phone and he should wait for
        // it; FAILED means take the cash before the rider walks away.
        payment: fare ? { id: fare.id, status: fare.status } : null,
      });
    }),
  );

  router.post(
    "/:id/cancel",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const { reason } = z.object({ reason: z.string().max(200).optional() }).parse(req.body ?? {});
      const trip = await prisma.trip.findUnique({ where: { id: param(req, "id") }, include: { driver: true } });
      if (!trip) throw new ApiError(404, "no_trip", "That trip does not exist.");
      expectStatus(trip.status, ["REQUESTED", "OFFERED", "ACCEPTED", "ARRIVED"]);

      const byRider = trip.riderId === req.user!.sub;
      const byDriver = trip.driver?.userId === req.user!.sub;
      if (!byRider && !byDriver) throw new ApiError(403, "not_yours", "That trip is not yours.");

      if (byRider) {
        await transition(trip.id, "CANCELLED_BY_RIDER", req.user!.sub, {
          cancelledAt: new Date(),
          cancelReason: reason ?? null,
        });
        await redis.del(offerKey(trip.id));
        if (trip.driverId) {
          await redis.del(driverActiveTripKey(trip.driverId));
          emitToDriver(trip.driverId, "trip:cancelled", { tripId: trip.id });
        }
        emitToTrip(trip.id, "trip:status", { tripId: trip.id, status: "CANCELLED_BY_RIDER" });
        res.json({ status: "CANCELLED_BY_RIDER" });
        return;
      }

      /**
       * A driver dropping out is not the end of the rider's trip.
       *
       * The cancellation is recorded as an event and the trip goes back into
       * the queue, excluding the driver who walked away. Writing
       * CANCELLED_BY_DRIVER onto the trip itself would make re-offering
       * impossible, because dispatch only picks up REQUESTED and OFFERED — the
       * rider would sit watching a spinner that can never resolve.
       */
      const cancellingDriverId = trip.driverId;
      if (!cancellingDriverId) throw new ApiError(409, "wrong_state", "That trip has no driver to cancel it.");

      await prisma.$transaction([
        prisma.tripEvent.create({
          data: {
            tripId: trip.id,
            status: "CANCELLED_BY_DRIVER",
            actor: req.user!.sub,
            meta: { driverId: cancellingDriverId, reason: reason ?? null },
          },
        }),
        prisma.trip.update({
          where: { id: trip.id },
          data: {
            status: "REQUESTED",
            driverId: null,
            acceptedAt: null,
            arrivedAt: null,
            cancelReason: reason ?? null,
            offeredDriverIds: trip.offeredDriverIds.includes(cancellingDriverId)
              ? undefined
              : { push: cancellingDriverId },
          },
        }),
      ]);
      await redis.del(offerKey(trip.id), driverActiveTripKey(cancellingDriverId));

      emitToRider(trip.riderId, "trip:driver_cancelled", { tripId: trip.id });
      const requeued = await offerToNextDriver(trip.id);
      res.json({ status: requeued ? "OFFERED" : "NO_DRIVER_FOUND", requeued });
    }),
  );

  /**
   * "Leave it" on the offer card.
   *
   * Distinct from cancelling: nothing has been agreed yet, so this is not a
   * broken promise to a rider and must not be recorded as one. It moves the
   * trip to the next nearest bike immediately rather than making the rider wait
   * out the twelve seconds.
   */
  router.post(
    "/:id/decline",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { trip, driver } = await loadTripForDriver(param(req, "id"), req.user!.sub);
      expectStatus(trip.status, ["OFFERED"]);

      const holder = await redis.get(offerKey(trip.id));
      if (holder !== driver.id) throw new ApiError(409, "offer_gone", "That request has already moved on.");

      await redis.del(offerKey(trip.id));
      await prisma.tripEvent.create({
        data: { tripId: trip.id, status: "OFFERED", actor: driver.id, meta: { declined: true } },
      });

      const offered = await offerToNextDriver(trip.id);
      res.json({ declined: true, passedOn: offered });
    }),
  );

  router.post(
    "/:id/rate",
    requireAuth("RIDER"),
    asyncHandler(async (req, res) => {
      const { stars, comment } = z
        .object({ stars: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })
        .parse(req.body);

      const trip = await prisma.trip.findUnique({ where: { id: param(req, "id") } });
      if (!trip || trip.riderId !== req.user!.sub) throw new ApiError(404, "no_trip", "That trip does not exist.");
      if (trip.status !== "COMPLETED" || !trip.driverId) {
        throw new ApiError(409, "not_completed", "You can only rate a finished trip.");
      }

      const driver = await prisma.driver.findUniqueOrThrow({ where: { id: trip.driverId } });
      const count = driver.ratingCount + 1;
      const rating = (driver.rating * driver.ratingCount + stars) / count;

      await prisma.$transaction([
        prisma.driver.update({ where: { id: driver.id }, data: { rating, ratingCount: count } }),
        prisma.tripEvent.create({
          data: { tripId: trip.id, status: "COMPLETED", actor: req.user!.sub, meta: { stars, comment: comment ?? null } },
        }),
      ]);

      res.json({ rated: true });
    }),
  );

  // Both hang off one trip, so they mount here rather than at the top level.
  router.use("/:id/share", tripShareRouter());
  router.use("/:id/sos", tripSosRouter());
  // Recognising each other at the kerb. Guarded by trip membership, not by role.
  router.use("/:id/photo", tripPhotoRouter());

  return router;
}

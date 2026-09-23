/**
 * The ops console API.
 *
 * Four screens, per the build stack sheet: the driver verification queue, the
 * live trip board, the fare-table editor, and the complaints queue — plus the
 * SOS queue, because an alarm nobody can close is not a safety feature.
 *
 * Everything here is `requireAuth("ADMIN")`. There is deliberately no endpoint
 * that grants the ADMIN role: the first admin is made with `npm run admin:grant`
 * on a machine that already has the database URL, and after that a human decides
 * in person. An app that can promote its own users is one stolen phone away from
 * a stranger approving drivers.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler, param } from "../lib/http";
import { adminDocumentsRouter, REQUIRED_KINDS } from "./documents/routes";
import { requireAuth } from "../middleware/auth";
import { clearDriverPosition } from "../lib/presence";
import { FARE_ROUNDING_XAF, MIN_FARE_XAF } from "./fare-math";
import { adminPaymentsRouter } from "./payments/routes";
import { logger } from "../lib/logger";

// --- the verification queue ------------------------------------------------

const verifySchema = z.object({
  /**
   * The S10 licence number, read off the card.
   *
   * Required, and required for a reason: an S10 is what makes a paid moto trip
   * legal here. Asking for the number rather than a checkbox means the reviewer
   * had the document in their hand — a tick box gets ticked from a desk.
   */
  licenceNumber: z.string().trim().min(4).max(40),
  note: z.string().trim().max(500).optional(),
  /**
   * Approve a driver whose photographs are not all here.
   *
   * There is a real case for it: ops had the man at the desk with his papers
   * in his hand and the upload failed on his phone. Refusing outright would
   * send him away over our bug.
   *
   * But it is deliberate, never accidental, and never silent — it needs a
   * reason in writing, and that reason goes on his record next to whoever
   * typed it. The same logic as the licence number above: the thing that
   * makes a check real is that a person had to put something in.
   */
  overrideMissingDocuments: z.boolean().default(false),
});

const rejectSchema = z.object({
  /** Told to the driver, so it has to be a sentence a person can act on. */
  reason: z.string().trim().min(5).max(500),
});

export function adminRouter(): Router {
  const router = Router();

  router.use(requireAuth("ADMIN"));
  // Below the guard, deliberately. Mounted above it these routes served ID
  // photographs to anybody who knew a driver id — which is what the first
  // version of this line did.
  router.use("/drivers/:id/documents", adminDocumentsRouter());
  // Inherits the ADMIN guard above, so the money views need no guard of their own.
  router.use(adminPaymentsRouter());

  /** The queue. Oldest first — a driver waiting in silence is a driver lost. */
  router.get(
    "/drivers",
    asyncHandler(async (req, res) => {
      const { status, limit } = z
        .object({
          status: z.enum(["PENDING_REVIEW", "ACTIVE", "SUSPENDED", "REJECTED"]).default("PENDING_REVIEW"),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .parse(req.query);

      const drivers = await prisma.driver.findMany({
        where: { status },
        orderBy: { createdAt: "asc" },
        take: limit,
        include: {
          user: { select: { name: true, phone: true, language: true } },
          homeZone: { select: { code: true, name: true } },
          // A count, not the rows: the queue needs "2 of 3", not the keys.
          _count: { select: { documents: true } },
        },
      });

      res.json({
        status,
        waiting: drivers.length,
        drivers: drivers.map((d) => ({
          id: d.id,
          name: d.user.name,
          phone: d.user.phone,
          plate: d.plate,
          vehicleType: d.vehicleType,
          homeZone: d.homeZone?.code ?? null,
          appliedAt: d.createdAt,
          /** How long this person has been waiting to hear from us. */
          waitingDays: Math.floor((Date.now() - d.createdAt.getTime()) / 86_400_000),
          // How many of the three he has sent — the queue shows "2 of 3".
          documentsHeld: d._count.documents,
          documentsRequired: REQUIRED_KINDS.length,
          hasDocuments: d._count.documents >= REQUIRED_KINDS.length,
        })),
      });
    }),
  );

  /** One driver, in full. The only place the CNI number is ever served. */
  router.get(
    "/drivers/:id",
    asyncHandler(async (req, res) => {
      const driver = await prisma.driver.findUnique({
        where: { id: param(req, "id") },
        include: {
          user: { select: { name: true, phone: true, language: true, createdAt: true } },
          homeZone: { select: { code: true, name: true } },
          reviews: { orderBy: { at: "desc" } },
        },
      });
      if (!driver) throw new ApiError(404, "no_driver", "No such driver.");

      const [trips, fees] = await Promise.all([
        prisma.trip.count({ where: { driverId: driver.id, status: "COMPLETED" } }),
        prisma.accessFeeCharge.count({ where: { driverId: driver.id, paid: false } }),
      ]);

      res.json({
        id: driver.id,
        name: driver.user.name,
        phone: driver.user.phone,
        plate: driver.plate,
        cniNumber: driver.cniNumber,
        licenceNumber: driver.licenceNumber,
        status: driver.status,
        vehicleType: driver.vehicleType,
        gender: driver.gender,
        hasSpareHelmet: driver.hasSpareHelmet,
        homeZone: driver.homeZone?.code ?? null,
        rating: driver.rating,
        ratingCount: driver.ratingCount,
        completedTrips: trips,
        unpaidFees: fees,
        online: driver.online,
        lastSeenAt: driver.lastSeenAt,
        verifiedAt: driver.verifiedAt,
        appliedAt: driver.createdAt,
        history: driver.reviews,
      });
    }),
  );

  /** Approve. The only route into ACTIVE, and the only route into dispatch. */
  router.post(
    "/drivers/:id/verify",
    asyncHandler(async (req, res) => {
      const body = verifySchema.parse(req.body);
      const driver = await prisma.driver.findUnique({ where: { id: param(req, "id") } });
      if (!driver) throw new ApiError(404, "no_driver", "No such driver.");
      if (driver.status === "ACTIVE") throw new ApiError(409, "already_active", "This driver is already active.");

      /**
       * No papers, no dispatch.
       *
       * This used to be guarded only by a disabled button in the console,
       * which means it was not guarded at all: anything holding an admin
       * token could put an unchecked driver on the road, and a bug in the
       * console was one click from doing it by accident.
       */
      const held = await prisma.driverDocument.count({ where: { driverId: driver.id } });
      const missing = REQUIRED_KINDS.length - held;
      if (missing > 0 && !body.overrideMissingDocuments) {
        throw new ApiError(
          409,
          "documents_missing",
          `${missing} of ${REQUIRED_KINDS.length} documents are missing. Approve anyway only if you have seen them yourself, and say so.`,
        );
      }
      if (missing > 0 && !body.note) {
        throw new ApiError(
          400,
          "override_needs_reason",
          "Say where you saw the documents before approving without them.",
        );
      }

      const overrode = missing > 0;

      const [updated] = await prisma.$transaction([
        prisma.driver.update({
          where: { id: driver.id },
          data: {
            status: "ACTIVE",
            licenceNumber: body.licenceNumber,
            verifiedAt: new Date(),
          },
        }),
        prisma.driverReview.create({
          data: {
            driverId: driver.id,
            action: "VERIFIED",
            by: req.user!.sub,
            // The override is written into the record itself, not inferred
            // later from a count of rows that may have arrived since.
            note: overrode
              ? `Approved with ${missing} document(s) missing. ${body.note}`
              : (body.note ?? null),
          },
        }),
      ]);

      logger.info({ driverId: driver.id, by: req.user!.sub, missingDocuments: missing }, "driver verified");
      res.json({ id: updated.id, status: updated.status, verifiedAt: updated.verifiedAt });
    }),
  );

  router.post(
    "/drivers/:id/reject",
    asyncHandler(async (req, res) => {
      const { reason } = rejectSchema.parse(req.body);
      const driver = await prisma.driver.findUnique({ where: { id: param(req, "id") } });
      if (!driver) throw new ApiError(404, "no_driver", "No such driver.");

      await prisma.$transaction([
        prisma.driver.update({ where: { id: driver.id }, data: { status: "REJECTED", online: false } }),
        prisma.driverReview.create({
          data: { driverId: driver.id, action: "REJECTED", by: req.user!.sub, note: reason },
        }),
      ]);
      await clearDriverPosition(driver.id, driver.vehicleType);

      res.json({ id: driver.id, status: "REJECTED" });
    }),
  );

  /**
   * Suspend.
   *
   * Takes him out of dispatch immediately — both the database flag dispatch
   * checks and the Redis GEO set it searches. Clearing only one of the two
   * leaves a suspended driver being offered trips.
   */
  router.post(
    "/drivers/:id/suspend",
    asyncHandler(async (req, res) => {
      const { reason } = rejectSchema.parse(req.body);
      const driver = await prisma.driver.findUnique({ where: { id: param(req, "id") } });
      if (!driver) throw new ApiError(404, "no_driver", "No such driver.");

      await prisma.$transaction([
        prisma.driver.update({ where: { id: driver.id }, data: { status: "SUSPENDED", online: false } }),
        prisma.driverReview.create({
          data: { driverId: driver.id, action: "SUSPENDED", by: req.user!.sub, note: reason },
        }),
      ]);
      await clearDriverPosition(driver.id, driver.vehicleType);

      logger.warn({ driverId: driver.id, by: req.user!.sub, reason }, "driver suspended");
      res.json({ id: driver.id, status: "SUSPENDED" });
    }),
  );

  router.post(
    "/drivers/:id/reinstate",
    asyncHandler(async (req, res) => {
      const { note } = z.object({ note: z.string().trim().max(500).optional() }).parse(req.body ?? {});
      const driver = await prisma.driver.findUnique({ where: { id: param(req, "id") } });
      if (!driver) throw new ApiError(404, "no_driver", "No such driver.");
      if (driver.status !== "SUSPENDED") {
        throw new ApiError(409, "not_suspended", "Only a suspended driver can be reinstated.");
      }
      if (!driver.licenceNumber) {
        throw new ApiError(409, "never_verified", "This driver was never verified. Verify him instead.");
      }

      await prisma.$transaction([
        prisma.driver.update({ where: { id: driver.id }, data: { status: "ACTIVE" } }),
        prisma.driverReview.create({
          data: { driverId: driver.id, action: "REINSTATED", by: req.user!.sub, note: note ?? null },
        }),
      ]);

      res.json({ id: driver.id, status: "ACTIVE" });
    }),
  );

  // --- the fare table ------------------------------------------------------

  /**
   * The table, with the provisional rows called out.
   *
   * Every row the seed formula generated carries `source: FORMULA` and is a
   * guess. The point of this screen is to turn them into FIELD rows by walking
   * the corridor, and to make it obvious how many are still guesses.
   */
  router.get(
    "/fares",
    asyncHandler(async (req, res) => {
      const { from, source } = z
        .object({ from: z.string().optional(), source: z.enum(["FORMULA", "FIELD"]).optional() })
        .parse(req.query);

      const fromZone = from ? await prisma.zone.findUnique({ where: { code: from } }) : null;
      if (from && !fromZone) throw new ApiError(404, "zone_not_found", "Unknown zone.");

      const [fares, formulaCount, fieldCount] = await Promise.all([
        prisma.fare.findMany({
          where: { ...(fromZone ? { fromZoneId: fromZone.id } : {}), ...(source ? { source } : {}) },
          include: { fromZone: { select: { code: true } }, toZone: { select: { code: true } } },
          orderBy: [{ fromZone: { code: "asc" } }, { priceXaf: "asc" }],
          take: 500,
        }),
        prisma.fare.count({ where: { source: "FORMULA" } }),
        prisma.fare.count({ where: { source: "FIELD" } }),
      ]);

      res.json({
        // The headline number for this screen: how much of the table is a guess.
        stillProvisional: formulaCount,
        pricedByHand: fieldCount,
        fares: fares.map((f) => ({
          from: f.fromZone.code,
          to: f.toZone.code,
          vehicleType: f.vehicleType,
          priceXaf: f.priceXaf,
          source: f.source,
          note: f.note,
          updatedAt: f.updatedAt,
          updatedBy: f.updatedBy,
        })),
      });
    }),
  );

  /**
   * Price a zone pair by hand.
   *
   * Writing a price here marks the row FIELD, and the seed formula never touches
   * a FIELD row again. That is the whole mechanism by which a desk estimate
   * becomes a real fare.
   */
  router.put(
    "/fares",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          from: z.string().min(2),
          to: z.string().min(2),
          vehicleType: z.enum(["MOTO", "CAR"]).default("CAR"),
          priceXaf: z.number().int(),
          note: z.string().trim().max(300).optional(),
        })
        .parse(req.body);

      if (body.from === body.to) throw new ApiError(400, "same_zone", "A zone pair needs two different zones.");
      if (body.priceXaf < MIN_FARE_XAF) {
        throw new ApiError(400, "below_floor", `Nobody quotes a taxi below ${MIN_FARE_XAF} XAF.`);
      }
      if (body.priceXaf % FARE_ROUNDING_XAF !== 0) {
        // Riders think in 50s. A 237 XAF fare is not a real price.
        throw new ApiError(400, "not_round", `A fare has to be a multiple of ${FARE_ROUNDING_XAF} XAF.`);
      }

      const [fromZone, toZone] = await Promise.all([
        prisma.zone.findUnique({ where: { code: body.from } }),
        prisma.zone.findUnique({ where: { code: body.to } }),
      ]);
      if (!fromZone || !toZone) throw new ApiError(404, "zone_not_found", "Unknown zone.");

      const key = {
        fromZoneId_toZoneId_vehicleType: {
          fromZoneId: fromZone.id,
          toZoneId: toZone.id,
          vehicleType: body.vehicleType,
        },
      };
      const before = await prisma.fare.findUnique({ where: key });

      const fare = await prisma.fare.upsert({
        where: key,
        create: {
          fromZoneId: fromZone.id,
          toZoneId: toZone.id,
          vehicleType: body.vehicleType,
          priceXaf: body.priceXaf,
          source: "FIELD",
          note: body.note ?? null,
          updatedBy: req.user!.sub,
        },
        update: {
          priceXaf: body.priceXaf,
          source: "FIELD",
          note: body.note ?? null,
          updatedBy: req.user!.sub,
        },
      });

      logger.info(
        { from: body.from, to: body.to, was: before?.priceXaf ?? null, now: fare.priceXaf, by: req.user!.sub },
        "fare priced by hand",
      );

      res.json({
        from: body.from,
        to: body.to,
        priceXaf: fare.priceXaf,
        previousXaf: before?.priceXaf ?? null,
        source: fare.source,
        // Trips already booked keep the price they were quoted. Always.
        note: "Trips already in progress keep the fare they were quoted.",
      });
    }),
  );

  // --- the live trip board -------------------------------------------------

  const LIVE_STATUSES = ["REQUESTED", "OFFERED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"] as const;

  router.get(
    "/trips",
    asyncHandler(async (req, res) => {
      const { status, limit } = z
        .object({
          status: z
            .enum([
              "LIVE",
              "REQUESTED",
              "OFFERED",
              "ACCEPTED",
              "ARRIVED",
              "IN_PROGRESS",
              "COMPLETED",
              "CANCELLED_BY_RIDER",
              "CANCELLED_BY_DRIVER",
              "NO_DRIVER_FOUND",
            ])
            .default("LIVE"),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .parse(req.query);

      const trips = await prisma.trip.findMany({
        where: status === "LIVE" ? { status: { in: [...LIVE_STATUSES] } } : { status },
        orderBy: { requestedAt: "desc" },
        take: limit,
        include: {
          rider: { select: { name: true, phone: true } },
          driver: { select: { plate: true, user: { select: { name: true } } } },
        },
      });

      res.json({
        trips: trips.map((t) => ({
          id: t.id,
          status: t.status,
          priceXaf: t.priceXaf,
          paymentMethod: t.paymentMethod,
          from: t.pickupLabel,
          to: t.dropLabel,
          rider: t.rider.name,
          riderPhone: t.rider.phone,
          driver: t.driver?.user.name ?? null,
          plate: t.driver?.plate ?? null,
          requestedAt: t.requestedAt,
          /** How long this rider has been waiting, for the ones still unmatched. */
          waitingSeconds:
            t.acceptedAt || !LIVE_STATUSES.includes(t.status as (typeof LIVE_STATUSES)[number])
              ? null
              : Math.round((Date.now() - t.requestedAt.getTime()) / 1000),
        })),
      });
    }),
  );

  // --- safety --------------------------------------------------------------

  /** Open alarms, oldest first. Nothing here closes itself. */
  router.get(
    "/sos",
    asyncHandler(async (_req, res) => {
      const alerts = await prisma.sosAlert.findMany({
        where: { status: { in: ["RAISED", "ACKNOWLEDGED"] } },
        orderBy: { raisedAt: "asc" },
        include: {
          raisedBy: { select: { name: true, phone: true } },
          trip: {
            select: {
              status: true,
              pickupLabel: true,
              dropLabel: true,
              driver: { select: { plate: true, user: { select: { name: true, phone: true } } } },
            },
          },
        },
      });

      res.json({
        open: alerts.length,
        alerts: alerts.map((a) => ({
          id: a.id,
          tripId: a.tripId,
          status: a.status,
          raisedByRole: a.raisedByRole,
          raisedByName: a.raisedBy.name,
          raisedByPhone: a.raisedBy.phone,
          lat: a.lat,
          lng: a.lng,
          note: a.note,
          raisedAt: a.raisedAt,
          minutesOpen: Math.round((Date.now() - a.raisedAt.getTime()) / 60_000),
          tripStatus: a.trip.status,
          route: `${a.trip.pickupLabel} → ${a.trip.dropLabel}`,
          driverName: a.trip.driver?.user.name ?? null,
          driverPhone: a.trip.driver?.user.phone ?? null,
          plate: a.trip.driver?.plate ?? null,
        })),
      });
    }),
  );

  router.post(
    "/sos/:id/resolve",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          status: z.enum(["ACKNOWLEDGED", "RESOLVED", "FALSE_ALARM"]),
          outcome: z.string().trim().max(1000).optional(),
        })
        .parse(req.body);

      const alert = await prisma.sosAlert.findUnique({ where: { id: param(req, "id") } });
      if (!alert) throw new ApiError(404, "no_alert", "No such alert.");

      const closing = body.status !== "ACKNOWLEDGED";
      const updated = await prisma.sosAlert.update({
        where: { id: alert.id },
        data: {
          status: body.status,
          outcome: body.outcome ?? null,
          resolvedBy: req.user!.sub,
          ...(closing ? { resolvedAt: new Date() } : {}),
        },
      });

      res.json({ id: updated.id, status: updated.status, resolvedAt: updated.resolvedAt });
    }),
  );

  /**
   * The complaints queue, sorted by the deadline we promised.
   *
   * The screen told the rider a human answers within a day. This is where that
   * promise is either kept or visibly broken — overdue rows come first and are
   * marked, rather than being buried at the bottom of a list sorted by date.
   */
  router.get(
    "/complaints",
    asyncHandler(async (req, res) => {
      const { status } = z
        .object({ status: z.enum(["OPEN", "ANSWERED", "CLOSED"]).default("OPEN") })
        .parse(req.query);

      const complaints = await prisma.complaint.findMany({
        where: { status },
        orderBy: { respondBy: "asc" },
        take: 100,
        include: {
          user: { select: { name: true, phone: true } },
          trip: { select: { priceXaf: true, pickupLabel: true, dropLabel: true, driver: { select: { plate: true } } } },
        },
      });

      const now = Date.now();
      res.json({
        status,
        overdue: complaints.filter((c) => c.respondBy.getTime() < now).length,
        complaints: complaints.map((c) => ({
          id: c.id,
          category: c.category,
          message: c.message,
          from: c.user.name,
          phone: c.user.phone,
          tripId: c.tripId,
          route: c.trip ? `${c.trip.pickupLabel} → ${c.trip.dropLabel}` : null,
          priceXaf: c.trip?.priceXaf ?? null,
          plate: c.trip?.driver?.plate ?? null,
          createdAt: c.createdAt,
          respondBy: c.respondBy,
          overdue: c.respondBy.getTime() < now,
        })),
      });
    }),
  );

  router.post(
    "/complaints/:id/respond",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          response: z.string().trim().min(5).max(2000),
          close: z.boolean().default(false),
        })
        .parse(req.body);

      const complaint = await prisma.complaint.findUnique({ where: { id: param(req, "id") } });
      if (!complaint) throw new ApiError(404, "no_complaint", "No such complaint.");

      const updated = await prisma.complaint.update({
        where: { id: complaint.id },
        data: {
          response: body.response,
          status: body.close ? "CLOSED" : "ANSWERED",
          answeredAt: new Date(),
          handledBy: req.user!.sub,
        },
      });

      res.json({
        id: updated.id,
        status: updated.status,
        answeredAt: updated.answeredAt,
        /** Whether we kept the promise on the screen. Worth seeing every time. */
        withinPromise: updated.answeredAt !== null && updated.answeredAt <= updated.respondBy,
      });
    }),
  );

  // --- the service banner --------------------------------------------------

  /**
   * "Taxis running normally in Buea today", or the day it is not true.
   *
   * Carries a French string alongside the English one because both apps run in
   * both languages and a server's English sentence must never reach a rider.
   */
  /**
   * Every notice, including the ones the public endpoint hides.
   *
   * `GET /geo/notices` answers "what should the apps show right now", so it
   * filters by date and returns no ids — correct for a banner, useless for the
   * desk that writes them. Ops needs to see what is scheduled, what has
   * expired, and which row to take down.
   */
  router.get(
    "/notices",
    asyncHandler(async (_req, res) => {
      const now = new Date();
      const notices = await prisma.serviceNotice.findMany({
        orderBy: { activeFrom: "desc" },
        take: 50,
        include: { zone: { select: { code: true } } },
      });

      res.json({
        notices: notices.map((n) => ({
          id: n.id,
          message: n.message,
          messageFr: n.messageFr,
          severity: n.severity,
          zone: n.zone?.code ?? null,
          activeFrom: n.activeFrom,
          activeUntil: n.activeUntil,
          /** Whether the apps are showing this one at this moment. */
          live: n.activeFrom <= now && (n.activeUntil === null || n.activeUntil >= now),
        })),
      });
    }),
  );

  router.post(
"/notices",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          message: z.string().trim().min(3).max(300),
          messageFr: z.string().trim().min(3).max(300),
          severity: z.enum(["INFO", "WARNING", "SERVICE_SUSPENDED"]).default("INFO"),
          zone: z.string().optional(),
          activeUntil: z.coerce.date().optional(),
        })
        .parse(req.body);

      const zone = body.zone ? await prisma.zone.findUnique({ where: { code: body.zone } }) : null;
      if (body.zone && !zone) throw new ApiError(404, "zone_not_found", "Unknown zone.");

      const notice = await prisma.serviceNotice.create({
        data: {
          message: body.message,
          messageFr: body.messageFr,
          severity: body.severity,
          zoneId: zone?.id ?? null,
          activeUntil: body.activeUntil ?? null,
          createdBy: req.user!.sub,
        },
      });

      res.status(201).json({ id: notice.id, severity: notice.severity, activeUntil: notice.activeUntil });
    }),
  );

  /** End a notice now, without deleting the record of having posted it. */
  router.delete(
    "/notices/:id",
    asyncHandler(async (req, res) => {
      const notice = await prisma.serviceNotice.findUnique({ where: { id: param(req, "id") } });
      if (!notice) throw new ApiError(404, "no_notice", "No such notice.");

      await prisma.serviceNotice.update({ where: { id: notice.id }, data: { activeUntil: new Date() } });
      res.json({ id: notice.id, ended: true });
    }),
  );

  return router;
}

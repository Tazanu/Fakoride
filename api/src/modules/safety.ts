/**
 * The red button, and the complaint behind it.
 *
 * A rider who flags a bendskin at the roadside has no recourse at all. That is
 * the gap this fills, and it is the reason the trip screen gives the help
 * button the only red on the whole design system.
 *
 * One rule shapes everything here: raising an alert never tells the other side
 * of the trip. A rider pressing SOS because of the driver he is sitting behind
 * must not cause that driver's phone to light up. Alerts go to ops and nowhere
 * else, and a human closes them.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler, param } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { emitToOps } from "../realtime";
import { logger } from "../lib/logger";

/** The promise printed on the screen: a human answers within a day. */
export const COMPLAINT_RESPONSE_HOURS = 24;

const sosSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  note: z.string().trim().max(500).optional(),
});

/** Mounted under /trips/:id/sos. */
export function tripSosRouter(): Router {
  const router = Router({ mergeParams: true });

  router.post(
    "/",
    requireAuth("RIDER", "DRIVER", "ADMIN"),
    asyncHandler(async (req, res) => {
      const body = sosSchema.parse(req.body ?? {});
      const tripId = param(req, "id");

      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        include: { driver: { select: { id: true, userId: true, plate: true } } },
      });
      if (!trip) throw new ApiError(404, "no_trip", "That trip does not exist.");

      const isRider = trip.riderId === req.user!.sub;
      const isDriver = trip.driver?.userId === req.user!.sub;
      if (!isRider && !isDriver) throw new ApiError(403, "not_yours", "That trip is not yours.");

      const alert = await prisma.sosAlert.create({
        data: {
          tripId,
          raisedByUserId: req.user!.sub,
          raisedByRole: isRider ? "RIDER" : "DRIVER",
          // Copied in now rather than looked up later: the phone that raised
          // this may go dark a second afterwards.
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          note: body.note ?? null,
        },
      });

      await prisma.tripEvent.create({
        data: { tripId, status: trip.status, actor: req.user!.sub, meta: { sosAlertId: alert.id } },
      });

      // Loud on purpose. This is the one log line that should page somebody.
      logger.error(
        { alertId: alert.id, tripId, raisedBy: alert.raisedByRole, plate: trip.driver?.plate },
        "SOS raised",
      );
      emitToOps("sos:raised", {
        alertId: alert.id,
        tripId,
        raisedByRole: alert.raisedByRole,
        lat: alert.lat,
        lng: alert.lng,
        plate: trip.driver?.plate ?? null,
      });

      res.status(201).json({
        alertId: alert.id,
        status: alert.status,
        // Say what happens now. A screen that only says "sent" is not help.
        next: "We have your location and this trip. Somebody is calling you now.",
      });
    }),
  );

  return router;
}

const complaintSchema = z.object({
  tripId: z.string().min(1).optional(),
  category: z
    .enum(["FARE_DISPUTE", "DRIVER_CONDUCT", "RIDER_CONDUCT", "SAFETY", "LOST_ITEM", "APP_PROBLEM", "OTHER"])
    .default("OTHER"),
  message: z.string().trim().min(5).max(2000),
});

export function complaintsRouter(): Router {
  const router = Router();

  /** "Something wrong?" on the end-of-trip screen. */
  router.post(
    "/",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const body = complaintSchema.parse(req.body);

      if (body.tripId) {
        const trip = await prisma.trip.findUnique({
          where: { id: body.tripId },
          include: { driver: { select: { userId: true } } },
        });
        if (!trip) throw new ApiError(404, "no_trip", "That trip does not exist.");
        const onTrip = trip.riderId === req.user!.sub || trip.driver?.userId === req.user!.sub;
        if (!onTrip) throw new ApiError(403, "not_yours", "That trip is not yours.");
      }

      const complaint = await prisma.complaint.create({
        data: {
          tripId: body.tripId ?? null,
          userId: req.user!.sub,
          category: body.category,
          message: body.message,
          // Stored rather than computed so the ops queue can sort on it and so
          // the promise is a row in a table, not a slogan on a screen.
          respondBy: new Date(Date.now() + COMPLAINT_RESPONSE_HOURS * 3_600_000),
        },
      });

      emitToOps("complaint:filed", {
        complaintId: complaint.id,
        category: complaint.category,
        tripId: complaint.tripId,
      });

      res.status(201).json({
        id: complaint.id,
        status: complaint.status,
        respondBy: complaint.respondBy,
        next: "Somebody reads this and calls you back within a day.",
      });
    }),
  );

  /** What the rider filed, and what came back. */
  router.get(
    "/mine",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const complaints = await prisma.complaint.findMany({
        where: { userId: req.user!.sub },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          tripId: true,
          category: true,
          message: true,
          status: true,
          createdAt: true,
          respondBy: true,
          answeredAt: true,
          response: true,
        },
      });
      res.json({ complaints });
    }),
  );

  return router;
}

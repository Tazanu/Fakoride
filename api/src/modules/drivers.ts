/**
 * Drivers: signing up, going online, being where you say you are, getting paid.
 *
 * Going online is also the moment the day's access fee is raised — never a cron
 * job. A driver who stays home on a ghost-town Monday is charged nothing.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler } from "../lib/http";
import { driverDocumentsRouter } from "./documents/routes";
import { requireAuth } from "../middleware/auth";
import { setDriverPosition, clearDriverPosition } from "../lib/presence";
import { driverBalance, ensureAccessFee, todaySummary, weeklyEarnings } from "./ledger";
import { resolveZoneForPoint } from "./geo";
import { redis, driverOfferKey, offerKey } from "../lib/redis";

const applySchema = z.object({
  name: z.string().trim().min(2).max(60),
  plate: z.string().trim().min(4).max(20),
  cniNumber: z.string().trim().min(5).max(30),
  vehicleType: z.enum(["MOTO", "CAR"]).default("CAR"),
  homeZone: z.string().optional(),
  /**
   * Optional, and only ever used to match a rider who asked for a woman driver.
   * Never shown on a profile, never a filter anyone else can apply.
   */
  gender: z.enum(["UNSPECIFIED", "WOMAN", "MAN"]).default("UNSPECIFIED"),
  /** A second helmet on the bike, which is what the rider's chip actually asks for. */
  hasSpareHelmet: z.boolean().default(false),
});

const profileSchema = z.object({
  gender: z.enum(["UNSPECIFIED", "WOMAN", "MAN"]).optional(),
  hasSpareHelmet: z.boolean().optional(),
  homeZone: z.string().optional(),
});

const positionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  headingDeg: z.number().optional(),
});

async function currentDriver(userId: string) {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) throw new ApiError(403, "not_a_driver", "This account is not registered as a driver.");
  return driver;
}

export function driversRouter(): Router {
  const router = Router();

  // His own documents. Mounted here so the whole driver surface is one prefix.
  router.use("/me/documents", driverDocumentsRouter());

  /**
   * The ride he is being offered right now, or null.
   *
   * The socket event is the normal way an offer arrives, and it is gone the
   * moment it is sent. A driver whose phone was in his pocket gets the push
   * instead, taps it, and the app opens with no idea what it was woken for.
   * This is how it finds out — with the seconds actually left on the clock,
   * not the twelve it started with.
   */
  router.get(
    "/me/offer",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub }, select: { id: true } });
      if (!driver) throw new ApiError(404, "no_driver", "This account is not a driver.");

      const raw = await redis.get(driverOfferKey(driver.id));
      if (!raw) {
        res.json({ offer: null });
        return;
      }
      const { expiresAt, ...offer } = JSON.parse(raw) as { tripId: string; expiresAt: number };
      const left = Math.floor((expiresAt - Date.now()) / 1000);
      // Still his only if the trip's own offer record still names him: accepted,
      // declined, or moved on to somebody else all clear or change that.
      const holder = await redis.get(offerKey(offer.tripId));
      if (holder !== driver.id || left <= 0) {
        res.json({ offer: null });
        return;
      }
      res.json({ offer: { ...offer, expiresInSeconds: left } });
    }),
  );

  /** Apply to drive. Verification is a human step — nothing here grants access. */
  router.post(
    "/apply",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const body = applySchema.parse(req.body);
      const existing = await prisma.driver.findUnique({ where: { userId: req.user!.sub } });
      if (existing) throw new ApiError(409, "already_applied", "You have already applied.");

      const homeZone = body.homeZone ? await prisma.zone.findUnique({ where: { code: body.homeZone } }) : null;

      const driver = await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: req.user!.sub }, data: { name: body.name, role: "DRIVER" } });
        return tx.driver.create({
          data: {
            userId: req.user!.sub,
            plate: body.plate.toUpperCase(),
            cniNumber: body.cniNumber,
            vehicleType: body.vehicleType,
            gender: body.gender,
            hasSpareHelmet: body.hasSpareHelmet,
            homeZoneId: homeZone?.id ?? null,
          },
        });
      });

      res.status(201).json({
        id: driver.id,
        status: driver.status,
        // Say plainly what happens next; a driver waiting in silence is a driver lost.
        next: "Send photos of your CNI and the vehicle papers. Most are reviewed within one working day.",
      });
    }),
  );

  router.post(
    "/online",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { lat, lng } = positionSchema.parse(req.body);
      const driver = await currentDriver(req.user!.sub);

      if (driver.status !== "ACTIVE") {
        throw new ApiError(403, "not_verified", "Your account is still being checked. We will call you.");
      }

      await ensureAccessFee(driver.id);
      await prisma.driver.update({
        where: { id: driver.id },
        data: { online: true, lastSeenAt: new Date() },
      });
      await setDriverPosition(driver.id, driver.vehicleType, lat, lng);

      const zone = await resolveZoneForPoint(lat, lng);
      res.json({ online: true, zone: { code: zone.code, name: zone.name } });
    }),
  );

  router.post(
    "/offline",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driver = await currentDriver(req.user!.sub);
      await prisma.driver.update({ where: { id: driver.id }, data: { online: false, lastSeenAt: new Date() } });
      await clearDriverPosition(driver.id, driver.vehicleType);
      res.json({ online: false });
    }),
  );

  /**
   * Position ping. Deliberately cheap: the driver's data bundle is a real cost
   * to him, so the apps send this over the socket in normal operation and only
   * fall back to this endpoint when the socket is down.
   */
  router.post(
    "/position",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const { lat, lng } = positionSchema.parse(req.body);
      const driver = await currentDriver(req.user!.sub);
      await setDriverPosition(driver.id, driver.vehicleType, lat, lng);
      await prisma.driver.update({ where: { id: driver.id }, data: { lastSeenAt: new Date() } });
      res.json({ ok: true });
    }),
  );

  /** What he can change himself. Plate and CNI are not on this list. */
  router.patch(
    "/me",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const body = profileSchema.parse(req.body ?? {});
      const driver = await currentDriver(req.user!.sub);

      const homeZone = body.homeZone ? await prisma.zone.findUnique({ where: { code: body.homeZone } }) : undefined;
      if (body.homeZone && !homeZone) throw new ApiError(404, "zone_not_found", "Unknown zone.");

      const updated = await prisma.driver.update({
        where: { id: driver.id },
        data: {
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...(body.hasSpareHelmet !== undefined ? { hasSpareHelmet: body.hasSpareHelmet } : {}),
          ...(homeZone ? { homeZoneId: homeZone.id } : {}),
        },
        select: { gender: true, hasSpareHelmet: true, homeZoneId: true },
      });

      res.json(updated);
    }),
  );

  /**
   * The three numbers across the top of the driver's home screen.
   *
   * `commissionXaf` is always zero and is returned anyway, because "0 taken by
   * us" next to today's earnings is the entire argument for using this app.
   */
  router.get(
    "/me/today",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driver = await currentDriver(req.user!.sub);
      res.json(await todaySummary(driver.id));
    }),
  );

  /** The week, one bar per day, with the ghost-town Mondays named. */
  router.get(
    "/me/week",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driver = await currentDriver(req.user!.sub);
      res.json(await weeklyEarnings(driver.id));
    }),
  );

  /** The earnings screen. */
  router.get(
    "/me/earnings",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driver = await currentDriver(req.user!.sub);
      const days = Number(req.query.days ?? 7);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [balance, trips, fees] = await Promise.all([
        driverBalance(driver.id, since),
        prisma.trip.findMany({
          where: { driverId: driver.id, status: "COMPLETED", completedAt: { gte: since } },
          orderBy: { completedAt: "desc" },
          take: 50,
          select: { id: true, priceXaf: true, pickupLabel: true, dropLabel: true, completedAt: true, paymentMethod: true },
        }),
        prisma.accessFeeCharge.findMany({
          where: { driverId: driver.id, serviceDate: { gte: since } },
          orderBy: { serviceDate: "desc" },
        }),
      ]);

      res.json({
        periodDays: days,
        ...balance,
        accessFees: fees.map((f) => ({
          date: f.serviceDate.toISOString().slice(0, 10),
          amountXaf: f.amountXaf,
          paid: f.paid,
        })),
        trips,
      });
    }),
  );

  return router;
}

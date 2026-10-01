/**
 * Share this trip.
 *
 * "Mum is watching this trip until you arrive" is the line on the trip screen,
 * and it is the single feature a rider gains by using us instead of flagging a
 * bendskin at the roadside. It has to work on a feature phone opening a link in
 * a browser, so the shared view is unauthenticated and the token in the URL is
 * the whole credential.
 *
 * That makes what the link *does not* carry the important part:
 *   * never the PIN — the PIN is what proves the rider is at the bike
 *   * never either phone number
 *   * never the rider's name
 *   * the driver's first name and plate only, which is what a worried person
 *     actually needs in order to ask a useful question
 *
 * A row rather than a signed token, because the rider has to be able to take it
 * back and a JWT that has left the phone cannot be taken back.
 */

import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler, param } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { renderGonePage, renderSharePage } from "./share-page";
import { rateLimit, RULES } from "../middleware/rateLimit";
import { driverPosition } from "../lib/presence";

/** Hard ceiling on a link's life, however long the trip runs. */
export const SHARE_TTL_HOURS = 6;

/**
 * How long the link keeps working after the trip ends.
 *
 * Long enough that the person watching sees the arrival rather than a dead
 * page, short enough that a link forwarded into a group chat is worthless by
 * the time anyone else opens it.
 */
export const SHARE_GRACE_MINUTES = 30;

const TERMINAL = [
  "COMPLETED",
  "CANCELLED_BY_RIDER",
  "CANCELLED_BY_DRIVER",
  "NO_DRIVER_FOUND",
] as const;

function isTerminal(status: string): boolean {
  return (TERMINAL as readonly string[]).includes(status);
}

/** 128 bits, URL-safe. Unguessable is the only property this needs. */
function generateShareToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

const createSchema = z.object({
  /** Free text the rider types — "Mum", "Ngwa". Shown back to them, never public. */
  sharedWith: z.string().trim().min(1).max(40).optional(),
});

/** Mounted under /trips/:id — the rider's half of sharing. */
export function tripShareRouter(): Router {
  const router = Router({ mergeParams: true });

  router.post(
    "/",
    requireAuth("RIDER", "ADMIN"),
    rateLimit(RULES.shareLinks),
    asyncHandler(async (req, res) => {
      const body = createSchema.parse(req.body ?? {});
      const tripId = param(req, "id");

      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      if (!trip || trip.riderId !== req.user!.sub) {
        throw new ApiError(404, "no_trip", "That trip does not exist.");
      }
      if (isTerminal(trip.status)) {
        throw new ApiError(409, "trip_over", "That trip has already finished.");
      }

      const share = await prisma.tripShare.create({
        data: {
          tripId,
          token: generateShareToken(),
          sharedWithLabel: body.sharedWith ?? null,
          expiresAt: new Date(Date.now() + SHARE_TTL_HOURS * 3_600_000),
        },
      });

      res.status(201).json({
        token: share.token,
        path: `/share/${share.token}`,
        sharedWith: share.sharedWithLabel,
        expiresAt: share.expiresAt,
      });
    }),
  );

  /** Who is watching, so the trip screen can say so by name. */
  router.get(
    "/",
    requireAuth("RIDER", "ADMIN"),
    asyncHandler(async (req, res) => {
      const tripId = param(req, "id");
      const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { riderId: true } });
      if (!trip || trip.riderId !== req.user!.sub) {
        throw new ApiError(404, "no_trip", "That trip does not exist.");
      }

      const shares = await prisma.tripShare.findMany({
        where: { tripId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        shares: shares.map((s) => ({
          token: s.token,
          sharedWith: s.sharedWithLabel,
          viewCount: s.viewCount,
          expiresAt: s.expiresAt,
        })),
      });
    }),
  );

  /** Taking it back. The point of storing these rather than signing them. */
  router.delete(
    "/:token",
    requireAuth("RIDER", "ADMIN"),
    asyncHandler(async (req, res) => {
      const tripId = param(req, "id");
      const share = await prisma.tripShare.findUnique({ where: { token: param(req, "token") } });
      if (!share || share.tripId !== tripId) throw new ApiError(404, "no_share", "That link does not exist.");

      const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { riderId: true } });
      if (trip?.riderId !== req.user!.sub) throw new ApiError(404, "no_share", "That link does not exist.");

      await prisma.tripShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
      res.json({ revoked: true });
    }),
  );

  return router;
}

/** Mounted at /share — public, and deliberately thin. */
export function publicShareRouter(): Router {
  const router = Router();

  router.get(
    "/:token",
    asyncHandler(async (req, res) => {
      // A person tapping the link gets a page; anything asking for JSON — the
      // app, a test — gets JSON. Browsers ask for HTML first, so they win it.
      const wantsPage = req.accepts(["json", "html"]) === "html";
      // Live, and the token is the credential: no copy kept anywhere between.
      res.setHeader("cache-control", "no-store");
      res.setHeader("referrer-policy", "no-referrer");

      const share = await prisma.tripShare.findUnique({
        where: { token: param(req, "token") },
        include: {
          trip: {
            include: {
              driver: { include: { user: { select: { name: true } } } },
              fromZone: { select: { name: true } },
              toZone: { select: { name: true } },
              // Her language, for the page — not her name, which it never shows.
              rider: { select: { language: true } },
            },
          },
        },
      });

      // One message for missing, revoked and expired alike: a wrong token must
      // not become a way to learn that a trip exists.
      const goneAway = () => {
        if (wantsPage) {
          res.status(404).type("html").send(renderGonePage());
          return;
        }
        throw new ApiError(404, "link_dead", "This link is no longer active.");
      };
      if (!share || share.revokedAt || share.expiresAt < new Date()) return goneAway();

      const trip = share.trip;
      const ended = isTerminal(trip.status);
      const endedAt = trip.completedAt ?? trip.cancelledAt;
      if (ended && endedAt && Date.now() - endedAt.getTime() > SHARE_GRACE_MINUTES * 60_000) return goneAway();

      await prisma.tripShare.update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } });

      // Live position only while the bike is actually moving with someone on it.
      const position =
        trip.driverId && !ended && (trip.status === "IN_PROGRESS" || trip.status === "ACCEPTED" || trip.status === "ARRIVED")
          ? await driverPosition(trip.driverId, trip.vehicleType)
          : null;

      const driver = trip.driver
        ? {
            // First name only. Enough to ask after him, not enough to find him.
            firstName: trip.driver.user.name?.split(" ")[0] ?? null,
            plate: trip.driver.plate,
            rating: Number(trip.driver.rating.toFixed(1)),
            verified: trip.driver.status === "ACTIVE",
          }
        : null;

      if (wantsPage) {
        res.type("html").send(
          renderSharePage(
            {
              status: trip.status,
              ended,
              from: trip.pickupLabel,
              to: trip.dropLabel,
              driver,
              position,
              startedAt: trip.startedAt,
              completedAt: trip.completedAt,
            },
            trip.rider.language,
          ),
        );
        return;
      }

      res.json({
        status: trip.status,
        ended,
        from: trip.pickupLabel,
        to: trip.dropLabel,
        fromZone: trip.fromZone.name,
        toZone: trip.toZone.name,
        priceXaf: trip.priceXaf,
        driver,
        position,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
      });
    }),
  );

  return router;
}

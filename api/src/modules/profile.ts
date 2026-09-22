/**
 * A person's own details, and their photograph.
 *
 * Two things live here that had nowhere to live before.
 *
 * **The name.** Until now it could only be set while verifying a code, and
 * never corrected — somebody who typed it wrong on a bus was stuck with it.
 *
 * **The photograph.** Not decoration. At Mile 17 in the evening a driver is
 * looking for one person among twenty standing in the same place, and the
 * thing he has is a name and a phone number. Bolt added rider selfies in South
 * Africa for exactly this: so the driver can match the waiting rider to the
 * booking. It cuts the wrong-passenger pickup, and it gives both sides a face
 * to attach to a complaint afterwards.
 *
 * Who may see a face is the whole design of this file:
 *
 *   your own            always
 *   the other person's  only while you share a live trip, and only then
 *   anybody else's      never
 *
 * There is no public URL and no shareable link. A photograph is served by us,
 * per request, to somebody we have checked — the same posture as the ID
 * documents next door, for the same reason.
 */

import { Router, raw } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler, param } from "../lib/http";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { assertAcceptable, documents, fingerprint } from "./documents/store";

/**
 * Smaller than an ID document on purpose.
 *
 * This is a face at 96 points, not evidence. Anything above a megabyte is a
 * phone uploading a 12-megapixel original over a connection somebody is paying
 * for by the megabyte, and the app should have resized it first.
 */
const PHOTO_MAX_BYTES = 1_000_000;

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  language: z.enum(["en", "fr"]).optional(),
});

/** The statuses in which two people are on the road together. */
const SHARED_TRIP_STATUSES = ["ACCEPTED", "ARRIVED", "IN_PROGRESS"] as const;

/** Mounted at /me. */
export function profileRouter(): Router {
  const router = Router();

  /** Correct your name, or switch the language we write to you in. */
  router.patch(
    "/",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const body = patchSchema.parse(req.body ?? {});
      if (body.name === undefined && body.language === undefined) {
        throw new ApiError(400, "nothing_to_change", "Send a name or a language.");
      }

      const user = await prisma.user.update({
        where: { id: req.user!.sub },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.language !== undefined ? { language: body.language } : {}),
        },
        select: { id: true, name: true, language: true },
      });

      res.json(user);
    }),
  );

  /**
   * Send your photograph.
   *
   * Raw body, not multipart, and the bytes are sniffed rather than trusted —
   * the same handling as a driver's ID, because the difference between the two
   * is what they are for, not how much care they deserve.
   */
  router.put(
    "/photo",
    requireAuth(),
    raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: PHOTO_MAX_BYTES }),
    asyncHandler(async (req, res) => {
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const contentType = assertAcceptable(bytes);

      const key = await documents.put(bytes, contentType);

      const previous = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        select: { photoKey: true },
      });

      await prisma.user.update({
        where: { id: req.user!.sub },
        data: { photoKey: key, photoAt: new Date() },
      });

      // Afterwards, so a failed write never leaves the row pointing at nothing.
      if (previous?.photoKey && previous.photoKey !== key) {
        await documents.remove(previous.photoKey);
      }

      logger.info(
        { userId: req.user!.sub, bytes: bytes.length, sha: fingerprint(bytes) },
        "profile photo received",
      );

      res.json({ uploaded: true, byteSize: bytes.length });
    }),
  );

  /** Your own face, back again. */
  router.get(
    "/photo",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        select: { photoKey: true },
      });
      if (!user?.photoKey) throw new ApiError(404, "no_photo", "You have not sent one.");

      const stored = await documents.get(user.photoKey);
      res.setHeader("content-type", stored.contentType);
      res.setHeader("cache-control", "no-store, private");
      res.send(stored.bytes);
    }),
  );

  /** Take it down. The bytes go too, not just the reference. */
  router.delete(
    "/photo",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        select: { photoKey: true },
      });
      if (!user?.photoKey) throw new ApiError(404, "no_photo", "There is nothing to remove.");

      await prisma.user.update({
        where: { id: req.user!.sub },
        data: { photoKey: null, photoAt: null },
      });
      await documents.remove(user.photoKey);

      res.json({ removed: true });
    }),
  );

  return router;
}

/**
 * The other person's face, during the trip you share.
 *
 * Mounted at /trips/:id/photo. The authorisation is the point: membership of
 * *this* trip, in a status where you are actually about to meet, is the only
 * thing that opens it. A completed trip closes it again — a driver does not
 * keep a rider's photograph because he drove her to Molyko last Tuesday.
 */
export function tripPhotoRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get(
    "/",
    requireAuth("RIDER", "DRIVER"),
    asyncHandler(async (req, res) => {
      const trip = await prisma.trip.findUnique({
        where: { id: param(req, "id") },
        select: {
          status: true,
          riderId: true,
          rider: { select: { photoKey: true } },
          driver: { select: { userId: true, user: { select: { photoKey: true } } } },
        },
      });
      if (!trip) throw new ApiError(404, "no_trip", "That trip does not exist.");

      const isRider = trip.riderId === req.user!.sub;
      const isDriver = trip.driver?.userId === req.user!.sub;
      if (!isRider && !isDriver) throw new ApiError(403, "not_yours", "That trip is not yours.");

      if (!SHARED_TRIP_STATUSES.includes(trip.status as (typeof SHARED_TRIP_STATUSES)[number])) {
        // Before a driver is assigned there is nobody to show, and after the
        // trip ends there is no longer a reason to.
        throw new ApiError(409, "not_now", "There is no live trip between you two.");
      }

      // You get the other one, never your own — this route exists so the two
      // of you can recognise each other at the kerb.
      const key = isRider ? trip.driver?.user.photoKey : trip.rider.photoKey;
      if (!key) throw new ApiError(404, "no_photo", "They have not sent a photograph.");

      const stored = await documents.get(key);
      res.setHeader("content-type", stored.contentType);
      res.setHeader("cache-control", "no-store, private");
      res.send(stored.bytes);
    }),
  );

  return router;
}

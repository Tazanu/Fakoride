/**
 * Your account: a copy of what we hold, and deleting it.
 *
 * The privacy page has promised both since it was written — "give you a copy
 * you can take elsewhere", "delete your account and what we hold" — and Law
 * 2024/017 makes them rights, not favours. Neither existed: a person who
 * wanted out had to find somebody to ask. Google Play now refuses an app that
 * lets people make an account in it but not delete one there too.
 *
 * **Deleting empties the account; it does not remove the row.** Trips, fares,
 * payouts and complaints point at it, and the privacy page says plainly that
 * trip records and money are kept: a driver's earnings are his record of
 * income, a fare dispute or an incident can surface weeks later, and money
 * records are ones the law requires us to keep. What makes them about *you* —
 * the name, the number, the face, the people you trust — goes, at once.
 *
 * A driver's papers are the exception the privacy page names: "kept while you
 * drive with us and for as long afterwards as we are required to hold them".
 * His driver record is taken off the road and kept, so ops can still answer
 * for a ride he gave — and so a driver ops suspended cannot delete himself and
 * come straight back under the same ID card as if nothing happened.
 *
 * Refused while it would leave somebody stranded: in the middle of a ride, with
 * a prompt still on the way to a phone, or with money of his that we are still
 * holding — that has to reach his MoMo first, or it has nowhere to go.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";
import { requireAuth, revokeAllSessions } from "../middleware/auth";
import { clearDriverPosition } from "../lib/presence";
import { endAllSessions } from "../realtime";
import { documents } from "./documents/store";
import { driverPayable } from "./payments/service";

const LIVE = ["REQUESTED", "OFFERED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"] as const;

export function accountRouter(): Router {
  const router = Router();

  /**
   * Everything we hold about you, as one file.
   *
   * Yours, not other people's: a ride lists the plate you got into, not the
   * driver's name or number — that is his to ask for. ID photos are listed,
   * not sent: they are the size of photographs and you already have the card.
   */
  router.get(
    "/export",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const userId = req.user!.sub;
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          trustedContacts: { select: { name: true, phone: true, createdAt: true } },
          complaints: {
            orderBy: { createdAt: "desc" },
            select: { category: true, message: true, status: true, createdAt: true, response: true, answeredAt: true, tripId: true },
          },
          sosAlerts: { orderBy: { raisedAt: "desc" }, select: { tripId: true, lat: true, lng: true, note: true, raisedAt: true, status: true } },
          driver: {
            include: {
              documents: { select: { kind: true, uploadedAt: true } },
              ledger: { orderBy: { createdAt: "desc" }, select: { type: true, amountXaf: true, note: true, createdAt: true, tripId: true } },
              accessFees: { orderBy: { serviceDate: "desc" }, select: { serviceDate: true, amountXaf: true, paid: true, paidAt: true } },
            },
          },
        },
      });

      const tripFields = {
        id: true,
        status: true,
        requestedAt: true,
        completedAt: true,
        pickupLabel: true,
        dropLabel: true,
        priceXaf: true,
        paymentMethod: true,
        vehicleType: true,
      } as const;
      const [ridesTaken, ridesGiven, payments] = await Promise.all([
        prisma.trip.findMany({
          where: { riderId: userId },
          orderBy: { requestedAt: "desc" },
          select: { ...tripFields, riderStars: true, driver: { select: { plate: true } } },
        }),
        user.driver
          ? prisma.trip.findMany({ where: { driverId: user.driver.id }, orderBy: { requestedAt: "desc" }, select: tripFields })
          : Promise.resolve([]),
        prisma.payment.findMany({
          where: { OR: [{ trip: { riderId: userId }, purpose: "TRIP_FARE" }, ...(user.driver ? [{ driverId: user.driver.id, purpose: { not: "TRIP_FARE" as const } }] : [])] },
          orderBy: { createdAt: "desc" },
          select: { purpose: true, amountXaf: true, phone: true, status: true, failureReason: true, createdAt: true, confirmedAt: true, tripId: true },
        }),
      ]);

      const d = user.driver;
      const copy = {
        about: "Everything Fako Ride holds about this account, as of exportedAt.",
        exportedAt: new Date().toISOString(),
        account: {
          phone: user.phone,
          name: user.name,
          language: user.language,
          role: user.role,
          hasPhoto: user.photoKey !== null,
          createdAt: user.createdAt,
        },
        trustedContacts: user.trustedContacts,
        ridesTaken: ridesTaken.map(({ driver, ...t }) => ({ ...t, plate: driver?.plate ?? null })),
        payments,
        complaints: user.complaints,
        emergencyAlerts: user.sosAlerts,
        driver: d
          ? {
              status: d.status,
              plate: d.plate,
              vehicleType: d.vehicleType,
              cniNumber: d.cniNumber,
              licenceNumber: d.licenceNumber,
              rating: d.rating,
              ratingCount: d.ratingCount,
              tripCount: d.tripCount,
              createdAt: d.createdAt,
              documents: d.documents,
              ridesGiven,
              earnings: d.ledger,
              accessFees: d.accessFees,
            }
          : null,
      };

      res.setHeader("content-disposition", `attachment; filename="fako-ride-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json(copy);
    }),
  );

  /**
   * Delete this account. See the top of this file for what that means.
   *
   * Not for ops accounts: the role is granted from a shell on purpose, and it
   * leaves the same way (`npm run admin:grant -- <phone> --revoke`).
   */
  router.delete(
    "/",
    requireAuth("RIDER", "DRIVER"),
    asyncHandler(async (req, res) => {
      // A tap that slipped must not be able to do this. The app asks twice.
      z.object({ confirm: z.literal("DELETE") }).parse(req.body ?? {});
      await deleteAccount(req.user!.sub);
      res.json({ deleted: true });
    }),
  );

  return router;
}

/** What the phone column holds afterwards. Not a number, so nothing can sign in as it. */
export const deletedPhone = (userId: string) => `deleted:${userId}`;

/**
 * The deletion itself, shared by the app's button and `npm run account:delete`
 * (for somebody who no longer has the app and writes in).
 */
export async function deleteAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { driver: true } });
  if (!user || user.deletedAt) throw new ApiError(404, "no_account", "This account no longer exists.");
  const driver = user.driver;

  const live = await prisma.trip.findFirst({
    where: {
      status: { in: [...LIVE] },
      OR: [{ riderId: userId }, ...(driver ? [{ driverId: driver.id }] : [])],
    },
    select: { id: true },
  });
  if (live) {
    throw new ApiError(409, "trip_in_progress", "Finish or cancel your ride first.", { tripId: live.id });
  }

  const inFlight = await prisma.payment.findFirst({
    where: {
      status: { in: ["CREATED", "PENDING"] },
      OR: [{ trip: { riderId: userId } }, ...(driver ? [{ driverId: driver.id }] : [])],
    },
    select: { id: true },
  });
  if (inFlight) throw new ApiError(409, "payment_in_flight", "A payment is still on its way. Try again in a few minutes.");

  if (driver) {
    const { payableXaf } = await driverPayable(driver.id);
    if (payableXaf > 0) {
      throw new ApiError(409, "money_held", `We are still holding ${payableXaf} FCFA for you. Send it to your MoMo first.`, {
        payableXaf,
      });
    }
  }

  const photoKey = user.photoKey;
  await prisma.$transaction([
    prisma.trustedContact.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        // Not a number anybody can be texted or charged on, and unique as
        // the column demands. Signing in with the old number makes a new,
        // empty account — which is what somebody who left and came back
        // should get.
        phone: deletedPhone(userId),
        name: null,
        photoKey: null,
        photoAt: null,
        pushToken: null,
        pushTokenAt: null,
        deletedAt: new Date(),
      },
    }),
    ...(driver
      ? [
          prisma.driver.update({ where: { id: driver.id }, data: { online: false, status: "SUSPENDED" } }),
          prisma.driverReview.create({
            data: { driverId: driver.id, action: "SUSPENDED", by: userId, note: "Deleted their own account." },
          }),
        ]
      : []),
  ]);

  // After the database, so a failure here leaves a deleted account with a
  // stray file rather than a live account with no photo.
  if (photoKey) await documents.remove(photoKey).catch((err) => logger.warn({ err: String(err) }, "account: photo not removed"));
  if (driver) await clearDriverPosition(driver.id, driver.vehicleType).catch(() => undefined);
  await revokeAllSessions(userId);
  endAllSessions(userId);

  logger.info({ userId, wasDriver: Boolean(driver) }, "account deleted by its owner");
}

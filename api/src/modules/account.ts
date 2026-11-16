/**
 * Deleting an account.
 *
 * The privacy page has promised it since the day it was written — "you can ask
 * us to delete your account and what we hold" — and nothing could do it: no
 * button, no endpoint, and an address to write to that reached nobody. The law
 * the page cites gives people that right, and no app store will list an app
 * that takes sign-ups and cannot remove them.
 *
 * What goes, at once and for good:
 *
 *   the phone number on the account      replaced by a placeholder nobody can
 *                                        sign in with
 *   the name, the photograph             cleared; the file itself is deleted
 *   trusted contacts                     deleted
 *   a driver's ID photographs            the rows and the files
 *   a driver's CNI and licence numbers   cleared
 *   every session, on every phone        ended
 *
 * What stays, and why. Rides, the ledger, payments, complaints and alarms are
 * kept: a fare somebody disputes next month, a complaint about this driver, a
 * payment the provider asks about — each needs the record to still exist, and
 * some of it the law requires us to hold. They stay attached to a row that no
 * longer says who it was. A driver's plate stays for the same reason: it is
 * what a rider with a complaint remembers. The same number signing up again is
 * a new account with none of this.
 *
 * Three things stop it, and each is told plainly rather than half-done:
 * a ride under way, money we are holding for a driver (he should cash it out —
 * deleting the account must not forfeit it), and a payment still in flight.
 */

import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/http";
import { logger } from "../lib/logger";
import { clearDriverPosition } from "../lib/presence";
import { revokeAllSessions } from "../middleware/auth";
import { endAllSessions } from "../realtime";
import { documents } from "./documents/store";
import { driverPayable } from "./payments/service";

/** What the phone column holds afterwards. Not a number, so nothing can sign in as it. */
export const deletedPhone = (userId: string) => `deleted:${userId}`;

export async function deleteAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { driver: { include: { documents: { select: { key: true } } } } },
  });
  if (!user || user.deletedAt) throw new ApiError(404, "no_account", "This account no longer exists.");

  const riding = await prisma.trip.findFirst({
    where: { riderId: userId, status: { in: ["REQUESTED", "OFFERED", "ACCEPTED", "ARRIVED", "IN_PROGRESS"] } },
    select: { id: true },
  });
  if (riding) {
    throw new ApiError(409, "trip_in_progress", "Finish or cancel your ride first.", { tripId: riding.id });
  }

  const driver = user.driver;
  if (driver) {
    const driving = await prisma.trip.findFirst({
      where: { driverId: driver.id, status: { in: ["ACCEPTED", "ARRIVED", "IN_PROGRESS"] } },
      select: { id: true },
    });
    if (driving) {
      throw new ApiError(409, "trip_in_progress", "Finish the ride you are on first.", { tripId: driving.id });
    }

    const moving = await prisma.payment.findFirst({
      where: { driverId: driver.id, status: { in: ["CREATED", "PENDING"] } },
      select: { id: true },
    });
    if (moving) {
      throw new ApiError(409, "payment_in_flight", "A payment on your account is still going through. Try again in a few minutes.");
    }

    const { payableXaf } = await driverPayable(driver.id);
    if (payableXaf > 0) {
      throw new ApiError(409, "balance_held", `We are holding ${payableXaf} XAF for you. Send it to your MoMo first.`, {
        payableXaf,
      });
    }
  }

  const files = [user.photoKey, ...(driver?.documents.map((d) => d.key) ?? [])].filter(
    (key): key is string => Boolean(key),
  );

  await prisma.$transaction(async (tx) => {
    await tx.trustedContact.deleteMany({ where: { userId } });

    if (driver) {
      await tx.driverDocument.deleteMany({ where: { driverId: driver.id } });
      await tx.driver.update({
        where: { id: driver.id },
        data: {
          online: false,
          // Not a punishment — the one status dispatch will never offer a ride to.
          status: "SUSPENDED",
          cniNumber: "deleted",
          licenceNumber: null,
          gender: "UNSPECIFIED",
        },
      });
      await tx.driverReview.create({
        data: { driverId: driver.id, action: "SUSPENDED", by: userId, note: "Account deleted by its owner." },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        phone: deletedPhone(userId),
        name: null,
        photoKey: null,
        photoAt: null,
        pushToken: null,
        pushTokenAt: null,
        deletedAt: new Date(),
      },
    });
  });

  // After the transaction, and each on its own: a file that will not delete
  // must not put the account back. It is logged, with its key, to be removed.
  for (const key of files) {
    await documents.remove(key).catch((err: unknown) =>
      logger.error({ userId, key, err: String(err) }, "account deletion: a file could not be removed"),
    );
  }
  if (driver) {
    await clearDriverPosition(driver.id, driver.vehicleType).catch(() => undefined);
  }

  await revokeAllSessions(userId);
  endAllSessions(userId);
  logger.info({ userId, wasDriver: Boolean(driver) }, "account deleted at its owner's request");
}

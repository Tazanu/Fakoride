/**
 * The watchdog: things that have gone quiet and will not fix themselves.
 *
 * Everything else in this API moves because a person tapped something. These
 * are the cases where the person who should have tapped cannot, or forgot:
 *
 *   a driver's phone died      he is still "online", still the nearest dot to
 *                              somebody, and every ride offered to him is
 *                              twelve seconds of a rider's wait thrown away
 *   a driver never pressed     the ride is "in progress" for good, and his
 *   Finish                     rider — who may have one ride running — cannot
 *                              book another
 *   a driver accepted and      the same, one step earlier
 *   never came
 *
 * A sweep on a timer rather than a timer per ride, for the reason dispatch
 * gives: a timer dies with the process. Each tick takes the shared lock, so
 * with two API instances the work is still done once.
 */

import { env } from "../env";
import { ApiError } from "../lib/http";
import { logger } from "../lib/logger";
import { clearDriverPosition, freshDriverIds } from "../lib/presence";
import { prisma } from "../lib/prisma";
import { notify } from "../lib/push";
import { takeTick } from "../lib/redis";
import { emitToDriver } from "../realtime";
import { driversOnATrip } from "./dispatch";
import { cancelTripFromOutside, completeTrip } from "./trips";

/** Who the trip record says did it, when nobody did. */
const SYSTEM = "system";

/**
 * Take drivers offline who have not been heard from.
 *
 * Losing signal for a minute on the Soppo climb is normal and must not drop a
 * driver out of dispatch — which is why a closed socket has never marked anyone
 * offline, and still does not. This is different in kind: his app pings every
 * half minute, and DRIVER_STALE_AFTER_SECONDS of nothing at all is a phone that
 * is off. He is told, by push, so that he does not sit believing he is
 * available.
 *
 * A driver with a passenger is left alone however quiet he is. His ride is
 * real whether or not his phone is, and the trip sweep below is what deals
 * with a ride that never ends.
 */
export async function sweepStaleDrivers(): Promise<number> {
  if (env.DRIVER_STALE_AFTER_SECONDS <= 0) return 0;

  const online = await prisma.driver.findMany({
    where: { online: true },
    select: { id: true, userId: true, vehicleType: true },
    take: 500,
  });
  if (online.length === 0) return 0;

  const fresh = await freshDriverIds(online.map((d) => d.id));
  const quiet = online.filter((d) => !fresh.has(d.id));
  if (quiet.length === 0) return 0;

  const carrying = await driversOnATrip(quiet.map((d) => d.id));
  let taken = 0;
  for (const driver of quiet) {
    if (carrying.has(driver.id)) continue;
    // Asked again, one driver at a time: a ping that landed since the list was
    // read means he is back, and taking him offline now would be our mistake.
    if ((await freshDriverIds([driver.id])).has(driver.id)) continue;

    const changed = await prisma.driver.updateMany({ where: { id: driver.id, online: true }, data: { online: false } });
    await clearDriverPosition(driver.id, driver.vehicleType);
    if (changed.count === 0) continue;

    taken += 1;
    emitToDriver(driver.id, "driver:offline", { reason: "quiet" });
    notify(driver.userId, "taken_offline", {});
    logger.info({ driverId: driver.id }, "driver taken offline after going quiet");
  }
  return taken;
}

/**
 * End rides that will never end by themselves.
 *
 * A ride in progress long past any journey on this corridor is finished the
 * way its driver would have finished it: the fare is written, a mobile fare is
 * charged. The ride happened; what did not happen is the tap. Guessing the
 * other way would take a fare a driver earned out of his week because his
 * battery ran down.
 *
 * A ride accepted and never started is cancelled instead — nobody was carried,
 * so nothing is owed — and the rider is free to book again.
 */
export async function sweepStuckTrips(now: Date = new Date()): Promise<{ finished: number; cancelled: number }> {
  const done = { finished: 0, cancelled: 0 };

  if (env.TRIP_AUTO_FINISH_AFTER_MINUTES > 0) {
    const cutoff = new Date(now.getTime() - env.TRIP_AUTO_FINISH_AFTER_MINUTES * 60_000);
    const running = await prisma.trip.findMany({
      where: { status: "IN_PROGRESS", startedAt: { lt: cutoff } },
      select: { id: true },
      take: 50,
    });
    for (const trip of running) {
      const ended = await endQuietly(() =>
        completeTrip(trip.id, SYSTEM, { autoFinished: true, afterMinutes: env.TRIP_AUTO_FINISH_AFTER_MINUTES }),
      );
      if (ended) {
        done.finished += 1;
        logger.warn({ tripId: trip.id }, "ride finished by the watchdog — its driver never pressed Finish");
      }
    }
  }

  if (env.TRIP_PICKUP_TIMEOUT_MINUTES > 0) {
    const cutoff = new Date(now.getTime() - env.TRIP_PICKUP_TIMEOUT_MINUTES * 60_000);
    const waiting = await prisma.trip.findMany({
      where: { status: { in: ["ACCEPTED", "ARRIVED"] }, acceptedAt: { lt: cutoff } },
      select: { id: true },
      take: 50,
    });
    for (const trip of waiting) {
      const ended = await endQuietly(() =>
        cancelTripFromOutside(trip.id, SYSTEM, `No pickup within ${env.TRIP_PICKUP_TIMEOUT_MINUTES} minutes of accepting.`),
      );
      if (ended) {
        done.cancelled += 1;
        logger.warn({ tripId: trip.id }, "ride cancelled by the watchdog — accepted and never started");
      }
    }
  }

  return done;
}

/**
 * Run one ending, and say whether it happened.
 *
 * `wrong_state` is the ride having moved while we were looking at it — the
 * driver pressed Finish in the same second. That is the good outcome, not an
 * error. Anything else is logged and the sweep carries on to the next ride:
 * one bad row must not leave every other stuck ride stuck.
 */
async function endQuietly(end: () => Promise<unknown>): Promise<boolean> {
  try {
    await end();
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === "wrong_state") return false;
    logger.error({ err: String(err) }, "watchdog: could not end a ride");
    return false;
  }
}

export function startWatchdog(intervalMs = env.WATCHDOG_INTERVAL_SECONDS * 1000): NodeJS.Timeout {
  return setInterval(() => {
    void takeTick("watchdog", intervalMs - 100).then((mine) => {
      if (!mine) return;
      void sweepStaleDrivers().catch((err) => logger.error({ err: String(err) }, "watchdog: stale-driver sweep failed"));
      void sweepStuckTrips().catch((err) => logger.error({ err: String(err) }, "watchdog: stuck-trip sweep failed"));
    });
  }, intervalMs);
}

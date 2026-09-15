/**
 * Dispatch.
 *
 * One trip is offered to one driver at a time, for a short window, nearest
 * first. Broadcasting to everyone is how you teach drivers to ignore the app,
 * and it is how two bikes arrive for one rider.
 *
 * Driver positions live in a Redis GEO set; losing them costs nothing worse than
 * a driver having to move once for us to see him again.
 */

import { redis, offerKey } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { logger } from "../lib/logger";
import { clearDriverPosition, nearbyDriverIds } from "../lib/presence";
import { emitToDriver, emitToRider } from "../realtime";

export type Candidate = { driverId: string; distanceM: number };

/**
 * How many drivers to pull out of Redis before asking Postgres about them.
 *
 * Redis knows where bikes are but not whether they may drive, so the geo set is
 * always a superset: a suspended driver, one who went offline through a path
 * that did not reach Redis, a restart that left entries behind. Asking for only
 * as many as we intend to offer means one ghost sitting closest to the rider
 * sinks the whole dispatch — which is exactly what used to happen, because this
 * is called with limit 1.
 *
 * Twenty is far more than the number of bikes that will ever be within 2.5 km
 * on this corridor, and it is one Redis call either way.
 */
const CANDIDATE_POOL = 20;

/** Nearest online drivers to a pickup point, closest first. */
export async function findCandidates(opts: {
  lat: number;
  lng: number;
  vehicleType: string;
  excludeDriverIds: string[];
  limit?: number;
  /** The rider asked for a helmet, so only a bike carrying a spare qualifies. */
  requireSpareHelmet?: boolean;
  /** The rider asked for a woman driver. Narrows the pool, never widens it. */
  requireWomanDriver?: boolean;
}): Promise<Candidate[]> {
  const limit = opts.limit ?? 10;

  const raw = await nearbyDriverIds({
    lat: opts.lat,
    lng: opts.lng,
    vehicleType: opts.vehicleType,
    radiusM: env.DISPATCH_RADIUS_M,
    count: Math.max(CANDIDATE_POOL, limit + opts.excludeDriverIds.length),
  });

  const excluded = new Set(opts.excludeDriverIds);
  const nearby = raw.filter((c) => !excluded.has(c.driverId));
  if (nearby.length === 0) return [];

  // Redis knows where they are; Postgres knows whether they are allowed to drive.
  const live = await prisma.driver.findMany({
    where: { id: { in: nearby.map((c) => c.driverId) }, status: "ACTIVE", online: true },
    select: { id: true, hasSpareHelmet: true, gender: true },
  });
  const liveById = new Map(live.map((d) => [d.id, d]));

  // Anything Redis still holds that Postgres will not vouch for is a ghost:
  // a suspended driver, or an entry a crash left behind. Drop it now rather
  // than letting it sit at the front of the queue blocking real bikes.
  const ghosts = nearby.filter((c) => !liveById.has(c.driverId));
  if (ghosts.length > 0) {
    await Promise.all(ghosts.map((g) => clearDriverPosition(g.driverId, opts.vehicleType)));
    logger.info({ count: ghosts.length }, "pruned stale drivers from the geo set");
  }

  // The rider's preferences narrow the pool but never make somebody a ghost —
  // a driver with no spare helmet is still a perfectly good driver.
  return nearby
    .filter((c) => {
      const driver = liveById.get(c.driverId);
      if (!driver) return false;
      if (opts.requireSpareHelmet && !driver.hasSpareHelmet) return false;
      if (opts.requireWomanDriver && driver.gender !== "WOMAN") return false;
      return true;
    })
    .slice(0, limit);
}

/**
 * Offer a trip to the next nearest driver who has not already seen it.
 * Returns false when nobody is left, which is a real outcome, not an error.
 */
export async function offerToNextDriver(tripId: string): Promise<boolean> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return false;
  if (trip.status !== "REQUESTED" && trip.status !== "OFFERED") return false;

  const [candidate] = await findCandidates({
    lat: trip.pickupLat,
    lng: trip.pickupLng,
    vehicleType: trip.vehicleType,
    excludeDriverIds: trip.offeredDriverIds,
    limit: 1,
    requireSpareHelmet: trip.needsHelmet,
    requireWomanDriver: trip.womanDriverOnly,
  });

  if (!candidate) {
    await prisma.$transaction([
      prisma.trip.update({ where: { id: tripId }, data: { status: "NO_DRIVER_FOUND" } }),
      prisma.tripEvent.create({
        data: {
          tripId,
          status: "NO_DRIVER_FOUND",
          actor: "system",
          // Which constraint emptied the pool, so the app can offer to drop it
          // rather than just telling the rider there are no bikes.
          meta: { needsHelmet: trip.needsHelmet, womanDriverOnly: trip.womanDriverOnly },
        },
      }),
    ]);
    await redis.del(offerKey(tripId));
    emitToRider(trip.riderId, "trip:no_driver", {
      tripId,
      needsHelmet: trip.needsHelmet,
      womanDriverOnly: trip.womanDriverOnly,
    });
    logger.info({ tripId }, "no driver available");
    return false;
  }

  await prisma.$transaction([
    prisma.trip.update({
      where: { id: tripId },
      data: { status: "OFFERED", offeredDriverIds: { push: candidate.driverId } },
    }),
    prisma.tripEvent.create({
      data: { tripId, status: "OFFERED", actor: "system", meta: { driverId: candidate.driverId } },
    }),
  ]);

  await redis.set(offerKey(tripId), candidate.driverId, "EX", env.OFFER_TTL_SECONDS + 3);

  emitToDriver(candidate.driverId, "trip:offer", {
    tripId,
    priceXaf: trip.priceXaf,
    pickupLabel: trip.pickupLabel,
    dropLabel: trip.dropLabel,
    pickupDistanceM: Math.round(candidate.distanceM),
    paymentMethod: trip.paymentMethod,
    // He has already been filtered for it, but he still has to remember to
    // hand it over when he gets there.
    needsHelmet: trip.needsHelmet,
    expiresInSeconds: env.OFFER_TTL_SECONDS,
  });

  logger.info({ tripId, driverId: candidate.driverId }, "trip offered");
  return true;
}

/**
 * Move on any offer whose window has closed.
 *
 * A sweeper rather than a per-offer timer on purpose: a timer dies with the
 * process and leaves a rider watching a spinner forever. This survives restarts.
 */
export function startDispatchSweeper(intervalMs = 2000): NodeJS.Timeout {
  return setInterval(() => {
    void sweepExpiredOffers().catch((err) => logger.error({ err }, "dispatch sweep failed"));
  }, intervalMs);
}

export async function sweepExpiredOffers(): Promise<void> {
  const cutoff = new Date(Date.now() - env.OFFER_TTL_SECONDS * 1000);

  const stale = await prisma.trip.findMany({
    where: { status: "OFFERED" },
    select: { id: true, events: { where: { status: "OFFERED" }, orderBy: { at: "desc" }, take: 1 } },
    take: 50,
  });

  for (const trip of stale) {
    const offeredAt = trip.events[0]?.at;
    if (!offeredAt || offeredAt > cutoff) continue;
    // Still held by a live offer key? Leave it alone.
    if (await redis.exists(offerKey(trip.id))) continue;
    logger.info({ tripId: trip.id }, "offer expired, moving to next driver");
    await offerToNextDriver(trip.id);
  }
}

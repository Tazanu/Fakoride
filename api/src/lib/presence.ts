/**
 * Where the bikes are, right now.
 *
 * Kept in a Redis GEO set rather than Postgres: it changes every few seconds,
 * it is worthless a minute later, and losing it costs nothing worse than a
 * driver moving once before we see him again.
 *
 * This module knows nothing about trips or sockets on purpose — both dispatch
 * and the realtime layer depend on it, and neither should depend on the other.
 */

import { env } from "../env";
import { redis, driverGeoKey, driverSeenKey } from "./redis";

export type NearbyDriver = { driverId: string; distanceM: number };

export async function setDriverPosition(
  driverId: string,
  vehicleType: string,
  lat: number,
  lng: number,
): Promise<void> {
  await redis.geoadd(driverGeoKey(vehicleType), lng, lat, driverId);
  await markDriverSeen(driverId);
}

export async function clearDriverPosition(driverId: string, vehicleType: string): Promise<void> {
  await redis.zrem(driverGeoKey(vehicleType), driverId);
  await redis.del(driverSeenKey(driverId));
}

/**
 * He is still there.
 *
 * A position in the geo set says where a driver was, and nothing about when.
 * A phone that died at Molyko at eight leaves a dot at Molyko all day, and
 * every rider who books there is offered to it first — twelve seconds of her
 * wait, each time, for a taxi that is not coming. So every ping also renews a
 * key that expires on its own, and "has he been heard from lately" is whether
 * the key still exists.
 */
export async function markDriverSeen(driverId: string): Promise<void> {
  if (env.DRIVER_STALE_AFTER_SECONDS <= 0) return;
  await redis.set(driverSeenKey(driverId), String(Date.now()), "EX", env.DRIVER_STALE_AFTER_SECONDS);
}

/**
 * Which of these drivers have pinged recently enough to be offered a ride.
 *
 * Everybody, when the check is switched off. If Redis cannot be asked the
 * caller gets the error: dispatch already depends on Redis for the positions
 * themselves, so there is no working path to protect by guessing here.
 */
export async function freshDriverIds(driverIds: string[]): Promise<Set<string>> {
  if (env.DRIVER_STALE_AFTER_SECONDS <= 0 || driverIds.length === 0) return new Set(driverIds);
  const seen = await redis.mget(driverIds.map(driverSeenKey));
  return new Set(driverIds.filter((_, i) => seen[i] !== null));
}

/** Nearest first, within radiusM. Says nothing about whether they may drive. */
export async function nearbyDriverIds(opts: {
  lat: number;
  lng: number;
  vehicleType: string;
  radiusM: number;
  count: number;
}): Promise<NearbyDriver[]> {
  const raw = (await redis.geosearch(
    driverGeoKey(opts.vehicleType),
    "FROMLONLAT",
    opts.lng,
    opts.lat,
    "BYRADIUS",
    opts.radiusM,
    "m",
    "ASC",
    "COUNT",
    opts.count,
    "WITHDIST",
  )) as unknown as [string, string][];

  return raw.map(([driverId, distance]) => ({ driverId, distanceM: Number(distance) }));
}

/**
 * Where one driver is, if we still know.
 *
 * Returns null rather than throwing when the GEO set has never seen him or has
 * dropped him: on this corridor a bike out of signal is the normal case, not an
 * error, and every caller has to render that anyway.
 */
export async function driverPosition(
  driverId: string,
  vehicleType: string,
): Promise<{ lat: number; lng: number } | null> {
  const [pos] = await redis.geopos(driverGeoKey(vehicleType), driverId);
  if (!pos) return null;
  const [lng, lat] = pos;
  if (lng === undefined || lat === undefined) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

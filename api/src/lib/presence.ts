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

import { redis, driverGeoKey } from "./redis";

export type NearbyDriver = { driverId: string; distanceM: number };

export async function setDriverPosition(
  driverId: string,
  vehicleType: string,
  lat: number,
  lng: number,
): Promise<void> {
  await redis.geoadd(driverGeoKey(vehicleType), lng, lat, driverId);
}

export async function clearDriverPosition(driverId: string, vehicleType: string): Promise<void> {
  await redis.zrem(driverGeoKey(vehicleType), driverId);
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

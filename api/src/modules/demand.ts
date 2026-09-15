/**
 * Where people are waiting now.
 *
 * A bendskin driver already knows the corridor better than any algorithm will.
 * What he cannot see from where he is parked is how many riders are standing at
 * Mile 17 right this minute, so that — and only that — is what this serves. It
 * never tells him where to go; it gives him the one fact he is missing and lets
 * him decide.
 *
 * Demand is read from trips that are still looking for a driver. Supply is read
 * from the Redis GEO set, which is the only place that knows where bikes are.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { redis, driverGeoKey } from "../lib/redis";
import { nearbyDriverIds } from "../lib/presence";
import { DEMAND_WINDOW_MINUTES, demandLevel, type DemandLevel } from "./demand-math";

export { DEMAND_WINDOW_MINUTES, demandLevel } from "./demand-math";
export type { DemandLevel } from "./demand-math";

export type ZoneDemand = {
  zone: string;
  name: string;
  /** "Checkpoint" — where in the zone people actually stand. */
  pickupPoint: string | null;
  waitingRiders: number;
  bikesNearby: number;
  level: DemandLevel;
};

export function demandRouter(): Router {
  const router = Router();

  /**
   * The board on the driver's home screen.
   *
   * Driver-only: it is a supply signal, and a rider who could see which zones
   * are short of bikes has been handed a reason to distrust the fixed fare.
   */
  router.get(
    "/zones",
    requireAuth("DRIVER", "ADMIN"),
    asyncHandler(async (req, res) => {
      const vehicleType = req.query.vehicleType === "CAR" ? "CAR" : "MOTO";
      const since = new Date(Date.now() - DEMAND_WINDOW_MINUTES * 60_000);

      const [zones, waiting] = await Promise.all([
        prisma.zone.findMany({
          orderBy: { name: "asc" },
          include: {
            landmarks: { where: { isPickupPoint: true }, orderBy: { name: "asc" }, take: 1 },
          },
        }),
        prisma.trip.groupBy({
          by: ["fromZoneId"],
          where: { status: { in: ["REQUESTED", "OFFERED"] }, requestedAt: { gte: since }, vehicleType },
          _count: { _all: true },
        }),
      ]);

      const waitingByZone = new Map(waiting.map((w) => [w.fromZoneId, w._count._all]));

      // One round trip for every zone's bike count. Fourteen zones, one pipeline.
      const pipeline = redis.pipeline();
      for (const zone of zones) {
        pipeline.geosearch(
          driverGeoKey(vehicleType),
          "FROMLONLAT",
          zone.centroidLng,
          zone.centroidLat,
          "BYRADIUS",
          env.DISPATCH_RADIUS_M,
          "m",
          "COUNT",
          200,
        );
      }
      const counts = await pipeline.exec();

      const board: ZoneDemand[] = zones.map((zone, i) => {
        const result = counts?.[i];
        // A Redis hiccup must not blank the screen; report no bikes and move on.
        const bikesNearby = result && !result[0] && Array.isArray(result[1]) ? result[1].length : 0;
        const waitingRiders = waitingByZone.get(zone.id) ?? 0;
        return {
          zone: zone.code,
          name: zone.name,
          pickupPoint: zone.landmarks[0]?.name ?? null,
          waitingRiders,
          bikesNearby,
          level: demandLevel(waitingRiders, bikesNearby),
        };
      });

      // Busiest first: the driver reads the top of this list and nothing else.
      board.sort((a, b) => b.waitingRiders - a.waitingRiders || a.name.localeCompare(b.name));

      res.json({ windowMinutes: DEMAND_WINDOW_MINUTES, zones: board });
    }),
  );

  /**
   * "7 near" on the rider's home screen.
   *
   * A count, never positions. Showing a rider exactly where each bike is parked
   * exposes drivers to being picked off directly and cuts us out of the trip
   * the safety features depend on.
   */
  router.get(
    "/nearby",
    asyncHandler(async (req, res) => {
      const { lat, lng, vehicleType } = z
        .object({
          lat: z.coerce.number(),
          lng: z.coerce.number(),
          vehicleType: z.enum(["MOTO", "CAR"]).default("MOTO"),
        })
        .parse(req.query);

      const nearby = await nearbyDriverIds({
        lat,
        lng,
        vehicleType,
        radiusM: env.DISPATCH_RADIUS_M,
        count: 50,
      });

      // Redis knows where they are; Postgres knows whether they may drive.
      const eligible = await prisma.driver.count({
        where: { id: { in: nearby.map((n) => n.driverId) }, status: "ACTIVE", online: true },
      });

      res.json({
        bikesNearby: eligible,
        radiusM: env.DISPATCH_RADIUS_M,
        nearestBikeM: nearby[0] ? Math.round(nearby[0].distanceM) : null,
      });
    }),
  );

  return router;
}

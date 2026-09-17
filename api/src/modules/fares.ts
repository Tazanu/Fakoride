/**
 * The fare service: reads the table, falls back to the formula for a pair nobody
 * has priced yet, and serves the destination list the home screen is built from.
 *
 * Fako Ride does not run a meter. A trip costs what the table says it costs for
 * that directed zone pair, and the rider sees that number before committing.
 * The arithmetic itself lives in ./fare-math so it can be tested without a
 * database and reused in the apps.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError, param } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { resolveZoneForPoint } from "./geo";
import { computeFormulaFare, isHillFare, roadKm, MIN_FARE_XAF, type FarePoint } from "./fare-math";

export * from "./fare-math";

export type Quote = {
  fromZoneCode: string;
  toZoneCode: string;
  vehicleType: "MOTO" | "CAR";
  priceXaf: number;
  mobilePriceXaf: number;
  hillFare: boolean;
  source: "FORMULA" | "FIELD";
};

/**
 * Look up the quoted price for a zone pair. The table is authoritative; the
 * formula is only a fallback for a pair nobody has priced yet.
 */
export async function quoteZonePair(opts: {
  fromZoneId: string;
  toZoneId: string;
  vehicleType?: "MOTO" | "CAR";
  mobileDiscountXaf: number;
}): Promise<Quote> {
  const vehicleType = opts.vehicleType ?? "CAR";

  if (opts.fromZoneId === opts.toZoneId) {
    throw new ApiError(400, "same_zone", "Pickup and drop-off are in the same zone.");
  }

  const [fromZone, toZone] = await Promise.all([
    prisma.zone.findUnique({ where: { id: opts.fromZoneId } }),
    prisma.zone.findUnique({ where: { id: opts.toZoneId } }),
  ]);
  if (!fromZone || !toZone) throw new ApiError(404, "zone_not_found", "Unknown zone.");

  const row = await prisma.fare.findUnique({
    where: {
      fromZoneId_toZoneId_vehicleType: {
        fromZoneId: opts.fromZoneId,
        toZoneId: opts.toZoneId,
        vehicleType,
      },
    },
  });

  const priceXaf = row?.priceXaf ?? computeFormulaFare(zonePoint(fromZone), zonePoint(toZone));

  return {
    fromZoneCode: fromZone.code,
    toZoneCode: toZone.code,
    vehicleType,
    priceXaf,
    mobilePriceXaf: Math.max(MIN_FARE_XAF, priceXaf - opts.mobileDiscountXaf),
    hillFare: isHillFare(zonePoint(fromZone), zonePoint(toZone)),
    source: row?.source ?? "FORMULA",
  };
}

function zonePoint(z: { centroidLat: number; centroidLng: number; elevationM: number }): FarePoint {
  return { lat: z.centroidLat, lng: z.centroidLng, elevationM: z.elevationM };
}

// --- routes ----------------------------------------------------------------

const quoteQuery = z.object({
  fromLat: z.coerce.number().optional(),
  fromLng: z.coerce.number().optional(),
  fromZone: z.string().optional(),
  toZone: z.string(),
  vehicleType: z.enum(["MOTO", "CAR"]).default("CAR"),
});

export function faresRouter(config: { mobileDiscountXaf: number }): Router {
  const router = Router();

  /** Every drop-off reachable from a zone, with its price. This is the home screen. */
  router.get(
    "/from/:zoneCode",
    asyncHandler(async (req, res) => {
      const zone = await prisma.zone.findUnique({ where: { code: param(req, "zoneCode") } });
      if (!zone) throw new ApiError(404, "zone_not_found", "Unknown zone.");

      const fares = await prisma.fare.findMany({
        where: { fromZoneId: zone.id, vehicleType: "CAR" },
        include: { toZone: true },
        orderBy: { priceXaf: "asc" },
      });

      res.json({
        from: { code: zone.code, name: zone.name },
        destinations: fares.map((f) => ({
          code: f.toZone.code,
          name: f.toZone.name,
          priceXaf: f.priceXaf,
          mobilePriceXaf: Math.max(MIN_FARE_XAF, f.priceXaf - config.mobileDiscountXaf),
          hillFare: isHillFare(zonePoint(zone), zonePoint(f.toZone)),
          distanceKm: Number(roadKm(zonePoint(zone), zonePoint(f.toZone)).toFixed(2)),
          source: f.source,
        })),
      });
    }),
  );

  /** A single quote, by zone codes or by a GPS point we resolve to a zone. */
  router.get(
    "/quote",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const q = quoteQuery.parse(req.query);

      let fromZoneId: string;
      if (q.fromZone) {
        const z = await prisma.zone.findUnique({ where: { code: q.fromZone } });
        if (!z) throw new ApiError(404, "zone_not_found", "Unknown pickup zone.");
        fromZoneId = z.id;
      } else if (q.fromLat !== undefined && q.fromLng !== undefined) {
        fromZoneId = (await resolveZoneForPoint(q.fromLat, q.fromLng)).id;
      } else {
        throw new ApiError(400, "missing_pickup", "Give either fromZone or fromLat/fromLng.");
      }

      const toZone = await prisma.zone.findUnique({ where: { code: q.toZone } });
      if (!toZone) throw new ApiError(404, "zone_not_found", "Unknown drop-off zone.");

      res.json(
        await quoteZonePair({
          fromZoneId,
          toZoneId: toZone.id,
          vehicleType: q.vehicleType,
          mobileDiscountXaf: config.mobileDiscountXaf,
        }),
      );
    }),
  );

  return router;
}

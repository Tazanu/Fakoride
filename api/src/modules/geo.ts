/**
 * Geography, Buea-style.
 *
 * A GPS fix is not an answer here — "4.1531, 9.2764" means nothing to a rider or
 * a bendskin driver. Every point is resolved to a zone and named with a landmark
 * people already use ("Checkpoint", "Malingo Junction").
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler } from "../lib/http";
import { haversineKm } from "./fare-math";

export type ResolvedZone = { id: string; code: string; name: string; centroidLat: number; centroidLng: number; elevationM: number };

/**
 * Point → zone. Uses a drawn boundary when one exists, and otherwise falls back
 * to the nearest centroid, which is accurate enough to launch one corridor and
 * gets better every time somebody traces a zone.
 */
export async function resolveZoneForPoint(lat: number, lng: number): Promise<ResolvedZone> {
  const contained = await prisma.$queryRaw<ResolvedZone[]>`
    SELECT id, code, name, "centroidLat", "centroidLng", "elevationM"
    FROM "Zone"
    WHERE boundary IS NOT NULL
      AND ST_Contains(boundary::geometry, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    LIMIT 1
  `;
  if (contained[0]) return contained[0];

  const zones = await prisma.zone.findMany({
    select: { id: true, code: true, name: true, centroidLat: true, centroidLng: true, elevationM: true },
  });
  if (zones.length === 0) throw new ApiError(503, "no_zones", "No zones are configured yet. Run the seed.");

  let best = zones[0]!;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const z of zones) {
    const km = haversineKm({ lat, lng }, { lat: z.centroidLat, lng: z.centroidLng });
    if (km < bestKm) {
      bestKm = km;
      best = z;
    }
  }
  return best;
}

/** The nearest named place to a point, so the app can say where someone is. */
export async function nearestLandmark(lat: number, lng: number) {
  const landmarks = await prisma.landmark.findMany({
    where: { isPickupPoint: true },
    include: { zone: { select: { code: true, name: true } } },
  });
  let best: (typeof landmarks)[number] | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const l of landmarks) {
    const km = haversineKm({ lat, lng }, { lat: l.lat, lng: l.lng });
    if (km < bestKm) {
      bestKm = km;
      best = l;
    }
  }
  return best ? { landmark: best, distanceKm: Number(bestKm.toFixed(3)) } : null;
}

const pointQuery = z.object({ lat: z.coerce.number(), lng: z.coerce.number() });

export function geoRouter(): Router {
  const router = Router();

  router.get(
    "/zones",
    asyncHandler(async (_req, res) => {
      const zones = await prisma.zone.findMany({
        orderBy: [{ town: "asc" }, { name: "asc" }],
        include: { landmarks: { orderBy: { name: "asc" } } },
      });
      res.json({
        zones: zones.map((z) => ({
          code: z.code,
          name: z.name,
          town: z.town,
          elevationM: z.elevationM,
          centroid: { lat: z.centroidLat, lng: z.centroidLng },
          landmarks: z.landmarks.map((l) => ({
            name: l.name,
            aliases: l.aliases,
            lat: l.lat,
            lng: l.lng,
            isPickupPoint: l.isPickupPoint,
          })),
        })),
      });
    }),
  );

  /** Where am I, in words a rider and a driver both use. */
  router.get(
    "/resolve",
    asyncHandler(async (req, res) => {
      const { lat, lng } = pointQuery.parse(req.query);
      const [zone, near] = await Promise.all([resolveZoneForPoint(lat, lng), nearestLandmark(lat, lng)]);
      res.json({
        zone: { code: zone.code, name: zone.name },
        label: near ? `${near.landmark.name}, ${zone.name}` : zone.name,
        nearestLandmark: near
          ? { name: near.landmark.name, distanceKm: near.distanceKm, lat: near.landmark.lat, lng: near.landmark.lng }
          : null,
      });
    }),
  );

  /** Landmark search. Matches the aliases too — "CP" has to find Checkpoint. */
  router.get(
    "/search",
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2) {
        res.json({ results: [] });
        return;
      }
      const results = await prisma.landmark.findMany({
        where: {
          OR: [{ name: { contains: q, mode: "insensitive" } }, { aliases: { has: q } }],
        },
        include: { zone: { select: { code: true, name: true } } },
        take: 15,
      });
      res.json({
        results: results.map((l) => ({
          name: l.name,
          zone: l.zone.code,
          zoneName: l.zone.name,
          lat: l.lat,
          lng: l.lng,
        })),
      });
    }),
  );

  /** The service-status banner both apps show at the top of the home screen. */
  router.get(
    "/notices",
    asyncHandler(async (_req, res) => {
      const now = new Date();
      const notices = await prisma.serviceNotice.findMany({
        where: {
          activeFrom: { lte: now },
          OR: [{ activeUntil: null }, { activeUntil: { gte: now } }],
        },
        include: { zone: { select: { code: true } } },
        orderBy: { activeFrom: "desc" },
      });
      res.json({
        notices: notices.map((n) => ({
          message: n.message,
          messageFr: n.messageFr,
          severity: n.severity,
          zone: n.zone?.code ?? null,
        })),
      });
    }),
  );

  return router;
}

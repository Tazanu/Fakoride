/**
 * Seeds the gazetteer and the fare table.
 *
 * Safe to re-run. The one rule it obeys absolutely: a fare row somebody has
 * corrected by hand (source = FIELD) is never overwritten by the formula.
 */

import { PrismaClient } from "@prisma/client";
import { ZONES, OBSERVED_FARES } from "../src/data/fako";
import { computeFormulaFare, roadKm } from "../src/modules/fare-math";

const prisma = new PrismaClient();

/**
 * A bendskin does not run an intercity route. Buea → Mutengene is a shared-taxi
 * trip and always has been, so it gets no moto fare until we launch cars.
 */
const MAX_MOTO_ROAD_KM = 8;

async function main(): Promise<void> {
  console.log("Seeding Fako zones and landmarks...");

  for (const z of ZONES) {
    const zone = await prisma.zone.upsert({
      where: { code: z.code },
      create: {
        code: z.code,
        name: z.name,
        town: z.town,
        centroidLat: z.lat,
        centroidLng: z.lng,
        elevationM: z.elevationM,
      },
      update: { name: z.name, town: z.town, centroidLat: z.lat, centroidLng: z.lng, elevationM: z.elevationM },
    });

    for (const l of z.landmarks) {
      await prisma.landmark.upsert({
        where: { zoneId_name: { zoneId: zone.id, name: l.name } },
        create: {
          zoneId: zone.id,
          name: l.name,
          aliases: l.aliases ?? [],
          lat: l.lat,
          lng: l.lng,
          isPickupPoint: l.isPickupPoint ?? true,
        },
        update: { aliases: l.aliases ?? [], lat: l.lat, lng: l.lng },
      });
    }
  }

  const zones = await prisma.zone.findMany();
  const byCode = new Map(zones.map((z) => [z.code, z]));
  console.log(`  ${zones.length} zones, ${await prisma.landmark.count()} landmarks`);

  console.log("Generating provisional moto fares...");
  let written = 0;
  let skippedFar = 0;
  let keptField = 0;

  for (const from of zones) {
    for (const to of zones) {
      if (from.id === to.id) continue;

      const km = roadKm(
        { lat: from.centroidLat, lng: from.centroidLng },
        { lat: to.centroidLat, lng: to.centroidLng },
      );
      if (km > MAX_MOTO_ROAD_KM) {
        skippedFar += 1;
        continue;
      }

      const existing = await prisma.fare.findUnique({
        where: { fromZoneId_toZoneId_vehicleType: { fromZoneId: from.id, toZoneId: to.id, vehicleType: "MOTO" } },
      });
      if (existing?.source === "FIELD") {
        keptField += 1;
        continue;
      }

      const priceXaf = computeFormulaFare(
        { lat: from.centroidLat, lng: from.centroidLng, elevationM: from.elevationM },
        { lat: to.centroidLat, lng: to.centroidLng, elevationM: to.elevationM },
      );

      await prisma.fare.upsert({
        where: { fromZoneId_toZoneId_vehicleType: { fromZoneId: from.id, toZoneId: to.id, vehicleType: "MOTO" } },
        create: { fromZoneId: from.id, toZoneId: to.id, vehicleType: "MOTO", priceXaf, source: "FORMULA" },
        update: { priceXaf, source: "FORMULA" },
      });
      written += 1;
    }
  }

  console.log(`  ${written} formula fares written, ${keptField} field-set fares left alone, ${skippedFar} pairs too far for a moto`);

  console.log("Applying observed corridor fares as FIELD rows...");
  for (const o of OBSERVED_FARES) {
    const from = byCode.get(o.from);
    const to = byCode.get(o.to);
    if (!from || !to) {
      console.warn(`  ! unknown zone in OBSERVED_FARES: ${o.from} -> ${o.to}`);
      continue;
    }
    await prisma.fare.upsert({
      where: { fromZoneId_toZoneId_vehicleType: { fromZoneId: from.id, toZoneId: to.id, vehicleType: "MOTO" } },
      create: {
        fromZoneId: from.id,
        toZoneId: to.id,
        vehicleType: "MOTO",
        priceXaf: o.xaf,
        source: "FIELD",
        note: "Quoted on the corridor — confirm during field work",
      },
      update: { priceXaf: o.xaf, source: "FIELD", note: "Quoted on the corridor — confirm during field work" },
    });
    console.log(`  ${o.from} -> ${o.to}: ${o.xaf} XAF`);
  }

  console.log("\nDone. Every FORMULA fare is provisional — walk the corridor and correct them.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

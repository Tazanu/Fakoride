/**
 * The fare formula is the one piece of pricing logic in the product, so it is
 * pinned to the fares people actually quote on the Molyko corridor. If a change
 * here breaks these, the change is wrong until somebody re-walks the corridor.
 */

import { describe, expect, it } from "vitest";
import {
  computeFormulaFare,
  haversineKm,
  isHillFare,
  roundToNearest,
  MIN_FARE_XAF,
  FARE_ROUNDING_XAF,
} from "../src/modules/fare-math";
import { ZONES, OBSERVED_FARES } from "../src/data/fako";

const zone = (code: string) => {
  const z = ZONES.find((x) => x.code === code);
  if (!z) throw new Error(`no such zone in the gazetteer: ${code}`);
  return { lat: z.lat, lng: z.lng, elevationM: z.elevationM };
};

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 4.1552, lng: 9.274 }, { lat: 4.1552, lng: 9.274 })).toBe(0);
  });

  it("puts Checkpoint about a kilometre from the UB gate", () => {
    const km = haversineKm(zone("CHECKPOINT"), zone("UB"));
    expect(km).toBeGreaterThan(0.8);
    expect(km).toBeLessThan(1.3);
  });
});

describe("computeFormulaFare", () => {
  it.each(OBSERVED_FARES)("reproduces the quoted fare for $from -> $to", ({ from, to, xaf }) => {
    expect(computeFormulaFare(zone(from), zone(to))).toBe(xaf);
  });

  it("never quotes below the floor", () => {
    // Adjacent zones a few hundred metres apart on flat ground.
    expect(computeFormulaFare(zone("MOLYKO"), zone("MALINGO"))).toBe(MIN_FARE_XAF);
  });

  it("always lands on a price a rider can hand over", () => {
    for (const from of ZONES.slice(0, 6)) {
      for (const to of ZONES.slice(0, 6)) {
        if (from.code === to.code) continue;
        const fare = computeFormulaFare(zone(from.code), zone(to.code));
        expect(fare % FARE_ROUNDING_XAF).toBe(0);
      }
    }
  });

  it("charges more uphill than downhill on the same road", () => {
    const up = computeFormulaFare(zone("MOLYKO"), zone("BOKWAONGO"));
    const down = computeFormulaFare(zone("BOKWAONGO"), zone("MOLYKO"));
    expect(up).toBeGreaterThan(down);
  });
});

describe("isHillFare", () => {
  it("flags a real climb", () => {
    expect(isHillFare(zone("MOLYKO"), zone("GREAT_SOPPO"))).toBe(true);
  });

  it("does not flag the flat run to Checkpoint", () => {
    expect(isHillFare(zone("MOLYKO"), zone("CHECKPOINT"))).toBe(false);
  });
});

describe("roundToNearest", () => {
  it("rounds to the nearest step", () => {
    expect(roundToNearest(237, 50)).toBe(250);
    expect(roundToNearest(224, 50)).toBe(200);
  });
});

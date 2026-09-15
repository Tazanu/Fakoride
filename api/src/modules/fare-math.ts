/**
 * Fare arithmetic, with no dependencies on anything.
 *
 * Kept separate from the fare service so the one piece of pricing logic in the
 * product can be tested without a database, and so it can be lifted into the
 * apps later to show a price before the network answers.
 *
 * The constants are calibrated against fares quoted on the Molyko corridor
 * today (see OBSERVED_FARES in ../data/fako). They are a starting shape for the
 * table, not a truth — a row a human has corrected is never recomputed.
 */

/** Flat pickup component, XAF. */
export const BASE_XAF = 120;
/** Per kilometre of road travelled, XAF. */
export const PER_KM_XAF = 60;
/** Per 100 m climbed. Descending the same road is not discounted, only un-charged. */
export const PER_100M_CLIMB_XAF = 80;
/** Straight-line distance understates road distance on the mountain. */
export const ROAD_FACTOR = 1.15;
/** Nobody quotes a bendskin below this. */
export const MIN_FARE_XAF = 200;
/** Riders think in 50s. A 237 XAF fare is not a real price. */
export const FARE_ROUNDING_XAF = 50;
/** A climb of this much or more is worth telling the rider about. */
export const HILL_FARE_CLIMB_M = 100;

export type LatLng = { lat: number; lng: number };
export type FarePoint = LatLng & { elevationM: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Road distance estimate in km, until OSRM is wired in. */
export function roadKm(from: LatLng, to: LatLng): number {
  return haversineKm(from, to) * ROAD_FACTOR;
}

/**
 * The seed formula. Directed: climbing is charged, descending is not credited,
 * because that is how Buea has always priced the mountain.
 */
export function computeFormulaFare(from: FarePoint, to: FarePoint): number {
  const climbM = Math.max(0, to.elevationM - from.elevationM);
  const raw = BASE_XAF + PER_KM_XAF * roadKm(from, to) + PER_100M_CLIMB_XAF * (climbM / 100);
  return Math.max(MIN_FARE_XAF, roundToNearest(raw, FARE_ROUNDING_XAF));
}

/** True when the rider should be told this is a hill fare rather than a long one. */
export function isHillFare(from: FarePoint, to: FarePoint): boolean {
  return to.elevationM - from.elevationM >= HILL_FARE_CLIMB_M;
}

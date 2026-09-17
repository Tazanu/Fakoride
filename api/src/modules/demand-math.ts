/**
 * How a zone gets labelled on the driver's demand board.
 *
 * Kept apart from the demand service for the same reason as fare-math: it is a
 * judgement that has to be argued with and tested, and it should not need a
 * database and a Redis to do either.
 */

export type DemandLevel = "QUIET" | "STEADY" | "BUSY";

/**
 * How far back a request still counts as somebody waiting.
 *
 * Long enough to survive a driver glancing at the screen between trips, short
 * enough that it never sends him across town after a rider who already left.
 */
export const DEMAND_WINDOW_MINUTES = 15;

/** More than three riders for every two bikes is the point of riding over. */
const BUSY_RIDERS_PER_DRIVER = 1.5;
/** Below one rider per two bikes, the zone is already served. */
const STEADY_RIDERS_PER_DRIVER = 0.5;

/**
 * Deliberately a ratio rather than a raw count.
 *
 * Twelve riders waiting in Molyko is not busy if thirty bikes are already
 * sitting there, and two riders in Bokwaongo with no bike in sight is the best
 * fare on the mountain. A driver reading a raw count rides toward the crowd and
 * finds it already served — which teaches him to stop reading the board.
 */
export function demandLevel(waitingRiders: number, driversNearby: number): DemandLevel {
  if (waitingRiders <= 0) return "QUIET";
  const ridersPerDriver = waitingRiders / Math.max(driversNearby, 1);
  if (ridersPerDriver >= BUSY_RIDERS_PER_DRIVER) return "BUSY";
  if (ridersPerDriver >= STEADY_RIDERS_PER_DRIVER) return "STEADY";
  return "QUIET";
}

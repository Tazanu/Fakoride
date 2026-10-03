import Redis from "ioredis";
import { env } from "../env";

/**
 * Redis holds the two things that must be fast and may be lost without harm:
 * where each driver currently is, and which offer is on the clock.
 * Anything that must survive a restart lives in Postgres.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: false,
});

/** GEO set of online drivers, one per vehicle type. */
export const driverGeoKey = (vehicleType: string) => `drivers:online:${vehicleType}`;

/** Set while a trip is sitting with one driver awaiting accept. */
export const offerKey = (tripId: string) => `trip:${tripId}:offer`;

/**
 * The trip a driver is currently carrying.
 *
 * Kept here so a position ping — which arrives every few seconds, per driver —
 * can find the trip room to broadcast into without touching Postgres. Losing it
 * costs one stale map until the next state change writes it again.
 */
export const driverActiveTripKey = (driverId: string) => `driver:${driverId}:trip`;

/** OTP codes, hashed, short-lived. */
export const otpKey = (phone: string) => `otp:${phone}`;

/**
 * The offer a driver is holding, by driver rather than by trip.
 *
 * The socket event is gone the moment it is sent. A driver whose phone was in
 * his pocket taps the notification, the app opens, and it needs a way to ask
 * "what was I just offered" — this is what answers.
 */
export const driverOfferKey = (driverId: string) => `driver:${driverId}:offer`;

/** Rate limit bucket for OTP requests per phone. */
export const otpThrottleKey = (phone: string) => `otp:throttle:${phone}`;
/** Wrong guesses at the code currently issued to this number. Dies with the code. */
export const otpAttemptsKey = (phone: string) => `otp:attempts:${phone}`;

/** This process, among however many are running. Only for telling them apart. */
const INSTANCE = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Whether this instance should run a periodic job this time round.
 *
 * Every API instance runs the same timers — the dispatch sweep, the payment
 * reconciler, the daily-fee collection. With one instance that is fine; with
 * two, both would move the same expired offer on and chase the same payment.
 * So each tick takes a short lock first, and only the instance that gets it
 * does the work. The lock outlives nothing: it expires a little before the next
 * tick, so a crashed instance hands the job over within one interval.
 *
 * It also stops one instance overlapping itself when a run takes longer than
 * its interval, which a bare setInterval allows.
 *
 * If Redis cannot be asked the tick is skipped: running jobs blind across
 * instances is worse than running them a few seconds late.
 */
export async function takeTick(job: string, holdMs: number): Promise<boolean> {
  try {
    return (await redis.set(`jobs:${job}`, INSTANCE, "PX", Math.max(100, holdMs), "NX")) === "OK";
  } catch {
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}

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

/** Rate limit bucket for OTP requests per phone. */
export const otpThrottleKey = (phone: string) => `otp:throttle:${phone}`;
/** Wrong guesses at the code currently issued to this number. Dies with the code. */
export const otpAttemptsKey = (phone: string) => `otp:attempts:${phone}`;

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}

/**
 * How often anybody may ask for anything.
 *
 * The only limit there used to be was five sign-in codes an hour per number.
 * Nothing stopped one machine asking for codes for a thousand different
 * numbers — every one an SMS we pay for — or flooding any endpoint at all.
 *
 * Counted in Redis, which the API already runs, so the count is shared across
 * every instance and survives none of them restarting. A fixed window per rule:
 * simple, one INCR per request, and good enough for "stop the flood", which is
 * the job. No new dependency.
 *
 * Who is counted:
 *   a signed-in request    by account — one driver's phone is one driver, and
 *                          a hundred students on one campus Wi-Fi are a hundred
 *   anything else          by address
 *
 * Addresses are shared here more than almost anywhere: mobile networks put
 * whole neighbourhoods behind one address, and a launch day at the university
 * puts hundreds of sign-ups on one Wi-Fi. So the per-address limits are loose,
 * and RATE_LIMIT_MULTIPLIER scales every limit at once for a day like that
 * without a code change.
 *
 * If Redis cannot be asked, the request goes through. A limiter that takes the
 * API down with it is worse than no limiter.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../env";
import { ApiError } from "../lib/http";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";
import { verifyToken } from "./auth";

type Rule = {
  /** Part of the Redis key, and what the log says was hit. */
  name: string;
  windowSeconds: number;
  max: number;
  /** "identity" is the account when signed in, else the address. */
  by: "identity" | "address";
};

export const RULES = {
  /** Everything, from anybody. Five a second, sustained, is far beyond any person. */
  everything: { name: "all", windowSeconds: 60, max: 300, by: "identity" },
  /** Each one is an SMS we pay for. The per-number limit is separate and tighter. */
  codeRequests: { name: "otp-request", windowSeconds: 3600, max: 60, by: "address" },
  /** Five guesses per code already; this stops one machine guessing across many numbers. */
  codeGuesses: { name: "otp-verify", windowSeconds: 3600, max: 150, by: "address" },
  bookings: { name: "book", windowSeconds: 3600, max: 30, by: "identity" },
  complaints: { name: "complaint", windowSeconds: 3600, max: 10, by: "identity" },
  shareLinks: { name: "share", windowSeconds: 3600, max: 30, by: "identity" },
  uploads: { name: "upload", windowSeconds: 3600, max: 60, by: "identity" },
} satisfies Record<string, Rule>;

/** The account behind a request, if its token is good; otherwise its address. */
function whoIs(req: Request, by: Rule["by"]): string {
  if (by === "identity") {
    if (req.user?.sub) return `u:${req.user.sub}`;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        return `u:${verifyToken(header.slice(7)).sub}`;
      } catch {
        // A bad token is counted by address, and refused further on anyway.
      }
    }
  }
  return `ip:${req.ip ?? "unknown"}`;
}

export function rateLimit(rule: Rule): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `rl:${rule.name}:${whoIs(req, rule.by)}:${windowStart}`;
    const max = Math.max(1, Math.round(rule.max * env.RATE_LIMIT_MULTIPLIER));

    redis
      .multi()
      .incr(key)
      .expire(key, rule.windowSeconds + 5)
      .exec()
      .then(
        (result) => {
          const count = Number(result?.[0]?.[1] ?? 0);
          if (count <= max) {
            next();
            return;
          }
          const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
          res.setHeader("retry-after", String(retryAfter));
          if (count === max + 1) {
            logger.warn({ rule: rule.name, who: whoIs(req, rule.by), max }, "rate limit reached");
          }
          next(new ApiError(429, "rate_limited", "Too many requests. Wait a little and try again."));
        },
        (err: unknown) => {
          logger.warn({ rule: rule.name, err: String(err) }, "rate limit: Redis unavailable — allowing");
          next();
        },
      );
  };
}

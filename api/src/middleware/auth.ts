/**
 * Who is calling, and whether that session still exists.
 *
 * A token is a signed claim that lives thirty days. Signing it is not enough on
 * its own: for a long time "sign out" only deleted the token from the phone,
 * and a copy of it — from a stolen phone, a shared one, a log — kept working
 * for the rest of the month. So every token now carries an id, and a session
 * can be ended from the server:
 *
 *   one token   signing out records its id as revoked until the moment it
 *               would have expired anyway
 *   every token "sign out on every phone" records a cut-off for the account;
 *               any token issued before it is refused
 *
 * Both live in Redis with a TTL no longer than a token's life, so the record
 * cleans itself up. If Redis cannot be asked, the token is allowed: a blip in
 * Redis must not sign out every driver on the road mid-shift. Revocation is a
 * second lock, not the only one.
 */

import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { ApiError } from "../lib/http";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";

export type TokenClaims = {
  sub: string;
  role: "RIDER" | "DRIVER" | "ADMIN";
  phone: string;
  /** The session's id. Absent only on tokens issued before sessions could end. */
  jti?: string;
  iat?: number;
  /**
   * When it was issued, to the millisecond. `iat` is whole seconds, and a token
   * issued in the same second as a "sign out everywhere" would slip past it.
   */
  iat_ms?: number;
  exp?: number;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenClaims;
    }
  }
}

/**
 * How long a token lives, in seconds, read the way jsonwebtoken reads JWT_TTL
 * ("30d", "12h", 3600) — by signing a throwaway token and measuring it.
 */
const TOKEN_LIFETIME_S = (() => {
  const t = jwt.decode(jwt.sign({}, "measure", { expiresIn: env.JWT_TTL } as jwt.SignOptions)) as { iat: number; exp: number };
  return t.exp - t.iat;
})();

const revokedSessionKey = (jti: string) => `session:revoked:${jti}`;
const signedOutBeforeKey = (userId: string) => `session:before:${userId}`;

export function signToken(claims: Pick<TokenClaims, "sub" | "role" | "phone">): string {
  return jwt.sign({ ...claims, iat_ms: Date.now() }, env.JWT_SECRET, {
    expiresIn: env.JWT_TTL,
    jwtid: randomBytes(16).toString("base64url"),
  } as jwt.SignOptions);
}

/** Signature and expiry only. Whether the session was ended is `assertLive`. */
export function verifyToken(token: string): TokenClaims {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenClaims;
  } catch {
    throw new ApiError(401, "invalid_token", "Sign in again.");
  }
}

/** Throws if this session was signed out, on its own or with every other. */
export async function assertLive(claims: TokenClaims): Promise<void> {
  let revoked: string | null | undefined = null;
  let before: string | null | undefined = null;
  try {
    [revoked, before] = await redis.mget(
      claims.jti ? revokedSessionKey(claims.jti) : "session:none",
      signedOutBeforeKey(claims.sub),
    );
  } catch (err) {
    logger.warn({ err: String(err) }, "auth: could not check revocation — allowing");
    return;
  }
  if (revoked) throw new ApiError(401, "signed_out", "Sign in again.");
  // Everything issued before the cut-off, to the millisecond. The fresh token
  // "sign out everywhere" hands back is signed after it, and survives.
  const issuedMs = claims.iat_ms ?? (claims.iat ?? 0) * 1000;
  if (before && issuedMs < Number(before)) throw new ApiError(401, "signed_out", "Sign in again.");
}

/** End this one session. Kept only until the token would have expired anyway. */
export async function revokeSession(claims: TokenClaims): Promise<void> {
  if (!claims.jti) return;
  const secondsLeft = Math.max(1, (claims.exp ?? 0) - Math.floor(Date.now() / 1000));
  await redis.set(revokedSessionKey(claims.jti), "1", "EX", secondsLeft);
}

/**
 * End every session this account has, as of now. Returns the cut-off, in ms.
 *
 * Kept for the longest a token can live; after that every token issued before
 * the cut-off has expired by itself and the record has nothing left to do.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const now = Date.now();
  await redis.set(signedOutBeforeKey(userId), String(now), "EX", TOKEN_LIFETIME_S + 60);
  return now;
}

export function requireAuth(...roles: TokenClaims["role"][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new ApiError(401, "not_signed_in", "Sign in to continue."));
      return;
    }
    let claims: TokenClaims;
    try {
      claims = verifyToken(header.slice(7));
    } catch (err) {
      next(err);
      return;
    }
    if (roles.length > 0 && !roles.includes(claims.role)) {
      next(new ApiError(403, "wrong_role", "This account cannot do that."));
      return;
    }
    assertLive(claims).then(() => {
      req.user = claims;
      next();
    }, next);
  };
}

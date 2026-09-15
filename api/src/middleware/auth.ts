import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { ApiError } from "../lib/http";

export type TokenClaims = {
  sub: string;
  role: "RIDER" | "DRIVER" | "ADMIN";
  phone: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenClaims;
    }
  }
}

export function signToken(claims: TokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: env.JWT_TTL } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenClaims {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenClaims;
  } catch {
    throw new ApiError(401, "invalid_token", "Sign in again.");
  }
}

export function requireAuth(...roles: TokenClaims["role"][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new ApiError(401, "not_signed_in", "Sign in to continue."));
      return;
    }
    try {
      const claims = verifyToken(header.slice(7));
      if (roles.length > 0 && !roles.includes(claims.role)) {
        next(new ApiError(403, "wrong_role", "This account cannot do that."));
        return;
      }
      req.user = claims;
      next();
    } catch (err) {
      next(err);
    }
  };
}

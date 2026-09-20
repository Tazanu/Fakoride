/**
 * Phone-number sign-in.
 *
 * Email does not identify anyone in this market and a password is one more thing
 * to lose, so the only login is a phone number plus a code by SMS.
 *
 * The SMS provider is deliberately behind a port. Local Cameroonian aggregators
 * have to be priced per message before we commit to one — it is a recurring cost
 * on every signup — so until then the "console" sender prints the code to logs.
 */

import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import { redis, otpKey, otpThrottleKey } from "../lib/redis";
import { ApiError, asyncHandler } from "../lib/http";
import { normalisePhone as parsePhone } from "../lib/phone";
import { signToken, requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_PER_HOUR = 5;

export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

class ConsoleSmsSender implements SmsSender {
  async send(to: string, message: string): Promise<void> {
    logger.info({ to, message }, "SMS (console sender — no message was actually sent)");
  }
}

class LocalAggregatorSmsSender implements SmsSender {
  async send(_to: string, _message: string): Promise<void> {
    // TODO: wire the chosen Cameroonian aggregator here once one is priced.
    // Keep the interface: one call, one message, throw on failure.
    throw new ApiError(503, "sms_unavailable", "SMS provider is not configured yet.");
  }
}

export const smsSender: SmsSender =
  env.SMS_PROVIDER === "console" ? new ConsoleSmsSender() : new LocalAggregatorSmsSender();

/**
 * Whether /otp/request hands the code straight back to the caller.
 *
 * Only when nothing is sending it anywhere: the console sender is selected AND
 * we are in development. Both conditions, because either one alone is a way to
 * ship an OTP oracle by accident — a staging box left on the console sender, or
 * a developer who points a real aggregator at NODE_ENV=development.
 *
 * It exists because the alternative is worse in practice. Without it the only
 * way to sign in on a handset is to read the API's own log, which means the
 * phone in your hand is useless unless you can also see the laptop — and the
 * temptation then is to weaken the real thing to make testing bearable.
 */
const revealsCode = env.NODE_ENV === "development" && env.SMS_PROVIDER === "console";

if (revealsCode) {
  logger.warn("auth: /otp/request returns the code in its response (development, console sender)");
}

/**
 * Cameroon numbers, normalised to E.164.
 *
 * The parsing lives in lib/phone so the ops scripts can reuse it without
 * importing this module and opening a Redis connection; this wrapper only turns
 * its error into the shape the API answers with.
 */
export function normalisePhone(input: string): string {
  try {
    return parsePhone(input);
  } catch {
    throw new ApiError(400, "bad_phone", "Enter a Cameroon number, for example 6 70 00 00 00.");
  }
}

const hashCode = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

function generateCode(): string {
  // Six digits, uniform, no leading-zero bias.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

const requestSchema = z.object({ phone: z.string().min(6) });
const verifySchema = z.object({
  phone: z.string().min(6),
  code: z.string().regex(/^\d{6}$/, "The code is six digits."),
  name: z.string().trim().min(2).max(60).optional(),
  role: z.enum(["RIDER", "DRIVER"]).default("RIDER"),
});

export function authRouter(): Router {
  const router = Router();

  router.post(
    "/otp/request",
    asyncHandler(async (req, res) => {
      const phone = normalisePhone(requestSchema.parse(req.body).phone);

      const attempts = await redis.incr(otpThrottleKey(phone));
      if (attempts === 1) await redis.expire(otpThrottleKey(phone), 3600);
      if (attempts > OTP_MAX_PER_HOUR) {
        throw new ApiError(429, "too_many_codes", "Too many codes requested. Try again in an hour.");
      }

      const code = generateCode();
      await redis.set(otpKey(phone), hashCode(code), "EX", OTP_TTL_SECONDS);
      await smsSender.send(phone, `${code} is your Fako Ride code. It expires in 5 minutes.`);

      // `devCode` is absent in every configuration but the local one — see
      // revealsCode above. The client treats it as optional for that reason.
      res.json({
        sent: true,
        expiresInSeconds: OTP_TTL_SECONDS,
        ...(revealsCode ? { devCode: code } : {}),
      });
    }),
  );

  router.post(
    "/otp/verify",
    asyncHandler(async (req, res) => {
      const body = verifySchema.parse(req.body);
      const phone = normalisePhone(body.phone);

      const stored = await redis.get(otpKey(phone));
      if (!stored) throw new ApiError(400, "code_expired", "That code has expired. Ask for a new one.");

      const supplied = hashCode(body.code);
      const ok =
        stored.length === supplied.length &&
        crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
      if (!ok) throw new ApiError(400, "wrong_code", "That code is not right.");

      await redis.del(otpKey(phone), otpThrottleKey(phone));

      const user = await prisma.user.upsert({
        where: { phone },
        create: { phone, name: body.name ?? null, role: body.role },
        update: body.name ? { name: body.name } : {},
        // The same columns /auth/me returns. Two endpoints answering with the
        // same `Me` shape is the whole point — a client that signs in and then
        // reads a field only one of them sends gets undefined at runtime while
        // the types say otherwise.
        include: {
          driver: {
            select: {
              id: true,
              status: true,
              vehicleType: true,
              plate: true,
              online: true,
              rating: true,
              tripCount: true,
            },
          },
        },
      });

      res.json({
        token: signToken({ sub: user.id, role: user.role, phone: user.phone }),
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: user.role,
          language: user.language,
          driver: user.driver ?? null,
        },
      });
    }),
  );

  router.get(
    "/me",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        include: { driver: true },
      });
      if (!user) throw new ApiError(404, "no_account", "This account no longer exists.");
      res.json({
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        language: user.language,
        driver: user.driver
          ? {
              id: user.driver.id,
              status: user.driver.status,
              vehicleType: user.driver.vehicleType,
              plate: user.driver.plate,
              online: user.driver.online,
              rating: user.driver.rating,
              tripCount: user.driver.tripCount,
            }
          : null,
      });
    }),
  );

  return router;
}

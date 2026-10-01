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
import { redis, otpAttemptsKey, otpKey, otpThrottleKey } from "../lib/redis";
import { ApiError, asyncHandler } from "../lib/http";
import { normalisePhone as parsePhone } from "../lib/phone";
import { requireAuth, revokeAllSessions, revokeSession, signToken } from "../middleware/auth";
import { endAllSessions, endSession } from "../realtime";
import { rateLimit, RULES } from "../middleware/rateLimit";
import { logger } from "../lib/logger";
import { smsSender } from "../lib/sms";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_PER_HOUR = 5;
/**
 * Wrong answers allowed against one code before it is thrown away.
 *
 * Without this the only limit was on *asking* for codes. Answering was free:
 * a million six-digit codes, five minutes each, and nothing counting the
 * misses — at a hundred guesses a second somebody gets into a chosen account
 * within about a day, and the ops console signs in the same way. Five misses
 * and the code is gone; with five codes an hour that is twenty-five guesses an
 * hour at a million-to-one, which is a lock rather than a speed bump.
 */
const OTP_MAX_WRONG = 5;

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
    rateLimit(RULES.codeRequests),
    asyncHandler(async (req, res) => {
      const phone = normalisePhone(requestSchema.parse(req.body).phone);

      const attempts = await redis.incr(otpThrottleKey(phone));
      if (attempts === 1) await redis.expire(otpThrottleKey(phone), 3600);
      if (attempts > OTP_MAX_PER_HOUR) {
        throw new ApiError(429, "too_many_codes", "Too many codes requested. Try again in an hour.");
      }

      const code = generateCode();
      // A new code starts with a clean count; the old one's misses die with it.
      await redis
        .multi()
        .set(otpKey(phone), hashCode(code), "EX", OTP_TTL_SECONDS)
        .del(otpAttemptsKey(phone))
        .exec();
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
    rateLimit(RULES.codeGuesses),
    asyncHandler(async (req, res) => {
      const body = verifySchema.parse(req.body);
      const phone = normalisePhone(body.phone);

      const stored = await redis.get(otpKey(phone));
      if (!stored) throw new ApiError(400, "code_expired", "That code has expired. Ask for a new one.");

      // Every attempt takes a number before anything is compared — the right
      // code included. Counting only the misses would let a burst of guesses
      // sent at once all get past the check above before the first miss burned
      // the code, and the right one among them would sign in. Numbered first,
      // only the first OTP_MAX_WRONG attempts at a code are ever looked at.
      const counted = await redis
        .multi()
        .incr(otpAttemptsKey(phone))
        .expire(otpAttemptsKey(phone), OTP_TTL_SECONDS)
        .exec();
      const attempt = Number(counted?.[0]?.[1] ?? 0);
      if (attempt > OTP_MAX_WRONG) {
        await redis.del(otpKey(phone));
        throw new ApiError(429, "too_many_attempts", "Too many wrong codes. Ask for a new one.");
      }

      const supplied = hashCode(body.code);
      const ok =
        stored.length === supplied.length &&
        crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
      if (!ok) {
        if (attempt >= OTP_MAX_WRONG) {
          await redis.del(otpKey(phone));
          logger.warn({ phone }, "auth: code burned after too many wrong guesses");
          throw new ApiError(429, "too_many_attempts", "Too many wrong codes. Ask for a new one.");
        }
        throw new ApiError(400, "wrong_code", "That code is not right.");
      }

      await redis.del(otpKey(phone), otpThrottleKey(phone), otpAttemptsKey(phone));

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
          // Whether one exists, never where it is. The bytes come from /me/photo.
          hasPhoto: user.photoAt !== null,
          driver: user.driver ?? null,
        },
      });
    }),
  );

  /**
   * Sign out on this phone, and mean it.
   *
   * The session is ended on the server, so a copy of this token anywhere else
   * stops working too, and any live connection it opened is closed. The phone
   * says which push token it holds: only that one is forgotten, so signing out
   * on an old phone does not silence the new one.
   */
  router.post(
    "/sign-out",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const { pushToken } = z.object({ pushToken: z.string().optional() }).parse(req.body ?? {});
      await revokeSession(req.user!);
      if (pushToken) {
        await prisma.user.updateMany({
          where: { id: req.user!.sub, pushToken },
          data: { pushToken: null, pushTokenAt: null },
        });
      }
      if (req.user!.jti) endSession(req.user!.jti);
      res.status(204).end();
    }),
  );

  /**
   * Sign out on every phone — for the one that was stolen, or left signed in.
   *
   * Every session this account has ends now, every live connection closes, and
   * whichever phone holds the push registration loses it. The phone asking is
   * handed a fresh session in the same breath, so the owner is not made to pay
   * for another SMS code to recover from somebody else's theft.
   */
  router.post(
    "/sign-out-everywhere",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const userId = req.user!.sub;
      await revokeAllSessions(userId);
      const user = await prisma.user.update({
        where: { id: userId },
        data: { pushToken: null, pushTokenAt: null },
        select: { id: true, role: true, phone: true },
      });
      endAllSessions(userId);
      logger.info({ userId }, "auth: every session ended at the owner's request");
      // The role as it is now, not as the old token remembered it.
      res.json({ token: signToken({ sub: user.id, role: user.role, phone: user.phone }) });
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
        hasPhoto: user.photoAt !== null,
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

/**
 * Trusted contacts: the people told when somebody presses Get help.
 *
 * The alarm already reaches ops, who call. But the first person a rider in
 * trouble wants to know is not an operator in an office — it is her mother,
 * her brother, the friend she was going to meet. Up to three of them, saved in
 * advance, each sent one text the moment she presses Get help: what happened,
 * the taxi's plate, and a link to follow the ride live.
 *
 * The link is an ordinary share link — the same page "Share trip" opens, with
 * the same nothing on it: no PIN, no phone numbers, the driver's first name and
 * plate. It expires like any other.
 *
 * Once per ride. Pressing the button again — which a frightened person will —
 * raises the alarm again for ops but does not text the same people twice.
 *
 * The words use only the GSM-7 alphabet. A text with one character outside it
 * (ê, ô, â…) is billed as UCS-2 at 70 characters a segment instead of 160, which
 * would make every French alarm cost two or three times an English one.
 */

import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler, param } from "../lib/http";
import { logger } from "../lib/logger";
import { smsSender } from "../lib/sms";
import { requireAuth } from "../middleware/auth";
import { normalisePhone } from "./auth";
import { SHARE_TTL_HOURS } from "./share";

export const MAX_TRUSTED_CONTACTS = 3;

/** The text a trusted contact receives. Pure, so its alphabet can be tested. */
export function contactAlertText(language: string, who: string, plate: string | null, link: string): string {
  if (language === "fr") {
    return plate
      ? `${who} a appuyé sur Aide dans Fako Ride pendant une course (taxi ${plate}). Suivez en direct : ${link}`
      : `${who} a appuyé sur Aide dans Fako Ride en attendant un taxi. Suivez en direct : ${link}`;
  }
  return plate
    ? `${who} pressed Get help in Fako Ride during a ride (taxi ${plate}). Follow it live: ${link}`
    : `${who} pressed Get help in Fako Ride while waiting for a taxi. Follow it live: ${link}`;
}

/**
 * Text this account's trusted contacts about this trip, once.
 *
 * Returns how many were told. Never throws and never waits on the SMS provider
 * to answer: the alarm to ops must not be held up by a slow aggregator, and a
 * failed text is logged, not shown to somebody who is already frightened.
 */
export async function alertTrustedContacts(opts: {
  userId: string;
  tripId: string;
  plate: string | null;
  firstAlert: boolean;
}): Promise<number> {
  if (!opts.firstAlert) return 0;

  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { name: true, phone: true, language: true, trustedContacts: { select: { phone: true } } },
  });
  if (!user || user.trustedContacts.length === 0) return 0;

  // A share link of its own, so they can be told apart from any she sent by
  // hand, and so revoking hers does not cut them off.
  const share = await prisma.tripShare.create({
    data: {
      tripId: opts.tripId,
      token: crypto.randomBytes(16).toString("base64url"),
      sharedWithLabel: "Trusted contacts",
      expiresAt: new Date(Date.now() + SHARE_TTL_HOURS * 3_600_000),
    },
  });
  const link = `${env.PUBLIC_API_URL.replace(/\/+$/, "")}/share/${share.token}`;
  const text = contactAlertText(user.language, user.name ?? user.phone, opts.plate, link);

  for (const contact of user.trustedContacts) {
    void smsSender.send(contact.phone, text).catch((err: unknown) =>
      logger.error({ userId: opts.userId, tripId: opts.tripId, err: String(err) }, "contacts: could not text a trusted contact"),
    );
  }
  return user.trustedContacts.length;
}

const addSchema = z.object({
  name: z.string().trim().min(1).max(40),
  phone: z.string().min(6).max(20),
});

/** Mounted at /me/contacts. */
export function trustedContactsRouter(): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const contacts = await prisma.trustedContact.findMany({
        where: { userId: req.user!.sub },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, phone: true },
      });
      res.json({ contacts, max: MAX_TRUSTED_CONTACTS });
    }),
  );

  router.post(
    "/",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const body = addSchema.parse(req.body);
      const phone = normalisePhone(body.phone);
      if (phone === req.user!.phone) {
        throw new ApiError(400, "own_number", "That is your own number.");
      }

      const held = await prisma.trustedContact.findMany({ where: { userId: req.user!.sub }, select: { phone: true } });
      if (held.some((c) => c.phone === phone)) {
        throw new ApiError(409, "already_a_contact", "That number is already one of your contacts.");
      }
      if (held.length >= MAX_TRUSTED_CONTACTS) {
        throw new ApiError(409, "too_many_contacts", `You can keep up to ${MAX_TRUSTED_CONTACTS} contacts.`);
      }

      const contact = await prisma.trustedContact.create({
        data: { userId: req.user!.sub, name: body.name, phone },
        select: { id: true, name: true, phone: true },
      });
      res.status(201).json(contact);
    }),
  );

  router.delete(
    "/:id",
    requireAuth(),
    asyncHandler(async (req, res) => {
      // Scoped to the caller: somebody else's contact is simply not found.
      const gone = await prisma.trustedContact.deleteMany({ where: { id: param(req, "id"), userId: req.user!.sub } });
      if (gone.count === 0) throw new ApiError(404, "no_contact", "That contact is not on your list.");
      res.status(204).end();
    }),
  );

  return router;
}

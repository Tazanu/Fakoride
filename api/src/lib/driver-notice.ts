/**
 * Telling a driver what was decided about him.
 *
 * The waiting screen in the app says "We'll text you as soon as it's done", and
 * the ops console's suspend box says "he is told this". Neither was true:
 * approving, refusing, suspending and reinstating a driver changed a row and
 * told nobody. An approved driver found out by opening the app again on a
 * hunch, and a suspended one by wondering why the rides had stopped.
 *
 * A text rather than a push, because the people this matters most to — an
 * applicant who signed out while he waited, a driver whose phone was reset —
 * have no push registration to send to.
 *
 * GSM-7 only in the fixed words, as everywhere else we text: one character
 * outside it and the message is billed at 70 characters a segment. That is why
 * the French avoids ê and ç. The reason is whatever the operator typed, and is
 * sent as typed.
 */

import { env } from "../env";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { smsSender } from "./sms";

export type DriverNotice = "approved" | "refused" | "suspended" | "reinstated";
type Lang = "en" | "fr";

/** Long enough to say something; short enough that the text stays two segments. */
const REASON_MAX = 140;

/** Pure, so the alphabet and the wording can be tested without a phone. */
export function driverNoticeText(
  kind: DriverNotice,
  language: string,
  opts: { reason?: string | null; supportPhone?: string | null } = {},
): string {
  const lang: Lang = language === "fr" ? "fr" : "en";
  const reason = opts.reason?.trim().slice(0, REASON_MAX);
  const call = opts.supportPhone
    ? lang === "fr"
      ? ` Appelez-nous au ${opts.supportPhone}.`
      : ` Call us on ${opts.supportPhone}.`
    : "";
  const why = reason ? (lang === "fr" ? ` Motif : ${reason}.` : ` Reason: ${reason}.`) : "";

  switch (kind) {
    case "approved":
      return lang === "fr"
        ? "Fako Ride : votre demande est acceptée. Ouvrez l'application et mettez-vous en ligne pour recevoir des courses."
        : "Fako Ride: you are approved. Open the app and go online to start taking rides.";
    case "refused":
      return (
        (lang === "fr"
          ? "Fako Ride : nous n'avons pas pu accepter votre demande."
          : "Fako Ride: we could not approve your application.") +
        why +
        call
      );
    case "suspended":
      return (
        (lang === "fr"
          ? "Fako Ride : votre compte est suspendu et vous ne recevez plus de courses."
          : "Fako Ride: your account is suspended and you will not be sent rides.") +
        why +
        call
      );
    case "reinstated":
      return lang === "fr"
        ? "Fako Ride : votre compte est de nouveau actif. Vous pouvez vous mettre en ligne."
        : "Fako Ride: your account is active again. You can go online.";
  }
}

/**
 * Text the driver. Never throws and never holds up the operator's click: the
 * decision is already saved, and a text that cannot be sent is logged.
 */
export function tellDriver(driverId: string, kind: DriverNotice, reason?: string | null): void {
  void prisma.driver
    .findUnique({ where: { id: driverId }, select: { user: { select: { phone: true, language: true, deletedAt: true } } } })
    .then((driver) => {
      // A deleted account has a placeholder where the number was.
      if (!driver || driver.user.deletedAt) return;
      const text = driverNoticeText(kind, driver.user.language, { reason, supportPhone: env.SUPPORT_PHONE ?? null });
      return smsSender.send(driver.user.phone, text);
    })
    .catch((err: unknown) => logger.error({ driverId, kind, err: String(err) }, "could not text a driver about a decision"));
}

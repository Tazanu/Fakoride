/**
 * Waking a phone that is not looking.
 *
 * The socket only reaches an app that is open. Android kills a backgrounded
 * socket within minutes, so a driver with the phone in his pocket — which is
 * how a driver waits — missed every offer, and a rider who put hers away never
 * heard that the taxi had come. A push notification is the one channel the
 * operating system keeps open for us.
 *
 * Sent through Expo's push service, which fronts Firebase and Apple and costs
 * nothing per message. One POST, no SDK:
 *
 *   POST https://exp.host/--/api/v2/push/send
 *        [{ to, title, body, data, priority, ttl, channelId, sound }]
 *     →  { data: [{ status: "ok", id } | { status: "error", details: { error } }] }
 *
 * The words are here, on the server, and in both languages. The app translates
 * everything else it shows, but a notification is drawn by the phone itself
 * before any of our code runs — so it has to arrive already in her language.
 *
 * A push is never the only signal and never allowed to break the thing it
 * accompanies. Every send is fire-and-forget: the socket event goes regardless,
 * a failure is logged, and nothing upstream waits on Expo.
 */

import { env } from "../env";
import { logger } from "./logger";
import { prisma } from "./prisma";

/** What Expo says a token looks like. Anything else is not a phone we can reach. */
export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

/** A hung push must not hold a dispatch loop open. */
const PUSH_TIMEOUT_MS = 8_000;

export type PushKind = "offer" | "accepted" | "arrived" | "no_driver" | "driver_cancelled";

type Words = { title: string; body: string };

/** `{price}`, `{pickup}`, `{drop}` and `{plate}` are filled per message. */
const TEXT: Record<PushKind, { en: Words; fr: Words }> = {
  offer: {
    en: { title: "New ride — {price} FCFA", body: "{pickup} → {drop}. Open to accept." },
    fr: { title: "Nouvelle course — {price} FCFA", body: "{pickup} → {drop}. Ouvrez pour accepter." },
  },
  accepted: {
    en: { title: "Your taxi is on the way", body: "{plate} is coming to {pickup}." },
    fr: { title: "Votre taxi arrive", body: "{plate} vient vous chercher à {pickup}." },
  },
  arrived: {
    en: { title: "Your taxi is outside", body: "{plate} is waiting at {pickup}. Tell him your number." },
    fr: { title: "Votre taxi est là", body: "{plate} vous attend à {pickup}. Dites-lui votre numéro." },
  },
  no_driver: {
    en: { title: "No taxi took this one", body: "Nothing has been charged. Try again, or walk to the junction." },
    fr: { title: "Aucun taxi n'a pris la course", body: "Rien n'a été facturé. Réessayez, ou marchez jusqu'au carrefour." },
  },
  // The ride goes straight back out to the next driver, so she is told that —
  // not asked to book again. If nobody takes it, `no_driver` follows.
  driver_cancelled: {
    en: { title: "Your driver dropped the ride", body: "We are finding you another taxi. Nothing has been charged." },
    fr: { title: "Le chauffeur a abandonné la course", body: "Nous vous cherchons un autre taxi. Rien n'a été facturé." },
  },
};

/**
 * Android channels. The app creates them; the server only names them.
 * Offers are loud and urgent, everything else is an ordinary notification.
 */
const CHANNEL: Record<PushKind, string> = {
  offer: "offers",
  accepted: "trips",
  arrived: "trips",
  no_driver: "trips",
  driver_cancelled: "trips",
};

/** 1500 → "1 500", the way a price is written on a kiosk here. */
export function francs(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: "high" | "normal";
  sound: "default";
  channelId: string;
  /** Seconds. An offer delivered after it has expired is worse than none. */
  ttl?: number;
};

/** The message for one person, in their language. Pure, so it can be tested alone. */
export function composePush(
  kind: PushKind,
  to: string,
  language: string,
  vars: Record<string, string | number>,
  data: Record<string, unknown>,
  ttlSeconds?: number,
): PushMessage {
  const words = TEXT[kind][language === "fr" ? "fr" : "en"];
  return {
    to,
    title: fill(words.title, vars),
    body: fill(words.body, vars),
    data: { kind, ...data },
    priority: "high",
    sound: "default",
    channelId: CHANNEL[kind],
    ...(ttlSeconds ? { ttl: ttlSeconds } : {}),
  };
}

type Ticket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };

/** One message to Expo. Returns the ticket, or null when Expo could not be asked. */
export async function sendPush(message: PushMessage, url: string = env.EXPO_PUSH_URL): Promise<Ticket | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify([message]),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "push: could not reach Expo");
    return null;
  }
  if (!res.ok) {
    logger.warn({ status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) }, "push: Expo refused the request");
    return null;
  }
  const body = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
  return body?.data?.[0] ?? null;
}

/**
 * Tell one account something, on their phone, in their language.
 *
 * Does nothing for an account with no phone registered. A token Expo says is
 * gone — the app was uninstalled, or the phone reset — is forgotten, so it is
 * not tried again on every ride from now on.
 */
export async function pushToUser(
  userId: string,
  kind: PushKind,
  vars: Record<string, string | number>,
  data: Record<string, unknown> = {},
  ttlSeconds?: number,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true, language: true } });
  if (!user?.pushToken) return;

  const ticket = await sendPush(composePush(kind, user.pushToken, user.language, vars, data, ttlSeconds));
  if (ticket?.status === "error") {
    if (ticket.details?.error === "DeviceNotRegistered") {
      await prisma.user.updateMany({ where: { pushToken: user.pushToken }, data: { pushToken: null, pushTokenAt: null } });
      logger.info({ userId }, "push: token no longer registered — forgotten");
    } else {
      logger.warn({ userId, kind, error: ticket.details?.error, message: ticket.message }, "push: Expo did not accept the message");
    }
  }
}

/** Fire and forget. The caller has already sent the socket event; this never throws. */
export function notify(
  userId: string,
  kind: PushKind,
  vars: Record<string, string | number>,
  data: Record<string, unknown> = {},
  ttlSeconds?: number,
): void {
  void pushToUser(userId, kind, vars, data, ttlSeconds).catch((err: unknown) =>
    logger.warn({ userId, kind, err: String(err) }, "push: failed"),
  );
}

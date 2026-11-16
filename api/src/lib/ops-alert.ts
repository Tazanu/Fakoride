/**
 * Telling the people who run this that somebody needs them, now.
 *
 * An alarm used to reach the ops console and nowhere else. The console asks
 * for news every ten seconds — while a browser tab is open on it. At eleven at
 * night, with the laptop shut, a rider pressing Get help was promised
 * "Somebody is calling you now" by a system that had told nobody.
 *
 * So the alarm is also texted, to every number in OPS_ALERT_PHONES. A text
 * makes a phone ring in a pocket, which a web page cannot do. The API refuses
 * to start in production with that list empty.
 *
 * The words keep to the GSM-7 alphabet, like the trusted-contact text and for
 * the same reason: one character outside it and the message is billed as
 * UCS-2, at 70 characters a segment instead of 160.
 */

import { env } from "../env";
import { logger } from "./logger";
import { BadPhoneError, normalisePhone } from "./phone";
import { smsSender } from "./sms";

export type SosForOps = {
  /** RIDER or DRIVER — who pressed it. */
  raisedByRole: string;
  /** The number to call back: the person who pressed it. */
  callBack: string;
  name: string | null;
  plate: string | null;
  from: string;
  to: string;
};

/** The text an operator receives. Pure, so its alphabet and contents can be tested. */
export function sosAlertText(sos: SosForOps): string {
  const who = sos.raisedByRole === "DRIVER" ? "driver" : "rider";
  const named = sos.name ? `${who} ${sos.name}` : `a ${who}`;
  const taxi = sos.plate ? `, taxi ${sos.plate}` : ", no taxi yet";
  return `FAKO RIDE SOS: ${named} pressed Get help${taxi}. ${sos.from} to ${sos.to}. Call ${sos.callBack} now.`;
}

/** The configured numbers, normalised. A mistyped one is logged and skipped, not fatal. */
export function opsAlertPhones(raw: string[] = env.OPS_ALERT_PHONES): string[] {
  const phones: string[] = [];
  for (const entry of raw) {
    try {
      phones.push(normalisePhone(entry));
    } catch (err) {
      if (!(err instanceof BadPhoneError)) throw err;
      logger.error({ entry }, "ops alert: OPS_ALERT_PHONES holds something that is not a Cameroon number — skipped");
    }
  }
  return [...new Set(phones)];
}

/**
 * Text every operator. Returns how many were sent to.
 *
 * Never throws and never waits on the SMS provider: the alarm is already in
 * the database and on the console by the time this runs, and the person who
 * raised it must not be kept waiting on an aggregator to learn it was received.
 */
export function alertOps(text: string): number {
  const phones = opsAlertPhones();
  if (phones.length === 0) {
    logger.error("ops alert: OPS_ALERT_PHONES is empty — the alarm reached the console only");
    return 0;
  }
  for (const phone of phones) {
    void smsSender.send(phone, text).catch((err: unknown) =>
      logger.error({ err: String(err) }, "ops alert: could not text an operator"),
    );
  }
  return phones.length;
}

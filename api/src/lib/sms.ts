/**
 * Sending a text message.
 *
 * One use today — the sign-in code — and it is the front door: no text, no
 * account. So the sender is behind a port, like payments and document storage,
 * and choosing a different aggregator is one new class and a config value.
 *
 *   console   writes the message to the log and sends nothing. Development only;
 *             the API refuses to boot with it in production, where nobody could
 *             ever sign in.
 *   orange    Orange's SMS API. Chosen because it is public, documented, and paid
 *             for in francs through prepaid bundles rather than billed per
 *             message in dollars. Before launch, confirm with Orange that the
 *             bundle delivers to MTN and Camtel numbers as well as Orange ones —
 *             most riders in Buea are on MTN.
 *
 * Orange's contract, as documented on developer.orange.com:
 *
 *   POST /oauth/v3/token
 *        Basic auth with the app's client id and secret,
 *        grant_type=client_credentials → { access_token, expires_in }
 *   POST /smsmessaging/v1/outbound/{senderAddress}/requests
 *        Bearer token, body { outboundSMSMessageRequest: { address,
 *        senderAddress, outboundSMSTextMessage: { message } } } → 201
 *
 * The sender address for Cameroon is tel:+2370000. A sender *name* ("FAKORIDE"
 * instead of a number) has to be approved by Orange first, so it is only sent
 * when configured.
 */

import { env } from "../env";
import { ApiError } from "./http";
import { logger } from "./logger";

export interface SmsSender {
  /** Throws on failure. The caller decides what the person is told. */
  send(to: string, message: string): Promise<void>;
}

class ConsoleSmsSender implements SmsSender {
  async send(to: string, message: string): Promise<void> {
    logger.info({ to, message }, "SMS (console sender — no message was actually sent)");
  }
}

const ORANGE_BASE = "https://api.orange.com";
/** A text that hangs holds the rider on the sign-in screen with nothing to read. */
const ORANGE_TIMEOUT_MS = 15_000;
/** Refresh the token this long before Orange says it expires. */
const TOKEN_MARGIN_MS = 60_000;

export type OrangeSmsConfig = {
  clientId: string;
  clientSecret: string;
  /** "tel:+2370000" for Cameroon. */
  senderAddress: string;
  senderName?: string;
  /** Tests only: a local stand-in that speaks Orange's contract. */
  baseUrl?: string;
};

export class OrangeSmsSender implements SmsSender {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly base: string;

  constructor(private readonly config: OrangeSmsConfig) {
    this.base = config.baseUrl ?? ORANGE_BASE;
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.token.expiresAt) return this.token.value;

    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const res = await this.fetch(`${this.base}/oauth/v3/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "sms: Orange refused our client credentials");
      throw unavailable();
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw unavailable();

    const lifetime = (body.expires_in ?? 3600) * 1000;
    this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(0, lifetime - TOKEN_MARGIN_MS) };
    return body.access_token;
  }

  async send(to: string, message: string): Promise<void> {
    const sender = encodeURIComponent(this.config.senderAddress);
    const url = `${this.base}/smsmessaging/v1/outbound/${sender}/requests`;
    const body = JSON.stringify({
      outboundSMSMessageRequest: {
        address: `tel:${to}`,
        senderAddress: this.config.senderAddress,
        ...(this.config.senderName ? { senderName: this.config.senderName } : {}),
        outboundSMSTextMessage: { message },
      },
    });

    const post = async (token: string) =>
      this.fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body,
      });

    let res = await post(await this.accessToken());
    // A token can be revoked or rotated before its stated expiry. One fresh
    // attempt, then give up — a loop here would be a loop of charged messages.
    if (res.status === 401) res = await post(await this.accessToken(true));

    if (res.status === 201 || res.ok) return;

    const detail = await res.text().catch(() => "");
    // 403 is Orange's answer when the prepaid bundle has run out. It is the one
    // failure somebody has to act on, so it is logged as exactly that.
    if (res.status === 403) {
      logger.error({ status: res.status, detail: detail.slice(0, 300) }, "sms: Orange refused — is the SMS bundle used up?");
    } else {
      logger.error({ status: res.status, detail: detail.slice(0, 300) }, "sms: Orange did not accept the message");
    }
    throw unavailable();
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(ORANGE_TIMEOUT_MS) });
    } catch (err) {
      logger.error({ err: String(err) }, "sms: could not reach Orange");
      throw unavailable();
    }
  }
}

/** What the person is told whatever went wrong: the sign-in screen has words for this code. */
function unavailable(): ApiError {
  return new ApiError(503, "sms_unavailable", "We cannot send codes right now. Try again shortly.");
}

function fromEnv(): SmsSender {
  if (env.SMS_PROVIDER === "orange") {
    if (!env.ORANGE_SMS_CLIENT_ID || !env.ORANGE_SMS_CLIENT_SECRET) {
      throw new Error(
        "SMS_PROVIDER is orange but ORANGE_SMS_CLIENT_ID and ORANGE_SMS_CLIENT_SECRET are not set.\n" +
          "Set them, or set SMS_PROVIDER=console for development.",
      );
    }
    return new OrangeSmsSender({
      clientId: env.ORANGE_SMS_CLIENT_ID,
      clientSecret: env.ORANGE_SMS_CLIENT_SECRET,
      senderAddress: env.ORANGE_SMS_SENDER_ADDRESS,
      ...(env.ORANGE_SMS_SENDER_NAME ? { senderName: env.ORANGE_SMS_SENDER_NAME } : {}),
    });
  }
  return new ConsoleSmsSender();
}

export const smsSender: SmsSender = fromEnv();

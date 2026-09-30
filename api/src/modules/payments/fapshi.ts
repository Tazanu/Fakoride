/**
 * Fapshi.
 *
 * Cameroonian, one API over both MTN MoMo and Orange Money, with a sandbox.
 * Verified against their reference:
 *
 *   POST /direct-pay            take money from a phone
 *   POST /payout                send money to a phone
 *   GET  /payment-status/:id    ask what happened
 *
 * Auth is two plain headers, `apiuser` and `apikey` — not a bearer token.
 * Amounts are integer XAF, minimum 100. Phone numbers go without the country
 * code: 6XXXXXXXX, not +2376XXXXXXXX.
 *
 * Direct Pay has to be switched on for a live account by asking their support;
 * it works in sandbox out of the box. Payouts are off by default and need the
 * same request. Neither is something the code can do anything about, so both
 * surface as a plain provider error rather than something clever.
 */

import { env } from "../../env";
import { logger } from "../../lib/logger";
import {
  MIN_TRANSFER_XAF,
  normaliseStatus,
  parseProviderStatus,
  PaymentProviderError,
  toLocalPhone,
  type MoneyRequest,
  type PaymentProvider,
  type ProviderRef,
  type ProviderStatusResult,
} from "./provider";

const SANDBOX_BASE = "https://sandbox.fapshi.com";
const LIVE_BASE = "https://live.fapshi.com";

/** A provider call that hangs is worse than one that fails: the driver waits. */
const REQUEST_TIMEOUT_MS = 20_000;

type FapshiInitiateResponse = { message?: string; transId?: string; dateInitiated?: string };

type FapshiStatusResponse = {
  transId?: string;
  status?: string;
  amount?: number;
  externalId?: string;
  financialTransId?: string;
  reason?: string;
  dateConfirmed?: string;
  message?: string;
};

export class FapshiProvider implements PaymentProvider {
  readonly name = "fapshi";
  private readonly baseUrl: string;

  constructor(
    private readonly apiUser: string,
    private readonly apiKey: string,
    sandbox: boolean,
    /** Tests only: a local stand-in that speaks Fapshi's contract. */
    baseUrl?: string,
  ) {
    this.baseUrl = baseUrl ?? (sandbox ? SANDBOX_BASE : LIVE_BASE);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          apiuser: this.apiUser,
          apikey: this.apiKey,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // A timeout or a dead socket says nothing about whether the money moved.
      // Retryable, and the caller must reconcile by transId rather than re-charge.
      throw new PaymentProviderError(
        err instanceof Error ? err.message : "Could not reach the payment provider.",
        true,
      );
    }

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }

    if (!res.ok) {
      const message = (body as { message?: string })?.message ?? `Payment provider returned ${res.status}`;
      // 4xx is a bad request — a wrong number, an amount below the floor, a
      // service not enabled on the account. Retrying puts the same prompt on
      // the same phone and gets the same answer.
      throw new PaymentProviderError(message, res.status >= 500, res.status);
    }

    return body as T;
  }

  private assertAmount(amountXaf: number): void {
    if (!Number.isInteger(amountXaf)) {
      throw new PaymentProviderError("Amounts are whole francs — the XAF has no subunit.", false);
    }
    if (amountXaf < MIN_TRANSFER_XAF) {
      throw new PaymentProviderError(`Mobile money will not move less than ${MIN_TRANSFER_XAF} XAF.`, false);
    }
  }

  private body(req: MoneyRequest): string {
    this.assertAmount(req.amountXaf);
    return JSON.stringify({
      amount: req.amountXaf,
      phone: toLocalPhone(req.phone),
      ...(req.medium ? { medium: req.medium } : {}),
      ...(req.name ? { name: req.name } : {}),
      externalId: req.externalId,
      message: req.message,
    });
  }

  async collect(req: MoneyRequest): Promise<ProviderRef> {
    const res = await this.request<FapshiInitiateResponse>("/direct-pay", {
      method: "POST",
      body: this.body(req),
    });
    if (!res.transId) throw new PaymentProviderError("Fapshi accepted the charge but returned no transId.", true);
    return { transId: res.transId, initiatedAt: res.dateInitiated };
  }

  async payout(req: MoneyRequest): Promise<ProviderRef> {
    const res = await this.request<FapshiInitiateResponse>("/payout", {
      method: "POST",
      body: this.body(req),
    });
    if (!res.transId) throw new PaymentProviderError("Fapshi accepted the payout but returned no transId.", true);
    return { transId: res.transId, initiatedAt: res.dateInitiated };
  }

  async status(transId: string): Promise<ProviderStatusResult> {
    const res = await this.request<FapshiStatusResponse>(`/payment-status/${encodeURIComponent(transId)}`, {
      method: "GET",
    });
    // Logged here rather than inside the mapping, so the mapping stays pure and
    // the warning carries the transaction it came from.
    if (parseProviderStatus(res.status) === null) {
      logger.warn({ transId, status: res.status }, "unrecognised status from Fapshi, reading it as PENDING");
    }
    return {
      transId: res.transId ?? transId,
      status: normaliseStatus(res.status),
      amountXaf: res.amount,
      financialTransId: res.financialTransId,
      externalId: res.externalId,
      reason: res.reason,
      confirmedAt: res.dateConfirmed,
    };
  }
}

/** Built from env, or null when no credentials are configured. */
export function fapshiFromEnv(): FapshiProvider | null {
  if (!env.FAPSHI_API_USER || !env.FAPSHI_API_KEY) return null;
  return new FapshiProvider(env.FAPSHI_API_USER, env.FAPSHI_API_KEY, env.FAPSHI_SANDBOX);
}

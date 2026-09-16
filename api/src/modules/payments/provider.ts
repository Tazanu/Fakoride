/**
 * The payments port.
 *
 * Fapshi is Cameroonian and is the default, but CamPay's flat 2% is the
 * benchmark we intend to hold them to — so the rest of the codebase talks to
 * this interface and never to a provider directly. Swapping one for the other
 * should be a config change and one new file, not a search through the ledger.
 *
 * Two directions, and the names are deliberately blunt about which is which:
 *   collect  takes money FROM somebody's phone (a fare, the daily fee)
 *   payout   sends money TO somebody's phone (a driver cashing out)
 *
 * Both are asynchronous in the real world. A provider returns a reference
 * immediately and the money lands — or does not — seconds or minutes later, so
 * every call here returns a reference and nothing else. Whether it worked is
 * answered by `status`, or by a webhook.
 */

/** Fapshi's spelling. Kept verbatim rather than translated into our own words. */
export type PaymentMedium = "mobile money" | "orange money";

/** Fapshi's status vocabulary, used as-is. See the PaymentStatus enum. */
export type ProviderStatus = "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";

export type MoneyRequest = {
  /** Integer XAF. Providers reject anything under 100. */
  amountXaf: number;
  /** E.164, as we store it. Adapters strip the country code if theirs wants it. */
  phone: string;
  /** Omit to let the provider detect MTN or Orange from the number itself. */
  medium?: PaymentMedium;
  /** Our own Payment id. Comes back on the webhook, and is how we reconcile. */
  externalId: string;
  /** Shown to the person on their phone, so it is written for them. */
  message: string;
  name?: string;
};

export type ProviderRef = {
  /** The provider's transaction id. Stored, and unique in our database. */
  transId: string;
  initiatedAt?: string;
};

export type ProviderStatusResult = {
  transId: string;
  status: ProviderStatus;
  amountXaf?: number;
  /** The mobile operator's own reference, for when somebody disputes a charge. */
  financialTransId?: string;
  /** Our Payment id, echoed back. */
  externalId?: string;
  reason?: string;
  confirmedAt?: string;
};

export interface PaymentProvider {
  readonly name: string;
  /** Take money from a phone. A USSD prompt appears on the payer's handset. */
  collect(req: MoneyRequest): Promise<ProviderRef>;
  /** Send money to a phone. */
  payout(req: MoneyRequest): Promise<ProviderRef>;
  status(transId: string): Promise<ProviderStatusResult>;
}

/**
 * A provider said no.
 *
 * `retryable` separates "the network blinked, try again" from "that number is
 * not an MTN line, and never will be" — the second must not be retried on a
 * loop, because every attempt puts a prompt on a real person's phone.
 */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/** Nobody quotes a mobile-money transfer below this; providers reject it. */
export const MIN_TRANSFER_XAF = 100;

// --- pure mapping -----------------------------------------------------------
//
// Kept here rather than in the Fapshi adapter so it can be tested without a
// database, a network or an .env — the same reason fare-math sits apart from
// the fare service. These two functions decide whether money goes to the right
// phone and whether a driver gets paid, which is reason enough to test them
// with nothing else in the way.

const KNOWN_STATUSES: ProviderStatus[] = ["CREATED", "PENDING", "SUCCESSFUL", "FAILED", "EXPIRED"];

/** Fapshi wants 6XXXXXXXX. We store +2376XXXXXXXX. */
export function toLocalPhone(e164: string): string {
  const digits = e164.replace(/[^\d]/g, "");
  return digits.startsWith("237") ? digits.slice(3) : digits;
}

/** The provider's exact word, or null if we have never seen it before. */
export function parseProviderStatus(raw: string | undefined): ProviderStatus | null {
  const upper = (raw ?? "").toUpperCase();
  return KNOWN_STATUSES.find((s) => s === upper) ?? null;
}

/**
 * An unrecognised status is read as PENDING, never as settled.
 *
 * If a provider adds a state we have not seen, "we do not know yet" is the only
 * safe reading — polling resolves it a moment later. Guessing SUCCESSFUL would
 * credit a driver for money that never arrived; guessing FAILED would put a
 * second prompt on a rider's phone for a fare they already paid.
 */
export function normaliseStatus(raw: string | undefined): ProviderStatus {
  return parseProviderStatus(raw) ?? "PENDING";
}

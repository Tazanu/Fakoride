/**
 * A payment provider that moves no money.
 *
 * The default in development, and what the integration suite runs against. Real
 * money needs a Fapshi account, an approval request for Direct Pay, and a
 * separate one for payouts — none of which a test run should depend on, and
 * none of which should be a prerequisite for somebody cloning this repo.
 *
 * It behaves like a real one in the ways that matter: it returns a reference
 * immediately, resolves asynchronously rather than at the moment of the call,
 * and can fail. Failure is deterministic and driven by the phone number, so a
 * test can ask for one without waiting for luck:
 *
 *   a number ending 00   fails       ("insufficient funds")
 *   a number ending 11   stays PENDING forever (the stuck-payment case)
 *   anything else        succeeds after RESOLVE_AFTER_MS
 *
 * It is never selected when FAPSHI credentials are present, so it cannot be
 * left on by accident in an environment that could have taken real money.
 */

import crypto from "node:crypto";
import {
  MIN_TRANSFER_XAF,
  PaymentProviderError,
  type MoneyRequest,
  type PaymentProvider,
  type ProviderRef,
  type ProviderStatusResult,
} from "./provider";

/** Long enough that a caller treating the reference as final is caught out. */
export const RESOLVE_AFTER_MS = 150;

type FakeRecord = {
  transId: string;
  externalId: string;
  amountXaf: number;
  phone: string;
  resolvesAt: number;
  outcome: "SUCCESSFUL" | "FAILED" | "PENDING";
};

export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  private readonly records = new Map<string, FakeRecord>();

  private initiate(req: MoneyRequest, kind: string): ProviderRef {
    if (!Number.isInteger(req.amountXaf) || req.amountXaf < MIN_TRANSFER_XAF) {
      throw new PaymentProviderError(`Mobile money will not move less than ${MIN_TRANSFER_XAF} XAF.`, false);
    }

    const digits = req.phone.replace(/[^\d]/g, "");
    const outcome = digits.endsWith("00") ? "FAILED" : digits.endsWith("11") ? "PENDING" : "SUCCESSFUL";

    const transId = `fake_${kind}_${crypto.randomBytes(6).toString("hex")}`;
    this.records.set(transId, {
      transId,
      externalId: req.externalId,
      amountXaf: req.amountXaf,
      phone: req.phone,
      resolvesAt: Date.now() + RESOLVE_AFTER_MS,
      outcome,
    });
    return { transId, initiatedAt: new Date().toISOString() };
  }

  async collect(req: MoneyRequest): Promise<ProviderRef> {
    return this.initiate(req, "collect");
  }

  async payout(req: MoneyRequest): Promise<ProviderRef> {
    return this.initiate(req, "payout");
  }

  async status(transId: string): Promise<ProviderStatusResult> {
    const record = this.records.get(transId);
    if (!record) throw new PaymentProviderError("No such transaction.", false, 404);

    if (record.outcome === "PENDING" || Date.now() < record.resolvesAt) {
      return { transId, status: "PENDING", amountXaf: record.amountXaf, externalId: record.externalId };
    }

    return {
      transId,
      status: record.outcome,
      amountXaf: record.amountXaf,
      externalId: record.externalId,
      financialTransId: record.outcome === "SUCCESSFUL" ? `fin_${transId}` : undefined,
      reason: record.outcome === "FAILED" ? "Insufficient funds" : undefined,
      confirmedAt: new Date().toISOString(),
    };
  }
}

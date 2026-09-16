/**
 * Which payment provider this process is using, decided once at startup.
 *
 * The rule that matters: asking for Fapshi without credentials is a startup
 * error, not a quiet fall back to the fake one. A production box that silently
 * pretends to take money is far worse than one that refuses to boot.
 */

import { env } from "../../env";
import { logger } from "../../lib/logger";
import { FakePaymentProvider } from "./fake";
import { fapshiFromEnv } from "./fapshi";
import type { PaymentProvider } from "./provider";

function select(): PaymentProvider {
  if (env.MOMO_PROVIDER === "fapshi") {
    const fapshi = fapshiFromEnv();
    if (!fapshi) {
      throw new Error(
        "MOMO_PROVIDER is fapshi but FAPSHI_API_USER and FAPSHI_API_KEY are not set.\n" +
          "Set them, or set MOMO_PROVIDER=fake to run without moving money.",
      );
    }
    logger.info({ sandbox: env.FAPSHI_SANDBOX }, "payments: Fapshi");
    return fapshi;
  }

  // Loud, and at warn: somebody reading production logs should notice.
  logger.warn("payments: FAKE provider — no real money will move");
  return new FakePaymentProvider();
}

export const payments: PaymentProvider = select();

export * from "./provider";
export { FakePaymentProvider } from "./fake";
export { FapshiProvider } from "./fapshi";

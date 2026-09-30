/**
 * Talk to Fapshi's sandbox through our own adapter, and say what happened.
 *
 *   npm run fapshi:check                  collect, then pay out, 100 XAF each
 *   npm run fapshi:check -- 670000000     from and to that number
 *
 * The integration suite runs against the fake provider on purpose — a test run
 * must never be able to move money. That left the real adapter exercised by
 * nothing, which is the one piece of code that decides whether a driver is
 * paid. This is the check to run before switching MOMO_PROVIDER to fapshi, and
 * again whenever the keys change.
 *
 * Sandbox only, and it checks rather than trusts: it refuses outright unless
 * FAPSHI_SANDBOX is on. Pointing it at a live account would put a real USSD
 * prompt on a real phone and move real francs.
 */

import "dotenv/config";
import { FapshiProvider } from "../src/modules/payments/fapshi";
import { PaymentProviderError, type ProviderStatus } from "../src/modules/payments/provider";

const TERMINAL: ProviderStatus[] = ["SUCCESSFUL", "FAILED", "EXPIRED"];
/** How long to wait for the sandbox to settle one transaction. */
const WAIT_MS = 90_000;

async function settle(provider: FapshiProvider, transId: string): Promise<string> {
  const until = Date.now() + WAIT_MS;
  let last = "";
  while (Date.now() < until) {
    const s = await provider.status(transId);
    if (s.status !== last) {
      console.log(`    ${new Date().toISOString().slice(11, 19)}  ${s.status}${s.reason ? ` — ${s.reason}` : ""}`);
      last = s.status;
    }
    if (TERMINAL.includes(s.status)) {
      console.log(`    amount ${s.amountXaf ?? "?"} XAF, operator ref ${s.financialTransId ?? "none"}`);
      return s.status;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return `${last} (still, after ${WAIT_MS / 1000}s)`;
}

async function attempt(label: string, run: () => Promise<{ transId: string }>, provider: FapshiProvider) {
  console.log(`\n${label}`);
  try {
    const { transId } = await run();
    console.log(`    accepted, transId ${transId}`);
    return await settle(provider, transId);
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      console.log(`    refused (${err.status ?? "no status"}): ${err.message}`);
      return `refused: ${err.message}`;
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const sandbox = process.env.FAPSHI_SANDBOX !== "false";
  if (!sandbox) {
    console.error("FAPSHI_SANDBOX is false. This script only ever talks to the sandbox — refusing.");
    process.exit(2);
  }
  const user = process.env.FAPSHI_API_USER;
  const key = process.env.FAPSHI_API_KEY;
  if (!user || !key) {
    console.error("FAPSHI_API_USER and FAPSHI_API_KEY are empty.");
    console.error("Sign in at https://dashboard.fapshi.com, create a SANDBOX service, and copy its");
    console.error("apiuser and apikey into api/.env. Sandbox keys are free and move no money.");
    process.exit(2);
  }

  const phone = `+237${(process.argv[2] ?? "670000000").replace(/\D/g, "").replace(/^237/, "")}`;
  const provider = new FapshiProvider(user, key, true);
  const ref = `fapshi-check-${Date.now()}`;
  console.log(`Fapshi SANDBOX, ${phone}`);

  const collected = await attempt(
    "collect 100 XAF (a fare, or the daily fee)",
    () => provider.collect({ amountXaf: 100, phone, externalId: `${ref}-in`, message: "Fako Ride sandbox check" }),
    provider,
  );
  const paid = await attempt(
    "pay out 100 XAF (a driver cashing out)",
    () => provider.payout({ amountXaf: 100, phone, externalId: `${ref}-out`, message: "Fako Ride sandbox check" }),
    provider,
  );

  console.log(`\ncollect: ${collected}\npayout:  ${paid}`);
  if (collected !== "SUCCESSFUL") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

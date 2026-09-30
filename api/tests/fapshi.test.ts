/**
 * The Fapshi adapter, against a stand-in that speaks Fapshi's contract.
 *
 * The integration suite runs on the fake provider so that a test can never move
 * money, which left this adapter — the thing that decides whether a driver is
 * paid — exercised by nothing at all. These pin down what it sends and how it
 * reads what comes back. `npm run fapshi:check` is the other half: the same
 * adapter against Fapshi's real sandbox, once there are sandbox keys.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FapshiProvider } from "../src/modules/payments/fapshi";
import { PaymentProviderError } from "../src/modules/payments/provider";
import { standIn, type StandIn } from "./helpers/standin";

let fapshi: StandIn;
let provider: FapshiProvider;

beforeAll(async () => {
  fapshi = await standIn((req) => {
    if (req.method === "POST" && (req.path === "/direct-pay" || req.path === "/payout")) {
      return { json: { message: "Accepted", transId: "tx_abc123", dateInitiated: "2026-09-30T10:00:00.000Z" } };
    }
    if (req.method === "GET" && req.path.startsWith("/payment-status/")) {
      return {
        json: {
          transId: "tx_abc123",
          status: "SUCCESSFUL",
          amount: 300,
          externalId: "pay_1",
          financialTransId: "MP260930.1000.A00001",
          dateConfirmed: "2026-09-30T10:00:20.000Z",
        },
      };
    }
    return { status: 404, json: { message: "no such route" } };
  });
  provider = new FapshiProvider("user-123", "key-456", true, fapshi.url);
});

afterAll(() => fapshi.close());

const fare = {
  amountXaf: 300,
  phone: "+237670000001",
  externalId: "pay_1",
  message: "Fako Ride — Checkpoint to Molyko",
};

describe("taking a fare", () => {
  it("posts to /direct-pay with Fapshi's two auth headers, not a bearer token", async () => {
    fapshi.calls.length = 0;
    const ref = await provider.collect(fare);

    expect(ref.transId).toBe("tx_abc123");
    const [call] = fapshi.calls;
    expect(call!.method).toBe("POST");
    expect(call!.path).toBe("/direct-pay");
    expect(call!.headers.apiuser).toBe("user-123");
    expect(call!.headers.apikey).toBe("key-456");
    expect(call!.headers.authorization).toBeUndefined();
  });

  it("sends the number without the country code, and the amount as whole francs", async () => {
    fapshi.calls.length = 0;
    await provider.collect(fare);
    expect(fapshi.calls[0]!.json).toMatchObject({
      amount: 300,
      phone: "670000001",
      externalId: "pay_1",
      message: "Fako Ride — Checkpoint to Molyko",
    });
  });

  it("refuses less than 100 XAF before asking anybody", async () => {
    fapshi.calls.length = 0;
    await expect(provider.collect({ ...fare, amountXaf: 50 })).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(provider.collect({ ...fare, amountXaf: 150.5 })).rejects.toBeInstanceOf(PaymentProviderError);
    expect(fapshi.calls).toHaveLength(0);
  });
});

describe("paying a driver", () => {
  it("posts to /payout", async () => {
    fapshi.calls.length = 0;
    await provider.payout({ ...fare, externalId: "pay_2", message: "Your Fako Ride earnings" });
    expect(fapshi.calls[0]!.path).toBe("/payout");
    expect(fapshi.calls[0]!.json).toMatchObject({ amount: 300, phone: "670000001", externalId: "pay_2" });
  });
});

describe("asking what happened", () => {
  it("reads Fapshi's status body into ours", async () => {
    const s = await provider.status("tx_abc123");
    expect(s).toMatchObject({
      transId: "tx_abc123",
      status: "SUCCESSFUL",
      amountXaf: 300,
      externalId: "pay_1",
      financialTransId: "MP260930.1000.A00001",
    });
    expect(fapshi.calls.at(-1)!.path).toBe("/payment-status/tx_abc123");
  });

  it("reads a status it has never seen as PENDING, never as paid", async () => {
    fapshi.answer(() => ({ json: { transId: "tx_abc123", status: "SOMETHING_NEW" } }));
    const s = await provider.status("tx_abc123");
    expect(s.status).toBe("PENDING");
  });
});

describe("when Fapshi says no", () => {
  it("a 4xx is final — retrying would put the same prompt on the same phone", async () => {
    fapshi.answer(() => ({ status: 400, json: { message: "Invalid phone number" } }));
    const err = await provider.collect(fare).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect((err as PaymentProviderError).retryable).toBe(false);
    expect((err as PaymentProviderError).message).toBe("Invalid phone number");
  });

  it("a 5xx can be tried again", async () => {
    fapshi.answer(() => ({ status: 503, text: "upstream down" }));
    const err = await provider.collect(fare).catch((e: unknown) => e);
    expect((err as PaymentProviderError).retryable).toBe(true);
  });

  it("an accepted charge with no transId is an error, not a success", async () => {
    fapshi.answer(() => ({ json: { message: "Accepted" } }));
    await expect(provider.collect(fare)).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

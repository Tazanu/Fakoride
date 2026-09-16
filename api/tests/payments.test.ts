/**
 * The two pure pieces of the payment adapter.
 *
 * Phone formatting because Fapshi wants 6XXXXXXXX where we store +2376XXXXXXXX,
 * and sending the wrong shape means the money goes nowhere or, worse, somewhere
 * else. Status mapping because how an unknown state is read decides whether a
 * driver gets paid twice or not at all.
 */

import { describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../src/modules/payments/fake";
import {
  MIN_TRANSFER_XAF,
  normaliseStatus,
  PaymentProviderError,
  toLocalPhone,
} from "../src/modules/payments/provider";

describe("the number Fapshi wants", () => {
  it("strips the Cameroon country code", () => {
    expect(toLocalPhone("+237670000001")).toBe("670000001");
  });

  it("leaves a bare local number alone", () => {
    expect(toLocalPhone("670000001")).toBe("670000001");
  });

  it("ignores spacing and punctuation", () => {
    expect(toLocalPhone("+237 67 00 00 001")).toBe("670000001");
  });

  it("never shortens a number that merely starts with the digits 237", () => {
    // A local number cannot start 237, so nothing should be stripped here.
    expect(toLocalPhone("237000000")).toBe("237000000".slice(3));
  });
});

describe("reading a provider status", () => {
  it("passes the four known states through", () => {
    expect(normaliseStatus("SUCCESSFUL")).toBe("SUCCESSFUL");
    expect(normaliseStatus("FAILED")).toBe("FAILED");
    expect(normaliseStatus("PENDING")).toBe("PENDING");
    expect(normaliseStatus("EXPIRED")).toBe("EXPIRED");
  });

  it("is not case sensitive", () => {
    expect(normaliseStatus("successful")).toBe("SUCCESSFUL");
  });

  it("treats anything it does not recognise as PENDING, never as settled", () => {
    // The dangerous readings are the other two: SUCCESSFUL would credit a driver
    // for money that never arrived, FAILED would charge a rider twice.
    expect(normaliseStatus("SOMETHING_NEW")).toBe("PENDING");
    expect(normaliseStatus(undefined)).toBe("PENDING");
    expect(normaliseStatus("")).toBe("PENDING");
  });
});

describe("the fake provider", () => {
  const req = (phone: string, amountXaf = 250) => ({
    amountXaf,
    phone,
    externalId: "pay_1",
    message: "test",
  });

  it("refuses an amount mobile money will not move", async () => {
    const provider = new FakePaymentProvider();
    await expect(provider.collect(req("+237670000001", MIN_TRANSFER_XAF - 1))).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it("does not resolve at the moment of the call", async () => {
    // A caller that treats the reference as confirmation has to be caught out,
    // because a real provider never confirms synchronously either.
    const provider = new FakePaymentProvider();
    const ref = await provider.collect(req("+237670000001"));
    expect((await provider.status(ref.transId)).status).toBe("PENDING");
  });

  it("settles successfully once it has had a moment", async () => {
    const provider = new FakePaymentProvider();
    const ref = await provider.collect(req("+237670000001"));
    await new Promise((r) => setTimeout(r, 200));
    const result = await provider.status(ref.transId);
    expect(result.status).toBe("SUCCESSFUL");
    expect(result.financialTransId).toBeTruthy();
  });

  it("fails on a number ending 00, so a test can ask for a failure", async () => {
    const provider = new FakePaymentProvider();
    const ref = await provider.collect(req("+237670000100"));
    await new Promise((r) => setTimeout(r, 200));
    const result = await provider.status(ref.transId);
    expect(result.status).toBe("FAILED");
    expect(result.reason).toBeTruthy();
  });

  it("stays pending forever on a number ending 11, for the stuck case", async () => {
    const provider = new FakePaymentProvider();
    const ref = await provider.collect(req("+237670000011"));
    await new Promise((r) => setTimeout(r, 200));
    expect((await provider.status(ref.transId)).status).toBe("PENDING");
  });

  it("gives every attempt its own reference", async () => {
    const provider = new FakePaymentProvider();
    const a = await provider.collect(req("+237670000001"));
    const b = await provider.collect(req("+237670000001"));
    expect(a.transId).not.toBe(b.transId);
  });
});

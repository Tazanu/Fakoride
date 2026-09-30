/**
 * The Orange SMS sender, against a stand-in that speaks Orange's contract.
 *
 * This is the front door: no text, no sign-in. What matters is that the token
 * is fetched once and reused (every fetch is a round trip on a slow line), that
 * the message goes to the right place in the right shape, and that every way
 * Orange can say no comes back as the one error the sign-in screen has words
 * for — never a raw provider message, never a hang.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrangeSmsSender } from "../src/lib/sms";
import { ApiError } from "../src/lib/http";
import { standIn, type Recorded, type Reply, type StandIn } from "./helpers/standin";

let orange: StandIn;
let tokensIssued = 0;

function normal(req: Recorded): Reply {
  if (req.path === "/oauth/v3/token") {
    tokensIssued += 1;
    return { json: { token_type: "Bearer", access_token: `tok-${tokensIssued}`, expires_in: 3600 } };
  }
  if (req.path.startsWith("/smsmessaging/v1/outbound/")) {
    return { status: 201, json: { outboundSMSMessageRequest: { resourceURL: "https://api.orange.com/x" } } };
  }
  return { status: 404 };
}

beforeAll(async () => {
  orange = await standIn(normal);
});
afterAll(() => orange.close());
beforeEach(() => {
  orange.calls.length = 0;
  tokensIssued = 0;
  orange.answer(normal);
});

const sender = () =>
  new OrangeSmsSender({
    clientId: "client-id",
    clientSecret: "client-secret",
    senderAddress: "tel:+2370000",
    baseUrl: orange.url,
  });

describe("getting a token", () => {
  it("uses Basic auth with the client id and secret, and the client-credentials grant", async () => {
    await sender().send("+237670000001", "123456 is your Fako Ride code.");
    const token = orange.calls.find((c) => c.path === "/oauth/v3/token")!;
    expect(token.method).toBe("POST");
    expect(token.headers.authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    expect(token.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(token.body).toBe("grant_type=client_credentials");
  });

  it("fetches it once and reuses it", async () => {
    const s = sender();
    await s.send("+237670000001", "one");
    await s.send("+237670000002", "two");
    await s.send("+237670000003", "three");
    expect(orange.calls.filter((c) => c.path === "/oauth/v3/token")).toHaveLength(1);
  });
});

describe("sending the text", () => {
  it("goes to the sender address's outbound path, with the bearer token", async () => {
    await sender().send("+237670000001", "123456 is your Fako Ride code.");
    const sms = orange.calls.find((c) => c.path.startsWith("/smsmessaging"))!;
    expect(sms.path).toBe("/smsmessaging/v1/outbound/tel%3A%2B2370000/requests");
    expect(sms.headers.authorization).toBe("Bearer tok-1");
  });

  it("carries the number and the words in Orange's shape", async () => {
    await sender().send("+237670000001", "123456 is your Fako Ride code.");
    const sms = orange.calls.find((c) => c.path.startsWith("/smsmessaging"))!;
    expect(sms.json).toEqual({
      outboundSMSMessageRequest: {
        address: "tel:+237670000001",
        senderAddress: "tel:+2370000",
        outboundSMSTextMessage: { message: "123456 is your Fako Ride code." },
      },
    });
  });

  it("only names the sender once a name is configured", async () => {
    const named = new OrangeSmsSender({
      clientId: "c",
      clientSecret: "s",
      senderAddress: "tel:+2370000",
      senderName: "FAKORIDE",
      baseUrl: orange.url,
    });
    await named.send("+237670000001", "hi");
    const sms = orange.calls.find((c) => c.path.startsWith("/smsmessaging"))!;
    expect((sms.json as { outboundSMSMessageRequest: { senderName?: string } }).outboundSMSMessageRequest.senderName).toBe("FAKORIDE");
  });
});

describe("when Orange says no", () => {
  const smsUnavailable = (err: unknown) =>
    err instanceof ApiError && err.status === 503 && err.code === "sms_unavailable";

  it("a revoked token is refreshed once and the text still goes", async () => {
    let first = true;
    orange.answer((req) => {
      if (req.path.startsWith("/smsmessaging") && first) {
        first = false;
        return { status: 401, json: { code: 42, message: "Expired credentials" } };
      }
      return normal(req);
    });
    await expect(sender().send("+237670000001", "hi")).resolves.toBeUndefined();
    expect(orange.calls.filter((c) => c.path === "/oauth/v3/token")).toHaveLength(2);
    expect(orange.calls.filter((c) => c.path.startsWith("/smsmessaging"))).toHaveLength(2);
  });

  it("but only once — a second 401 is a failure, not a loop of charged messages", async () => {
    orange.answer((req) => (req.path.startsWith("/smsmessaging") ? { status: 401 } : normal(req)));
    const err = await sender().send("+237670000001", "hi").catch((e: unknown) => e);
    expect(smsUnavailable(err)).toBe(true);
    expect(orange.calls.filter((c) => c.path.startsWith("/smsmessaging"))).toHaveLength(2);
  });

  it("an empty bundle is the error the sign-in screen can explain", async () => {
    orange.answer((req) => (req.path.startsWith("/smsmessaging") ? { status: 403, json: { message: "No bundle" } } : normal(req)));
    expect(smsUnavailable(await sender().send("+237670000001", "hi").catch((e: unknown) => e))).toBe(true);
  });

  it("bad credentials are the same error, and never reach the texting step", async () => {
    orange.answer((req) => (req.path === "/oauth/v3/token" ? { status: 401, json: { error: "invalid_client" } } : normal(req)));
    expect(smsUnavailable(await sender().send("+237670000001", "hi").catch((e: unknown) => e))).toBe(true);
    expect(orange.calls.some((c) => c.path.startsWith("/smsmessaging"))).toBe(false);
  });

  it("an Orange that cannot be reached is the same error, not a crash", async () => {
    const nowhere = new OrangeSmsSender({
      clientId: "c",
      clientSecret: "s",
      senderAddress: "tel:+2370000",
      baseUrl: "http://127.0.0.1:1",
    });
    expect(smsUnavailable(await nowhere.send("+237670000001", "hi").catch((e: unknown) => e))).toBe(true);
  });
});

/**
 * Push notifications: what the phone is told, and how it reaches Expo.
 *
 * The words matter more here than anywhere else in the API, because the phone
 * draws a notification itself — the app's own translation never runs. So the
 * message has to arrive already in the reader's language, with the numbers
 * filled in and nothing left in braces.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composePush, EXPO_TOKEN, francs, sendPush } from "../src/lib/push";
import { standIn, type StandIn } from "./helpers/standin";

const TOKEN = "ExponentPushToken[abc123XYZ]";

describe("what the phone is told", () => {
  it("an offer names the price and the route, in English", () => {
    const m = composePush("offer", TOKEN, "en", { price: francs(1500), pickup: "Checkpoint", drop: "Mile 17" }, { tripId: "t1" }, 12);
    expect(m.title).toBe("New ride — 1 500 FCFA");
    expect(m.body).toBe("Checkpoint → Mile 17. Open to accept.");
  });

  it("and in French for a driver who reads French", () => {
    const m = composePush("offer", TOKEN, "fr", { price: francs(300), pickup: "Molyko", drop: "Bonduma" }, { tripId: "t1" }, 12);
    expect(m.title).toBe("Nouvelle course — 300 FCFA");
    expect(m.body).toBe("Molyko → Bonduma. Ouvrez pour accepter.");
  });

  it("an unknown language falls back to English, never to a blank", () => {
    const m = composePush("arrived", TOKEN, "de", { plate: "SW 482 CK", pickup: "Checkpoint" }, {});
    expect(m.title).toBe("Your taxi is outside");
  });

  it("no message leaves with a hole still in it", () => {
    const kinds = ["offer", "accepted", "arrived", "no_driver", "driver_cancelled"] as const;
    const vars = { price: "300", pickup: "Checkpoint", drop: "Molyko", plate: "SW 1 A" };
    for (const kind of kinds) {
      for (const lang of ["en", "fr"]) {
        const m = composePush(kind, TOKEN, lang, vars, {});
        expect(`${m.title} ${m.body}`, `${kind}/${lang}`).not.toMatch(/[{}]/);
      }
    }
  });

  it("an offer lives only as long as the offer, and goes on the loud channel", () => {
    const m = composePush("offer", TOKEN, "en", { price: "300", pickup: "a", drop: "b" }, { tripId: "t1" }, 12);
    expect(m.ttl).toBe(12);
    expect(m.priority).toBe("high");
    expect(m.channelId).toBe("offers");
    expect(m.data).toEqual({ kind: "offer", tripId: "t1" });
  });

  it("rider updates go on the ordinary channel", () => {
    expect(composePush("accepted", TOKEN, "en", { plate: "x", pickup: "y" }, {}).channelId).toBe("trips");
  });

  it("only real Expo tokens are accepted", () => {
    expect(EXPO_TOKEN.test("ExponentPushToken[abc]")).toBe(true);
    expect(EXPO_TOKEN.test("ExpoPushToken[abc]")).toBe(true);
    expect(EXPO_TOKEN.test("abc")).toBe(false);
    expect(EXPO_TOKEN.test("ExponentPushToken[]")).toBe(false);
    expect(EXPO_TOKEN.test("https://evil.example/ExponentPushToken[abc]")).toBe(false);
  });
});

describe("reaching Expo", () => {
  let expo: StandIn;
  beforeAll(async () => {
    expo = await standIn(() => ({ json: { data: [{ status: "ok", id: "ticket-1" }] } }));
  });
  afterAll(() => expo.close());

  const message = composePush("offer", TOKEN, "en", { price: "300", pickup: "a", drop: "b" }, { tripId: "t1" }, 12);

  it("posts one message as a JSON array, which is what Expo's endpoint takes", async () => {
    expo.calls.length = 0;
    const ticket = await sendPush(message, expo.url);
    expect(ticket).toEqual({ status: "ok", id: "ticket-1" });
    expect(expo.calls[0]!.method).toBe("POST");
    expect(expo.calls[0]!.json).toEqual([message]);
    expect(expo.calls[0]!.headers["content-type"]).toBe("application/json");
  });

  it("passes back Expo's word that a phone is gone, so the token can be forgotten", async () => {
    expo.answer(() => ({
      json: { data: [{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }] },
    }));
    const ticket = await sendPush(message, expo.url);
    expect(ticket).toMatchObject({ status: "error", details: { error: "DeviceNotRegistered" } });
  });

  it("an Expo that refuses or cannot be reached is a null, never a thrown error", async () => {
    expo.answer(() => ({ status: 500, text: "down" }));
    await expect(sendPush(message, expo.url)).resolves.toBeNull();
    await expect(sendPush(message, "http://127.0.0.1:1")).resolves.toBeNull();
  });
});

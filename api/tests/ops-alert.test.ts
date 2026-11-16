/**
 * The text an operator gets when somebody presses Get help.
 *
 * It has one job — get a person to call the right number in the next minute —
 * so it must carry that number, say who and which taxi, and stay inside the
 * GSM-7 alphabet so it arrives as one cheap message rather than three.
 */

import { describe, expect, it } from "vitest";
import { opsAlertPhones, sosAlertText } from "../src/lib/ops-alert";

/** The GSM 03.38 basic character set, as in contacts.test.ts. */
const GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const outsideGsm7 = (text: string) => [...text].filter((ch) => !GSM7.has(ch));

const RIDER = {
  raisedByRole: "RIDER",
  callBack: "+237670000001",
  name: "Mirabel",
  plate: "SW 482 CK",
  from: "Checkpoint",
  to: "Great Soppo",
};

describe("the text ops gets for an alarm", () => {
  it("says who pressed it, which taxi, where, and the number to call", () => {
    const text = sosAlertText(RIDER);
    expect(text).toContain("rider Mirabel");
    expect(text).toContain("SW 482 CK");
    expect(text).toContain("Checkpoint to Great Soppo");
    expect(text).toContain("Call +237670000001 now");
  });

  it("names the driver's side when it was the driver", () => {
    expect(sosAlertText({ ...RIDER, raisedByRole: "DRIVER", name: "Bernard" })).toContain("driver Bernard");
  });

  it("still reads properly with no name and no taxi yet", () => {
    const text = sosAlertText({ ...RIDER, name: null, plate: null });
    expect(text).toContain("a rider pressed Get help, no taxi yet");
    expect(text).toContain("+237670000001");
  });

  it("stays inside GSM-7, so it is one message and not three", () => {
    expect(outsideGsm7(sosAlertText(RIDER))).toEqual([]);
    expect(outsideGsm7(sosAlertText({ ...RIDER, name: null, plate: null }))).toEqual([]);
  });

  it("fits in a single 160-character text for ordinary places", () => {
    expect(sosAlertText(RIDER).length).toBeLessThanOrEqual(160);
  });
});

describe("who is texted", () => {
  it("accepts the forms people type, and sends to each number once", () => {
    expect(opsAlertPhones(["670000001", "+237 670 000 001", "237670000002"])).toEqual(["+237670000001", "+237670000002"]);
  });

  it("skips something that is not a number rather than refusing them all", () => {
    expect(opsAlertPhones(["not a number", "670000003"])).toEqual(["+237670000003"]);
  });

  it("is nobody when the list is empty", () => {
    expect(opsAlertPhones([])).toEqual([]);
  });
});

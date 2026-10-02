/**
 * The text a trusted contact receives when somebody presses Get help.
 *
 * Two things matter beyond the words: it carries the link and the plate, and it
 * stays inside the GSM-7 alphabet. One character outside it — ê, ô, â, a curly
 * quote — and the whole message is billed as UCS-2, at 70 characters a segment
 * instead of 160, so every French alarm would cost two or three times as much.
 */

import { describe, expect, it } from "vitest";
import { contactAlertText } from "../src/modules/contacts";

/** The GSM 03.38 basic character set. The extension table (€, [, ] …) costs double, so it is left out on purpose. */
const GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const outsideGsm7 = (text: string) => [...text].filter((ch) => !GSM7.has(ch));

const LINK = "https://fako-ride-api.onrender.com/share/AbCdEfGhIjKlMnOpQrStUv";

describe("the text a trusted contact gets", () => {
  it("says who, which taxi, and where to follow it — in English", () => {
    const text = contactAlertText("en", "Ngwa", "SW 482 CK", LINK);
    expect(text).toContain("Ngwa pressed Get help");
    expect(text).toContain("SW 482 CK");
    expect(text).toContain(LINK);
  });

  it("and in French, for an account that reads French", () => {
    const text = contactAlertText("fr", "Ngwa", "SW 482 CK", LINK);
    expect(text).toContain("Ngwa a appuyé sur Aide");
    expect(text).toContain("SW 482 CK");
    expect(text).toContain(LINK);
  });

  it("still makes sense before any taxi has been found", () => {
    expect(contactAlertText("en", "Ngwa", null, LINK)).toContain("while waiting for a taxi");
    expect(contactAlertText("fr", "Ngwa", null, LINK)).toContain("en attendant un taxi");
  });

  it("uses only the GSM-7 alphabet, in both languages, so it is billed at the cheap rate", () => {
    for (const lang of ["en", "fr"]) {
      for (const plate of ["SW 482 CK", null]) {
        expect(outsideGsm7(contactAlertText(lang, "Ngwa", plate, LINK)), `${lang} ${plate}`).toEqual([]);
      }
    }
  });

  it("fits in two text messages even with the link", () => {
    for (const lang of ["en", "fr"]) {
      expect(contactAlertText(lang, "Ngwa Ewane Ndive", "SW 482 CK", LINK).length).toBeLessThanOrEqual(306);
    }
  });
});

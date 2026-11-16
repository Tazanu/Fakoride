/**
 * The text a driver gets when ops decides something about him.
 *
 * The app and the console both promise it. These hold the wording to what was
 * decided, in his language, and the fixed words to the GSM-7 alphabet.
 */

import { describe, expect, it } from "vitest";
import { driverNoticeText, type DriverNotice } from "../src/lib/driver-notice";

const GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const outsideGsm7 = (text: string) => [...text].filter((ch) => !GSM7.has(ch));
const KINDS: DriverNotice[] = ["approved", "refused", "suspended", "reinstated"];

describe("what a driver is texted", () => {
  it("tells an approved driver to go online", () => {
    expect(driverNoticeText("approved", "en")).toContain("you are approved");
    expect(driverNoticeText("approved", "fr")).toContain("votre demande est acceptée");
  });

  it("gives a suspended driver the reason ops typed, and the number to call", () => {
    const text = driverNoticeText("suspended", "en", { reason: "Three riders reported overcharging", supportPhone: "+237670000000" });
    expect(text).toContain("suspended");
    expect(text).toContain("Reason: Three riders reported overcharging.");
    expect(text).toContain("Call us on +237670000000.");
  });

  it("says the same to a French speaker, in French", () => {
    const text = driverNoticeText("refused", "fr", { reason: "Carte illisible", supportPhone: "+237670000000" });
    expect(text).toContain("nous n'avons pas pu accepter votre demande");
    expect(text).toContain("Motif : Carte illisible.");
    expect(text).toContain("Appelez-nous au +237670000000.");
  });

  it("leaves out the call line when there is no number to give", () => {
    expect(driverNoticeText("suspended", "en", { reason: "Papers expired" })).not.toContain("Call us");
  });

  it("falls back to English for a language it does not have", () => {
    expect(driverNoticeText("reinstated", "pidgin")).toContain("active again");
  });

  it("cuts a very long reason rather than sending five segments", () => {
    const text = driverNoticeText("suspended", "en", { reason: "x".repeat(600) });
    expect(text.length).toBeLessThan(260);
  });

  it("keeps its own words inside GSM-7, in both languages", () => {
    for (const kind of KINDS) {
      for (const lang of ["en", "fr"]) {
        expect(outsideGsm7(driverNoticeText(kind, lang, { reason: "ok", supportPhone: "+237670000000" }))).toEqual([]);
      }
    }
  });
});

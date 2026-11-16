/**
 * The pages anybody can open.
 *
 * Two promises: the legal words reach a browser as text and never as markup,
 * and the delete-account page tells somebody who no longer has the app exactly
 * where to write — which is the whole reason it exists.
 */

import { describe, expect, it } from "vitest";
import { LEGAL } from "../src/content/legal";
import { PRIVACY_EMAIL, renderBody, renderDeleteAccountPage, renderLegalPage } from "../src/modules/public-pages";

describe("rendering paragraphs and bullets", () => {
  it("gathers consecutive bullets into one list, between the paragraphs around them", () => {
    const html = renderBody(["Before.", "• one", "• two", "After.", "• three"]);
    expect(html).toBe("<p>Before.</p>\n<ul><li>one</li><li>two</li></ul>\n<p>After.</p>\n<ul><li>three</li></ul>");
  });

  it("escapes everything", () => {
    expect(renderBody(["<script>alert(1)</script>", "• a & b"])).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n<ul><li>a &amp; b</li></ul>",
    );
  });
});

describe("the legal pages", () => {
  it("carry every section heading of the privacy policy, in both languages", () => {
    for (const lang of ["en", "fr"] as const) {
      const html = renderLegalPage(LEGAL.privacy[lang], lang, "/legal/privacy");
      expect(html).toContain(`<html lang="${lang}">`);
      for (const section of LEGAL.privacy[lang].sections) {
        expect(html).toContain(`<h2>${section.heading.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}</h2>`);
      }
    }
  });

  it("link to the other language and to the delete-account page", () => {
    const html = renderLegalPage(LEGAL.terms.en, "en", "/legal/terms");
    expect(html).toContain('href="/legal/terms?lang=fr"');
    expect(html).toContain('href="/legal/delete-account?lang=en"');
  });
});

describe("the delete-account page", () => {
  it("says where to write, in both languages", () => {
    for (const lang of ["en", "fr"] as const) {
      const html = renderDeleteAccountPage(lang, null);
      expect(html).toContain(`mailto:${PRIVACY_EMAIL}`);
      expect(html).not.toContain("{email}");
      expect(html).not.toContain("{phone}");
    }
  });

  it("shows the support number only when there is one", () => {
    expect(renderDeleteAccountPage("en", null)).not.toContain("tel:");
    expect(renderDeleteAccountPage("en", "+237670000000")).toContain('href="tel:+237670000000"');
  });

  it("names the app and the path through it, as the store asks", () => {
    const html = renderDeleteAccountPage("en", null);
    expect(html).toContain("Fako Ride");
    expect(html).toContain("Delete my account");
  });
});

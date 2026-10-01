/**
 * The page a shared trip link opens.
 *
 * What matters: it is a page and not JSON, it carries nothing the link must not
 * carry, a name typed by a person can never become markup on it, and it stops
 * refreshing once there is nothing left to watch.
 */

import { describe, expect, it } from "vitest";
import { escapeHtml, renderGonePage, renderSharePage, SHARE_REFRESH_SECONDS, type ShareView } from "../src/modules/share-page";

const live: ShareView = {
  status: "IN_PROGRESS",
  ended: false,
  from: "Checkpoint",
  to: "Mile 17 Motor Park",
  driver: { firstName: "Epie", plate: "SW 482 CK", rating: 4.8, verified: true },
  position: { lat: 4.1531, lng: 9.2764 },
  startedAt: new Date("2026-10-01T15:04:00Z"),
  completedAt: null,
};

describe("the shared trip page", () => {
  it("is a page, saying where the ride is going and who is driving", () => {
    const html = renderSharePage(live, "en");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("On the way to Mile 17 Motor Park");
    expect(html).toContain("SW 482 CK");
    expect(html).toContain("Epie");
    expect(html).toContain("ID checked by Fako Ride");
  });

  it("speaks the rider's language", () => {
    const html = renderSharePage(live, "fr");
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("En route vers Mile 17 Motor Park");
    expect(html).toContain("Cette page se met à jour");
  });

  it("gives the time in Buea, whatever the server's clock says", () => {
    // 15:04 UTC is 16:04 in Buea.
    expect(renderSharePage(live, "en")).toContain("Set off at 16:04");
  });

  it("refreshes itself while the ride is live, and stops once it is over", () => {
    expect(renderSharePage(live, "en")).toContain(`<meta http-equiv="refresh" content="${SHARE_REFRESH_SECONDS}">`);
    const over = renderSharePage({ ...live, status: "COMPLETED", ended: true, position: null, completedAt: new Date() }, "en");
    expect(over).not.toContain('http-equiv="refresh"');
    expect(over).toContain("Arrived at Mile 17 Motor Park");
    expect(over).toContain("no longer updates");
  });

  it("points at the taxi on OpenStreetMap rather than drawing a map", () => {
    const html = renderSharePage(live, "en");
    expect(html).toContain("https://www.openstreetmap.org/?mlat=4.15310&amp;mlon=9.27640#map=17/4.15310/9.27640");
    expect(html).not.toMatch(/<script|<img|<iframe/i);
  });

  it("never lets a typed name become markup", () => {
    const hostile = renderSharePage(
      {
        ...live,
        from: `<img src=x onerror=alert(1)>`,
        driver: { firstName: `"><script>alert(document.cookie)</script>`, plate: "SW 1 <b>", rating: 4, verified: false },
      },
      "en",
    );
    expect(hostile).not.toContain("<script>alert");
    expect(hostile).not.toContain("<img src=x");
    expect(hostile).toContain("&lt;script&gt;");
    expect(hostile).toContain("SW 1 &lt;b&gt;");
  });

  it("says nothing about a driver who has not been found yet", () => {
    const html = renderSharePage({ ...live, status: "REQUESTED", driver: null, position: null, startedAt: null }, "en");
    expect(html).toContain("Looking for a taxi");
    expect(html).not.toContain("Driver");
  });

  it("a dead link says so in both languages, and nothing else", () => {
    const html = renderGonePage();
    expect(html).toContain("This link is no longer active.");
    expect(html).toContain("Ce lien n'est plus actif.");
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it("escapes the five characters that matter", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

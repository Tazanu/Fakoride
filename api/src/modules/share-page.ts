/**
 * The page a shared link opens.
 *
 * A rider sends "Follow my Fako Ride: <link>" to her mother, and her mother
 * taps it on whatever phone she has. Until this existed the link answered with
 * raw JSON — braces and quotation marks, on the one screen that was meant to
 * reassure somebody.
 *
 * So this is plain HTML, written for the cheapest browser it might meet: no
 * script, no map tiles, no web font, a few kilobytes. It refreshes itself every
 * twenty seconds while the ride is live and stops once it is over. Where the
 * taxi was last seen is a link to OpenStreetMap rather than an embedded map,
 * which a feature phone could not draw and which would cost her data to load.
 *
 * It says exactly what the JSON says and nothing more — no PIN, no phone
 * number, no rider's name, the driver's first name and plate only. In the
 * rider's language, since the person she sent it to most likely shares it.
 *
 * Every value that came from a person is escaped. A driver's name is typed by
 * a driver, and it must reach this page as text, never as markup.
 */

export type ShareView = {
  status: string;
  ended: boolean;
  from: string;
  to: string;
  driver: { firstName: string | null; plate: string; rating: number; verified: boolean } | null;
  position: { lat: number; lng: number } | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

type Lang = "en" | "fr";

/** Seconds between refreshes while the ride is live. */
export const SHARE_REFRESH_SECONDS = 20;

const TEXT = {
  title: { en: "Following a Fako Ride", fr: "Suivi d'une course Fako Ride" },
  looking: { en: "Looking for a taxi", fr: "Recherche d'un taxi" },
  coming: { en: "A taxi is on its way to the pickup", fr: "Un taxi se rend au point de départ" },
  outside: { en: "The taxi is at the pickup", fr: "Le taxi est au point de départ" },
  riding: { en: "On the way to {to}", fr: "En route vers {to}" },
  arrived: { en: "Arrived at {to}", fr: "Arrivé à {to}" },
  noDriver: { en: "No taxi was found. Nothing was charged.", fr: "Aucun taxi n'a été trouvé. Rien n'a été facturé." },
  cancelled: { en: "This ride was cancelled.", fr: "Cette course a été annulée." },
  from: { en: "From", fr: "Départ" },
  to: { en: "To", fr: "Arrivée" },
  driver: { en: "Driver", fr: "Chauffeur" },
  checked: { en: "ID checked by Fako Ride", fr: "Identité vérifiée par Fako Ride" },
  started: { en: "Set off at {time}", fr: "Parti à {time}" },
  finished: { en: "Arrived at {time}", fr: "Arrivé à {time}" },
  seen: { en: "Where the taxi was last seen", fr: "Dernière position du taxi" },
  live: {
    en: "This page updates itself every {n} seconds.",
    fr: "Cette page se met à jour toutes les {n} secondes.",
  },
  over: { en: "This ride is over. The page no longer updates.", fr: "Cette course est terminée. La page ne se met plus à jour." },
} satisfies Record<string, Record<Lang, string>>;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Fills {holes} with values that are escaped first. */
function say(phrase: Record<Lang, string>, lang: Lang, vars: Record<string, string | number> = {}): string {
  return escapeHtml(phrase[lang]).replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? escapeHtml(String(vars[key])) : whole,
  );
}

/** Buea time, whatever the server's clock is set to. */
function clock(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Douala", hour: "2-digit", minute: "2-digit" }).format(d);
}

function headline(view: ShareView, lang: Lang): string {
  switch (view.status) {
    case "REQUESTED":
    case "OFFERED":
      return say(TEXT.looking, lang);
    case "ACCEPTED":
      return say(TEXT.coming, lang);
    case "ARRIVED":
      return say(TEXT.outside, lang);
    case "IN_PROGRESS":
      return say(TEXT.riding, lang, { to: view.to });
    case "COMPLETED":
      return say(TEXT.arrived, lang, { to: view.to });
    case "NO_DRIVER_FOUND":
      return say(TEXT.noDriver, lang);
    default:
      return say(TEXT.cancelled, lang);
  }
}

const STYLE = `
  body{margin:0;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#F7F8F6;color:#14211F;line-height:1.45}
  main{max-width:420px;margin:0 auto}
  .brand{font-size:13px;font-weight:700;letter-spacing:.4px;color:#0F5F58;text-transform:uppercase}
  h1{font-size:22px;margin:6px 0 16px}
  .card{background:#fff;border:1px solid #DDE3E0;border-radius:12px;padding:14px 16px;margin-bottom:12px}
  .row{display:flex;justify-content:space-between;gap:12px;padding:4px 0}
  .k{color:#5B6B67}
  .v{font-weight:600;text-align:right}
  .plate{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.5px}
  .ok{color:#0F5F58;font-size:14px;margin-top:6px}
  a{color:#0F5F58;font-weight:600}
  .note{font-size:13px;color:#5B6B67;margin-top:16px}
`;

function page(lang: Lang, body: string, refresh: boolean): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
${refresh ? `<meta http-equiv="refresh" content="${SHARE_REFRESH_SECONDS}">` : ""}
<title>${say(TEXT.title, lang)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function renderSharePage(view: ShareView, language: string): string {
  const lang: Lang = language === "fr" ? "fr" : "en";
  const rows: string[] = [
    `<div class="row"><span class="k">${say(TEXT.from, lang)}</span><span class="v">${escapeHtml(view.from)}</span></div>`,
    `<div class="row"><span class="k">${say(TEXT.to, lang)}</span><span class="v">${escapeHtml(view.to)}</span></div>`,
  ];
  if (view.startedAt) rows.push(`<div class="row"><span class="k"></span><span class="v">${say(TEXT.started, lang, { time: clock(view.startedAt) })}</span></div>`);
  if (view.completedAt) rows.push(`<div class="row"><span class="k"></span><span class="v">${say(TEXT.finished, lang, { time: clock(view.completedAt) })}</span></div>`);

  const driver = view.driver
    ? `<div class="card">
  <div class="row"><span class="k">${say(TEXT.driver, lang)}</span><span class="v">${escapeHtml(view.driver.firstName ?? "")}</span></div>
  <div class="row"><span class="k"></span><span class="v plate">${escapeHtml(view.driver.plate)}</span></div>
  <div class="row"><span class="k"></span><span class="v">★ ${escapeHtml(view.driver.rating.toFixed(1))}</span></div>
  ${view.driver.verified ? `<div class="ok">✓ ${say(TEXT.checked, lang)}</div>` : ""}
</div>`
    : "";

  // Numbers only, so they cannot carry markup — but they go through the same
  // door as everything else regardless.
  const where = view.position
    ? (() => {
        const lat = view.position.lat.toFixed(5);
        const lng = view.position.lng.toFixed(5);
        const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
        return `<div class="card"><a href="${escapeHtml(href)}" rel="noopener noreferrer">${say(TEXT.seen, lang)} →</a></div>`;
      })()
    : "";

  const body = `<div class="brand">Fako Ride</div>
<h1>${headline(view, lang)}</h1>
<div class="card">${rows.join("")}</div>
${driver}
${where}
<p class="note">${view.ended ? say(TEXT.over, lang) : say(TEXT.live, lang, { n: SHARE_REFRESH_SECONDS })}</p>`;

  return page(lang, body, !view.ended);
}

/** Missing, revoked and expired all look the same, in both languages: nobody learns a trip existed. */
export function renderGonePage(): string {
  return page(
    "en",
    `<div class="brand">Fako Ride</div>
<h1>This link is no longer active.</h1>
<p lang="fr">Ce lien n'est plus actif.</p>`,
    false,
  );
}

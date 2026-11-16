/**
 * The pages anybody can open: the Terms, the Privacy policy, how to delete an
 * account, and the number to call.
 *
 * All of it already existed inside the app and nowhere else — which is no use
 * to a store listing that must link to the privacy policy, to a regulator, or
 * to somebody who uninstalled the app last month and now wants their account
 * gone. Google Play asks for exactly that last page: a web address where
 * deletion can be requested without reinstalling anything.
 *
 * Plain HTML in the manner of the shared-trip page: no script, no web font, a
 * few kilobytes, readable on the cheapest browser it will meet. Both languages
 * on one address, switched with ?lang=fr, defaulting to what the browser asks
 * for.
 *
 * The legal words are a checked copy of the app's own (see content/legal.ts).
 */

import { Router, type Request, type Response } from "express";
import { env } from "../env";
import { LEGAL, type LegalText } from "../content/legal";
import { escapeHtml } from "./share-page";

type Lang = "en" | "fr";

/** Where the privacy page tells people to write. One place, so the pages agree with it. */
export const PRIVACY_EMAIL = "privacy@fakoride.cm";

function langOf(req: Request): Lang {
  const asked = typeof req.query.lang === "string" ? req.query.lang : null;
  if (asked === "fr" || asked === "en") return asked;
  return req.acceptsLanguages("en", "fr") === "fr" ? "fr" : "en";
}

const STYLE = `
  body{margin:0;padding:20px 16px 48px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#F7F8F6;color:#14211F;line-height:1.55;font-size:16px}
  main{max-width:640px;margin:0 auto}
  .brand{font-size:13px;font-weight:700;letter-spacing:.4px;color:#0F5F58;text-transform:uppercase}
  .top{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
  h1{font-size:26px;margin:8px 0 4px}
  h2{font-size:18px;margin:28px 0 8px}
  p{margin:0 0 12px}
  ul{margin:0 0 12px;padding-left:20px}
  li{margin-bottom:6px}
  ol{margin:0 0 12px;padding-left:22px}
  a{color:#0F5F58;font-weight:600}
  .muted{color:#5B6B67;font-size:14px}
  .card{background:#fff;border:1px solid #DDE3E0;border-radius:12px;padding:14px 16px;margin:16px 0}
  .foot{margin-top:32px;padding-top:16px;border-top:1px solid #DDE3E0}
`;

function page(lang: Lang, title: string, path: string, body: string): string {
  const other: Lang = lang === "fr" ? "en" : "fr";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Fako Ride</title>
<style>${STYLE}</style>
</head>
<body><main>
<div class="top"><span class="brand">Fako Ride</span><a href="${escapeHtml(path)}?lang=${other}" hreflang="${other}">${other === "fr" ? "Français" : "English"}</a></div>
${body}
<p class="foot muted"><a href="/legal/terms?lang=${lang}">${lang === "fr" ? "Conditions" : "Terms"}</a> · <a href="/legal/privacy?lang=${lang}">${lang === "fr" ? "Confidentialité" : "Privacy"}</a> · <a href="/legal/delete-account?lang=${lang}">${lang === "fr" ? "Supprimer mon compte" : "Delete my account"}</a></p>
</main></body>
</html>`;
}

/**
 * A run of paragraphs, with consecutive "• " lines gathered into one list —
 * the same convention the app's own renderer follows.
 */
export function renderBody(lines: string[]): string {
  const out: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    out.push(`<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`);
    bullets = [];
  };
  for (const line of lines) {
    if (line.startsWith("• ")) {
      bullets.push(line.slice(2));
    } else {
      flush();
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flush();
  return out.join("\n");
}

export function renderLegalPage(doc: LegalText, lang: Lang, path: string): string {
  const sections = doc.sections
    .map((s) => `<h2>${escapeHtml(s.heading)}</h2>\n${renderBody(s.body)}`)
    .join("\n");
  const updated = lang === "fr" ? "Mis à jour le" : "Updated";
  return page(
    lang,
    doc.title,
    path,
    `<h1>${escapeHtml(doc.title)}</h1>
<p class="muted">${updated} ${escapeHtml(doc.updated)}</p>
<p>${escapeHtml(doc.intro)}</p>
${sections}
<p class="muted">${escapeHtml(doc.footer)}</p>`,
  );
}

const DELETE_TEXT = {
  en: {
    title: "Delete your Fako Ride account",
    intro: "You can delete your account yourself, in the app, in under a minute. If you no longer have the app, write to us and we will do it for you.",
    inApp: "In the app",
    steps: ["Open Fako Ride and sign in.", "Open Account.", "Scroll to the bottom and press Delete my account.", "Confirm."],
    noApp: "Without the app",
    write: "Write to {email} from any address and give the phone number the account was opened with. We will call that number to make sure the request is yours, then delete the account within 30 days.",
    call: "Or call us on {phone}.",
    goes: "What is deleted",
    goesList: [
      "Your phone number is removed from the account, so nobody can sign in to it.",
      "Your name and your photograph. The photograph file is deleted, not hidden.",
      "Your trusted contacts.",
      "For drivers: the photographs of your documents, and your identity card and licence numbers.",
      "You are signed out on every phone.",
    ],
    stays: "What is kept",
    staysList: [
      "The record of rides you took or drove, what was paid for them, and any complaint or alarm raised on them. These are kept because a fare can be disputed and a complaint has to be answerable after an account is gone, and because the law requires financial records to be held. They are no longer attached to your name.",
      "Mobile money payments keep the number that paid or was paid, as the payment provider's record does.",
      "For drivers: the plate of the taxi, which is what a rider with a complaint remembers.",
    ],
    first: "Before you delete",
    firstList: [
      "Finish or cancel any ride that is under way.",
      "Drivers: send any money we are holding for you to your MoMo first. Deleting the account does not forfeit it — we will not let you delete until it is sent.",
    ],
    again: "You can open a new account with the same number at any time. It starts empty.",
  },
  fr: {
    title: "Supprimer votre compte Fako Ride",
    intro: "Vous pouvez supprimer votre compte vous-même, dans l'application, en moins d'une minute. Si vous n'avez plus l'application, écrivez-nous et nous le ferons pour vous.",
    inApp: "Dans l'application",
    steps: ["Ouvrez Fako Ride et connectez-vous.", "Ouvrez Compte.", "Descendez jusqu'en bas et appuyez sur Supprimer mon compte.", "Confirmez."],
    noApp: "Sans l'application",
    write: "Écrivez à {email} depuis n'importe quelle adresse en indiquant le numéro de téléphone avec lequel le compte a été ouvert. Nous appellerons ce numéro pour vérifier que la demande vient bien de vous, puis nous supprimerons le compte sous 30 jours.",
    call: "Ou appelez-nous au {phone}.",
    goes: "Ce qui est supprimé",
    goesList: [
      "Votre numéro de téléphone est retiré du compte : plus personne ne peut s'y connecter.",
      "Votre nom et votre photographie. Le fichier de la photographie est supprimé, pas simplement masqué.",
      "Vos contacts de confiance.",
      "Pour les chauffeurs : les photographies de vos documents, ainsi que vos numéros de carte d'identité et de permis.",
      "Vous êtes déconnecté de tous les téléphones.",
    ],
    stays: "Ce qui est conservé",
    staysList: [
      "L'historique des courses que vous avez prises ou effectuées, ce qui a été payé, et toute réclamation ou alerte qui s'y rapporte. Ils sont conservés parce qu'un tarif peut être contesté et qu'une réclamation doit pouvoir recevoir une réponse après la suppression d'un compte, et parce que la loi impose de conserver les documents financiers. Ils ne sont plus rattachés à votre nom.",
      "Les paiements par mobile money conservent le numéro qui a payé ou a été payé, comme le fait le registre du prestataire de paiement.",
      "Pour les chauffeurs : la plaque du taxi, dont se souvient un passager qui fait une réclamation.",
    ],
    first: "Avant de supprimer",
    firstList: [
      "Terminez ou annulez toute course en cours.",
      "Chauffeurs : envoyez d'abord sur votre MoMo l'argent que nous détenons pour vous. La suppression du compte ne vous le fait pas perdre — nous ne vous laisserons pas supprimer tant qu'il n'est pas envoyé.",
    ],
    again: "Vous pouvez à tout moment ouvrir un nouveau compte avec le même numéro. Il sera vide.",
  },
} satisfies Record<Lang, Record<string, string | string[]>>;

export function renderDeleteAccountPage(lang: Lang, supportPhone: string | null): string {
  const t = DELETE_TEXT[lang];
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
  const mail = `<a href="mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent("Delete my Fako Ride account")}">${PRIVACY_EMAIL}</a>`;
  const write = escapeHtml(t.write).replace("{email}", mail);
  const call = supportPhone
    ? `<p>${escapeHtml(t.call).replace("{phone}", `<a href="tel:${escapeHtml(supportPhone)}">${escapeHtml(supportPhone)}</a>`)}</p>`
    : "";

  return page(
    lang,
    t.title,
    "/legal/delete-account",
    `<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.intro)}</p>
<div class="card"><h2 style="margin-top:0">${escapeHtml(t.inApp)}</h2>
<ol>${t.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol></div>
<div class="card"><h2 style="margin-top:0">${escapeHtml(t.noApp)}</h2>
<p>${write}</p>${call}</div>
<h2>${escapeHtml(t.first)}</h2>${list(t.firstList)}
<h2>${escapeHtml(t.goes)}</h2>${list(t.goesList)}
<h2>${escapeHtml(t.stays)}</h2>${list(t.staysList)}
<p>${escapeHtml(t.again)}</p>`,
  );
}

/** Mounted at the root: /legal/* and /support. Public, and cacheable — nothing here is anybody's data. */
export function publicPagesRouter(): Router {
  const router = Router();

  const html = (res: Response, body: string) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=300");
    res.send(body);
  };

  router.get("/legal/terms", (req, res) => {
    const lang = langOf(req);
    html(res, renderLegalPage(LEGAL.terms[lang], lang, "/legal/terms"));
  });

  router.get("/legal/privacy", (req, res) => {
    const lang = langOf(req);
    html(res, renderLegalPage(LEGAL.privacy[lang], lang, "/legal/privacy"));
  });

  router.get("/legal/delete-account", (req, res) => {
    html(res, renderDeleteAccountPage(langOf(req), env.SUPPORT_PHONE ?? null));
  });

  /**
   * The number to call.
   *
   * Half the app says "Call us" — when an application is refused, when a plate
   * is already registered, on the privacy page — and there was no number
   * anywhere to call. Served rather than built into the app, so changing the
   * office phone is a setting on the server and not a new release everybody
   * has to install.
   */
  router.get("/support", (_req, res) => {
    res.setHeader("cache-control", "public, max-age=300");
    res.json({ phone: env.SUPPORT_PHONE ?? null, email: "hello@fakoride.cm" });
  });

  return router;
}

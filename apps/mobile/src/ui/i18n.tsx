/**
 * The app in two languages.
 *
 * `client.ts` has held the API to this rule since it was written — "the API
 * answers in English; the app runs in English and French. Showing a rider a
 * server's English sentence is a bug." The app did not meet it. Every word on
 * every screen was English, while the account carried a language, the service
 * banner arrived translated, and the legal documents had an EN/FR switch. A
 * French speaker got a French privacy policy inside an English app.
 *
 * No library. A translation library is a dependency, a bundle and a build step
 * for something this app needs one function for, on handsets where every
 * kilobyte is paid for by the megabyte.
 *
 * A string is a pair, not a key:
 *
 *     t(S.welcome.tagline)
 *
 * The two languages sit side by side in `content/strings.ts`, which means a
 * missing French line is a type error rather than a word that quietly comes
 * out English in front of somebody who cannot read it.
 */

import { useCallback } from "react";
import { useSession } from "@/session/SessionProvider";

/** One phrase, in the languages we have. */
export type Phrase = { en: string; fr: string };

export type Lang = "en" | "fr";

/** Fills `{name}` holes. Numbers and places, mostly. */
function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/**
 * The reader's language.
 *
 * English unless the account says otherwise. Fako is the anglophone
 * South-West, so that is the right default here rather than a guess at the
 * device locale — and somebody who has not signed in has not told us anything.
 */
export function useLang(): Lang {
  const { me } = useSession();
  return me?.language === "fr" ? "fr" : "en";
}

/** The translator itself, for the few helpers that live outside a component. */
export type Translate = (phrase: Phrase, vars?: Record<string, string | number>) => string;

export function useT(): Translate {
  const lang = useLang();
  return useCallback(
    (phrase: Phrase, vars?: Record<string, string | number>) => fill(phrase[lang], vars),
    [lang],
  );
}

/**
 * Choosing between two words on a count.
 *
 * French and English both take a plural at two, so one helper covers both —
 * which will stop being true the day this needs a third language.
 */
export function plural(n: number, one: Phrase, many: Phrase): Phrase {
  return n === 1 ? one : many;
}

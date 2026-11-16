/**
 * The API's copy of the Terms and the Privacy policy is the app's, word for word.
 *
 * The app is where the words are written; the API serves a copy as web pages.
 * If the two ever differ, the policy a regulator reads at the web address is
 * not the one a rider agreed to in the app. When this fails:
 *
 *   npm run legal:sync
 */

import { describe, expect, it } from "vitest";
import { LEGAL } from "../src/content/legal";
import { PRIVACY } from "../../apps/mobile/src/content/privacy";
import { TERMS } from "../../apps/mobile/src/content/terms";

describe("the legal pages the API serves", () => {
  it("match the app's Terms", () => {
    expect(LEGAL.terms).toEqual(JSON.parse(JSON.stringify(TERMS)));
  });

  it("match the app's Privacy policy", () => {
    expect(LEGAL.privacy).toEqual(JSON.parse(JSON.stringify(PRIVACY)));
  });
});

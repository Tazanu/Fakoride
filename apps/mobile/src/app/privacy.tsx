/**
 * The privacy policy.
 *
 * The text lives in `content/privacy.ts`, in English and French. Written from
 * the schema rather than from a template: every item in "what we keep" is a
 * column that exists, and the photograph rules are the ones the API enforces.
 */

import { PRIVACY } from "@/content/privacy";
import { LegalDoc } from "@/ui/legal";

export default function Privacy() {
  return <LegalDoc doc={PRIVACY} />;
}

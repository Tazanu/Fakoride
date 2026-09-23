/**
 * The terms of use.
 *
 * The text lives in `content/terms.ts`, in English and French. This screen is
 * only the route — which is the point of keeping the document as data: a
 * translation was a second content file, not a second screen.
 */

import { TERMS } from "@/content/terms";
import { LegalDoc } from "@/ui/legal";

export default function Terms() {
  return <LegalDoc doc={TERMS} />;
}

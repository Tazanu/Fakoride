/**
 * The privacy policy.
 *
 * Written from the schema rather than from a template. Every item in "What we
 * keep" is a column that exists in the database, and the sharing rules are the
 * ones the API actually enforces — `GET /trips/:id/photo` really does refuse
 * once a trip is over, and this page says so because it is true, not because
 * it sounds reassuring.
 *
 * This is a draft for a lawyer in Cameroon to check before launch, not a
 * substitute for one. Law No. 2024/017 of 23 December 2024 took effect for
 * existing operators on 23 June 2026 and brings consent, data-subject rights,
 * breach notification and cross-border transfer approval with it. The places
 * where this product is not yet compliant are listed in the handover notes,
 * not papered over here.
 */

import { LegalPage, type Section } from "@/ui/legal";

const SECTIONS: Section[] = [
  {
    heading: "Who we are",
    body: [
      "Fako Ride is a taxi-hailing service for Fako Division — Buea, and the towns around it. We connect riders with taxi drivers at a price both of you see before the trip starts.",
      "We are the controller of the information described here. If you want to reach us about anything on this page, the contact details are at the end.",
    ],
  },
  {
    heading: "What we keep, and why",
    body: [
      "Everyone who signs in:",
      "• Your phone number. It is how you sign in, and it is the only identity that works here — we do not ask for an email address or a password.",
      "• Your name, so a driver knows who he is looking for, and the language you want us to write to you in.",
      "• A photograph of you, if you choose to add one. This is optional and you can remove it at any time.",
      "Riders, when you book:",
      "• Where you are, at the moment you ask for a taxi, so we can send you one that is nearby.",
      "• Each trip: where you were picked up and dropped, the price, how you paid, when it happened, and the four-digit code for that ride.",
      "Drivers, because the law and the work require it:",
      "• Your vehicle registration plate, your national identity card number, and your S10 licence number. A paid trip cannot legally be dispatched to a driver without an S10, so we have to hold it.",
      "• Photographs of your national identity card, your vehicle registration and yourself. These are checked by a person before you are approved.",
      "• Where you are, continuously, while you are online and available for work. When you go offline we stop, and your last position is deleted rather than kept.",
      "• What you earned, what you were paid, and the daily access fee for each day you worked.",
      "Everybody, when something goes wrong:",
      "• Complaints you send us, and what we answered.",
      "• Emergency alerts: where you were when you pressed the button, what you told us, and what we did about it.",
      "Payments:",
      "• The mobile money number used, the amount, and the reference the provider gives back. We never see or hold your mobile money PIN — that stays between you and MTN or Orange.",
    ],
  },
  {
    heading: "Who can see your photograph",
    body: [
      "This is the part worth reading carefully, because a face is the most personal thing in the app.",
      "• You can always see your own.",
      "• The other person on your trip — your driver, or your rider — can see yours while that trip is running, and only then. The moment the trip finishes, the door closes again.",
      "• Nobody else can see it. There is no link to it, no public address, and no way to reach it without being signed in as one of those two people.",
      "A driver's identity documents are different: they are checked by our staff before he is approved, and they are never shown to riders.",
    ],
  },
  {
    heading: "Who else we give information to",
    body: [
      "We do not sell your information to anybody, and we do not use it to advertise to you.",
      "We share only what is needed, with:",
      "• Your driver or your rider, during a trip: a name, a photograph if you added one, a phone number so you can call each other, and the plate.",
      "• Anyone you send a trip link to. That is your choice, the link expires, and you can revoke it.",
      "• The mobile money provider, so a payment can be made.",
      "• The police or a court, if we are lawfully required to — and we will tell you when we are allowed to tell you.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "Trip records, complaints and emergency alerts are kept while the account exists, because a dispute about a fare or an incident can arrive weeks later and we would be no use without them.",
      "Driver documents are kept while you drive with us and for as long afterwards as we are required to hold them.",
      "Your photograph is kept until you remove it. When you remove it, the file itself is deleted, not just hidden.",
      "A driver's live position is not history. It is overwritten as you move and deleted when you go offline.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "Under Cameroonian law — Law No. 2024/017 of 23 December 2024 on the protection of personal data — you can ask us to:",
      "• Show you what we hold about you.",
      "• Correct anything that is wrong. Your name is yours to change in the app at any time.",
      "• Delete your account and what we hold, except where we are required to keep it.",
      "• Give you a copy you can take elsewhere.",
      "• Stop processing that relies on your agreement, by withdrawing it.",
      "Ask us and we will answer. If you are not satisfied, you may complain to the national data protection authority.",
    ],
  },
  {
    heading: "Where your information is stored",
    body: [
      "Some of the services we use to run the app store information outside Cameroon. Where that is the case we are required to obtain approval for the transfer, and we will name those services and their locations here before the app is opened to the public.",
      "We would rather tell you this plainly than leave it out.",
    ],
  },
  {
    heading: "Keeping it safe",
    body: [
      "Your session is held in your phone's own secure storage, not in a file any other app can read.",
      "Identity documents and photographs are never served from a public address. Every request for one is checked against who you are and what you are entitled to see.",
      "If something goes wrong and your information is exposed, we are required to report it, and we will tell you.",
    ],
  },
  {
    heading: "Children",
    body: [
      "Fako Ride is not for children. You must be at least 18 to hold an account, whether you ride or drive.",
    ],
  },
  {
    heading: "Changes, and reaching us",
    body: [
      "If we change this, we will say so in the app rather than quietly updating a page nobody visits.",
      "Write to us at privacy@fakoride.cm, or call the number on the support screen.",
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      updated="21 September 2026"
      intro="What we keep about you, who can see it, and what you can make us do about it. It is written plainly on purpose — a policy nobody can read is not consent, it is paperwork."
      sections={SECTIONS}
      footer="This is a draft. It describes what the app actually does today, but it has not yet been reviewed by a lawyer in Cameroon and must be before Fako Ride opens to the public."
    />
  );
}

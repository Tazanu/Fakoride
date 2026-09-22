/**
 * The terms of use.
 *
 * Two audiences in one document, because it is one app: a rider who wants to
 * know what the price means, and a driver who wants to know what the daily fee
 * buys and what gets him suspended. The driver half says the access fee is a
 * flat daily charge on days he actually works and not a commission, because
 * that is the promise the whole business rests on and it belongs somewhere he
 * can point at.
 *
 * A draft for a lawyer in Cameroon to check, not a substitute for one.
 */

import { LegalPage, type Section } from "@/ui/legal";

const SECTIONS: Section[] = [
  {
    heading: "What Fako Ride does",
    body: [
      "We put riders and taxi drivers in touch with each other and agree the price in advance. The driver carries you; we do not. The taxi is his, the trip is between you and him, and he is responsible for driving you safely and lawfully.",
      "We operate in Fako Division. If you are outside the zones in the app, we cannot price a trip for you yet.",
    ],
  },
  {
    heading: "Your account",
    body: [
      "You need a Cameroonian phone number, and you must be at least 18.",
      "The account is yours alone. The code we send is how we know it is you — do not pass it on, not even to somebody claiming to be us. We will never ask you for it.",
      "Give us a real name. A driver looking for you at a motor park has your name and little else.",
    ],
  },
  {
    heading: "The price",
    body: [
      "Fares are fixed for each pair of zones and shown before you book. Buea is built on a mountain, so prices reflect the climb rather than a meter counting distance.",
      "The price you are shown is the price you pay. A driver asking for more than the app says is breaking our rules, and you should report it — there is a link at the end of every trip.",
      "You can pay in cash or by mobile money. If you pay cash, pay the driver directly, exactly what the app showed.",
      "Prices change as we learn what a route really costs. A change never applies to a trip already booked.",
    ],
  },
  {
    heading: "Cancelling",
    body: [
      "You can cancel before the driver arrives at no charge. Cancel repeatedly after drivers have set off and we may stop offering you rides — his fuel and his time are real.",
      "A driver who accepts and does not come is a problem for us, not for you. Tell us and we will deal with it.",
    ],
  },
  {
    heading: "Driving with us",
    body: [
      "To carry paying passengers you need an S10 licence. This is the law, not our rule, and we cannot send you a single trip without the number on your card.",
      "Before you are approved we check your national identity card, your vehicle registration and your photograph. You must be the person in the documents and the taxi must be the one on the registration.",
      "Keep your papers current. If your licence lapses, tell us and stop driving until it is renewed.",
    ],
  },
  {
    heading: "What you pay us",
    body: [
      "A flat daily access fee, charged only for a day you actually worked. We do not take a percentage of your fares.",
      "This is deliberate. A cut of a 700 franc trip is the sort of arrangement that drives a man off the app and back to the roadside, and we would rather charge a small fixed amount and have you stay.",
      "The fare is yours. If the rider pays cash, you keep the cash. The fee is settled separately.",
      "There is no charge for a day you did not work. Mondays are quiet in Buea and we know it.",
    ],
  },
  {
    heading: "How to behave",
    body: [
      "Both of you, plainly: no threats, no harassment, no refusing somebody because of who they are.",
      "Riders: be where you said you would be, and pay what was agreed.",
      "Drivers: take the trip you accepted, at the price shown, by a sensible route. Do not ask for more. Do not carry other passengers on a trip somebody booked.",
      "We can suspend an account for breaking these rules. A driver who is suspended is told why, and it stays on his record.",
    ],
  },
  {
    heading: "Safety",
    body: [
      "Check the plate against the app before you get in. Tell the driver the four-digit code — he cannot start the trip without it, and that is how you both know you have the right person.",
      "There is an emergency button on every live trip. Pressing it sends us where you are, and a person calls you.",
      "You can send a link to somebody so they can watch the trip. The link expires, and you can revoke it.",
    ],
  },
  {
    heading: "When something goes wrong",
    body: [
      "Tell us at the end of the trip, or from your account. A person reads it and answers you within a day.",
      "If we get it wrong, say so and we will look again.",
    ],
  },
  {
    heading: "What we are not responsible for",
    body: [
      "We arrange the trip; we do not drive it, and we do not own the taxi. The driver is responsible for his vehicle, his licence, his insurance and his driving.",
      "We do not promise a taxi will always be available. Sometimes nobody is near you, and the app will say so rather than leave you waiting.",
      "Nothing here removes a right you have under Cameroonian law, and nothing here limits our liability for death or injury caused by our own fault.",
    ],
  },
  {
    heading: "Ending it",
    body: [
      "You can stop using Fako Ride at any time and ask us to close your account.",
      "We can close an account that breaks these terms, and we will tell you why.",
    ],
  },
  {
    heading: "The law that applies",
    body: [
      "These terms are governed by the law of the Republic of Cameroon, and disputes belong to the courts of Fako Division.",
      "Write to us at hello@fakoride.cm.",
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms"
      updated="21 September 2026"
      intro="What you can expect from us, and what we expect from you. Short sentences on purpose: these are the rules a rider and a driver are actually held to, so they should be readable by both."
      sections={SECTIONS}
      footer="This is a draft. It has not yet been reviewed by a lawyer in Cameroon and must be before Fako Ride opens to the public."
    />
  );
}

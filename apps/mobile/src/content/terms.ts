/**
 * The terms of use, in both languages.
 *
 * Fako Division is in the anglophone South-West, so Buea reads English and that
 * is the default here. But this is Cameroon: a passenger off the Douala road
 * reads French, the app already runs in both, and the rest of the codebase is
 * strict that a server's English sentence must never reach a rider. A legal
 * document is the last place to make an exception — it is the one text a person
 * is held to whether or not they could read it.
 *
 * The French is a translation of the argument, not of the words. "A cut of a
 * 700 franc trip is the sort of arrangement that drives a man off the app and
 * back to the roadside" is the point being made; rendering it literally would
 * produce something no francophone driver would recognise as speech.
 *
 * Both are drafts. Neither has been read by a lawyer in Cameroon.
 */

import type { Section } from "@/ui/legal";

export type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
  footer: string;
};

const en: LegalDoc = {
  title: "Terms",
  updated: "21 September 2026",
  intro:
    "What you can expect from us, and what we expect from you. Short sentences on purpose: these are the rules a rider and a driver are actually held to, so they should be readable by both.",
  footer:
    "This is a draft. It has not yet been reviewed by a lawyer in Cameroon and must be before Fako Ride opens to the public.",
  sections: [
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
  ],
};

const fr: LegalDoc = {
  title: "Conditions",
  updated: "21 septembre 2026",
  intro:
    "Ce que vous pouvez attendre de nous, et ce que nous attendons de vous. Des phrases courtes, volontairement : ce sont les règles qui engagent le passager comme le chauffeur, elles doivent donc être lisibles par les deux.",
  footer:
    "Ceci est un projet. Il n'a pas encore été relu par un avocat au Cameroun, et devra l'être avant l'ouverture de Fako Ride au public.",
  sections: [
    {
      heading: "Ce que fait Fako Ride",
      body: [
        "Nous mettons en relation des passagers et des chauffeurs de taxi, et le prix est convenu à l'avance. C'est le chauffeur qui vous transporte, pas nous. Le taxi est le sien, la course se fait entre vous et lui, et c'est lui qui répond de votre sécurité et du respect de la loi au volant.",
        "Nous opérons dans le département du Fako. Si vous êtes en dehors des zones de l'application, nous ne pouvons pas encore vous donner un prix.",
      ],
    },
    {
      heading: "Votre compte",
      body: [
        "Il vous faut un numéro de téléphone camerounais, et vous devez avoir au moins 18 ans.",
        "Le compte n'appartient qu'à vous. Le code que nous envoyons est ce qui nous prouve que c'est bien vous — ne le communiquez à personne, pas même à quelqu'un qui prétend être nous. Nous ne vous le demanderons jamais.",
        "Donnez votre vrai nom. Un chauffeur qui vous cherche dans un parc à taxis n'a que votre nom, et pas grand-chose d'autre.",
      ],
    },
    {
      heading: "Le prix",
      body: [
        "Les tarifs sont fixes pour chaque paire de zones et affichés avant la réservation. Buea est bâtie sur une montagne : les prix tiennent compte de la montée, et non d'un compteur qui mesure la distance.",
        "Le prix affiché est le prix que vous payez. Un chauffeur qui demande plus que ce qu'indique l'application enfreint nos règles, et vous devez le signaler — un lien est prévu à la fin de chaque course.",
        "Vous pouvez payer en espèces ou par mobile money. Si vous payez en espèces, remettez au chauffeur exactement le montant affiché.",
        "Les prix évoluent à mesure que nous apprenons ce que coûte réellement un trajet. Un changement ne s'applique jamais à une course déjà réservée.",
      ],
    },
    {
      heading: "Annuler",
      body: [
        "Vous pouvez annuler sans frais tant que le chauffeur n'est pas arrivé. Si vous annulez à répétition une fois les chauffeurs en route, nous pourrons cesser de vous proposer des courses — son carburant et son temps sont bien réels.",
        "Un chauffeur qui accepte et ne vient pas, c'est notre problème, pas le vôtre. Dites-le-nous et nous nous en occuperons.",
      ],
    },
    {
      heading: "Conduire avec nous",
      body: [
        "Pour transporter des passagers payants, il vous faut une licence S10. C'est la loi, pas une règle maison, et nous ne pouvons vous envoyer aucune course sans le numéro figurant sur votre carte.",
        "Avant votre validation, nous vérifions votre carte nationale d'identité, la carte grise du véhicule et votre photographie. Vous devez être la personne des documents, et le taxi doit être celui de la carte grise.",
        "Gardez vos papiers à jour. Si votre licence expire, dites-le-nous et arrêtez de rouler jusqu'à son renouvellement.",
      ],
    },
    {
      heading: "Ce que vous nous payez",
      body: [
        "Des frais d'accès journaliers fixes, facturés uniquement pour un jour réellement travaillé. Nous ne prenons aucun pourcentage sur vos courses.",
        "C'est un choix. Prélever une commission sur une course à 700 francs, c'est le genre d'arrangement qui pousse un homme à quitter l'application et à retourner au bord de la route ; nous préférons un petit montant fixe et vous garder.",
        "La course vous revient. Si le passager paie en espèces, vous gardez l'argent. Les frais se règlent séparément.",
        "Rien n'est facturé pour un jour non travaillé. Les lundis sont calmes à Buea, et nous le savons.",
      ],
    },
    {
      heading: "Comment se conduire",
      body: [
        "Pour vous deux, clairement : pas de menaces, pas de harcèlement, pas de refus de quelqu'un pour ce qu'il est.",
        "Passagers : soyez là où vous avez dit, et payez ce qui a été convenu.",
        "Chauffeurs : faites la course que vous avez acceptée, au prix affiché, par un itinéraire raisonnable. Ne demandez pas davantage. Ne prenez pas d'autres passagers sur une course réservée par quelqu'un.",
        "Nous pouvons suspendre un compte qui enfreint ces règles. Un chauffeur suspendu en est informé, avec le motif, et cela reste à son dossier.",
      ],
    },
    {
      heading: "Sécurité",
      body: [
        "Vérifiez la plaque contre celle de l'application avant de monter. Donnez au chauffeur le code à quatre chiffres — il ne peut pas démarrer la course sans lui, et c'est ainsi que vous savez tous les deux que vous avez la bonne personne.",
        "Un bouton d'urgence est présent sur toute course en cours. En appuyant, vous nous envoyez votre position, et quelqu'un vous appelle.",
        "Vous pouvez envoyer un lien à un proche pour qu'il suive la course. Le lien expire, et vous pouvez le révoquer.",
      ],
    },
    {
      heading: "Quand quelque chose se passe mal",
      body: [
        "Dites-le-nous à la fin de la course, ou depuis votre compte. Une personne le lit et vous répond dans la journée.",
        "Si nous nous trompons, dites-le et nous réexaminerons.",
      ],
    },
    {
      heading: "Ce dont nous ne répondons pas",
      body: [
        "Nous organisons la course ; nous ne la conduisons pas et le taxi ne nous appartient pas. Le chauffeur répond de son véhicule, de sa licence, de son assurance et de sa conduite.",
        "Nous ne promettons pas qu'un taxi sera toujours disponible. Parfois personne n'est près de vous, et l'application vous le dira plutôt que de vous laisser attendre.",
        "Rien ici ne vous retire un droit que vous tenez de la loi camerounaise, et rien ici ne limite notre responsabilité en cas de décès ou de blessure causés par notre propre faute.",
      ],
    },
    {
      heading: "Mettre fin",
      body: [
        "Vous pouvez cesser d'utiliser Fako Ride à tout moment et nous demander de fermer votre compte.",
        "Nous pouvons fermer un compte qui enfreint ces conditions, et nous vous dirons pourquoi.",
      ],
    },
    {
      heading: "Le droit applicable",
      body: [
        "Ces conditions relèvent du droit de la République du Cameroun, et les litiges relèvent des tribunaux du département du Fako.",
        "Écrivez-nous à hello@fakoride.cm.",
      ],
    },
  ],
};

export const TERMS = { en, fr } as const;

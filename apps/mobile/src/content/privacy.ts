/**
 * The privacy policy, in both languages.
 *
 * Every item under "what we keep" is a column that exists in the database, and
 * the photograph rules are the ones the API actually enforces. The French says
 * the same things and is held to the same standard: it is not a softened
 * version for people who will not read the English.
 *
 * Law No. 2024/017 gives a person the right to know what is held about them.
 * A policy they cannot read does not discharge that.
 */

import type { LegalDoc } from "./terms";

const en: LegalDoc = {
  title: "Privacy",
  updated: "21 September 2026",
  intro:
    "What we keep about you, who can see it, and what you can make us do about it. It is written plainly on purpose — a policy nobody can read is not consent, it is paperwork.",
  footer:
    "This is a draft. It describes what the app actually does today, but it has not yet been reviewed by a lawyer in Cameroon and must be before Fako Ride opens to the public.",
  sections: [
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
  ],
};

const fr: LegalDoc = {
  title: "Confidentialité",
  updated: "21 septembre 2026",
  intro:
    "Ce que nous conservons sur vous, qui peut le voir, et ce que vous pouvez nous obliger à en faire. Écrit simplement, volontairement : une politique que personne ne peut lire n'est pas un consentement, c'est de la paperasse.",
  footer:
    "Ceci est un projet. Il décrit ce que l'application fait réellement aujourd'hui, mais il n'a pas encore été relu par un avocat au Cameroun, et devra l'être avant l'ouverture de Fako Ride au public.",
  sections: [
    {
      heading: "Qui nous sommes",
      body: [
        "Fako Ride est un service de réservation de taxis pour le département du Fako — Buea et les villes alentour. Nous mettons en relation des passagers et des chauffeurs de taxi, à un prix que vous voyez tous les deux avant le départ.",
        "Nous sommes responsables du traitement des informations décrites ici. Pour nous joindre au sujet de cette page, les coordonnées figurent à la fin.",
      ],
    },
    {
      heading: "Ce que nous conservons, et pourquoi",
      body: [
        "Pour toute personne qui se connecte :",
        "• Votre numéro de téléphone. C'est ainsi que vous vous connectez, et c'est la seule identité qui fonctionne ici — nous ne demandons ni adresse e-mail ni mot de passe.",
        "• Votre nom, pour que le chauffeur sache qui il cherche, et la langue dans laquelle vous voulez que nous vous écrivions.",
        "• Une photographie de vous, si vous choisissez d'en ajouter une. C'est facultatif et vous pouvez la retirer à tout moment.",
        "Pour les passagers, au moment de réserver :",
        "• Où vous êtes lorsque vous demandez un taxi, afin de vous en envoyer un qui soit proche.",
        "• Chaque course : le lieu de prise en charge et de dépose, le prix, le mode de paiement, l'heure, et le code à quatre chiffres de cette course.",
        "Pour les chauffeurs, parce que la loi et le métier l'exigent :",
        "• Votre plaque d'immatriculation, le numéro de votre carte nationale d'identité et celui de votre licence S10. Une course payante ne peut légalement être confiée à un chauffeur sans S10 ; nous devons donc le conserver.",
        "• Les photographies de votre carte nationale d'identité, de votre carte grise et de vous-même. Elles sont vérifiées par une personne avant votre validation.",
        "• Votre position, en continu, tant que vous êtes en ligne et disponible. Dès que vous vous mettez hors ligne nous arrêtons, et votre dernière position est supprimée plutôt que conservée.",
        "• Ce que vous avez gagné, ce qui vous a été versé, et les frais d'accès journaliers de chaque jour travaillé.",
        "Pour tout le monde, quand quelque chose se passe mal :",
        "• Les réclamations que vous nous envoyez, et ce que nous avons répondu.",
        "• Les alertes d'urgence : où vous étiez au moment où vous avez appuyé, ce que vous nous avez dit, et ce que nous avons fait.",
        "Paiements :",
        "• Le numéro mobile money utilisé, le montant, et la référence renvoyée par l'opérateur. Nous ne voyons ni ne conservons jamais votre code secret mobile money — il reste entre vous et MTN ou Orange.",
      ],
    },
    {
      heading: "Qui peut voir votre photographie",
      body: [
        "C'est la partie qui mérite d'être lue attentivement, car un visage est ce qu'il y a de plus personnel dans l'application.",
        "• Vous pouvez toujours voir la vôtre.",
        "• L'autre personne de votre course — votre chauffeur, ou votre passager — peut voir la vôtre pendant que cette course est en cours, et seulement à ce moment-là. Dès que la course se termine, la porte se referme.",
        "• Personne d'autre ne peut la voir. Il n'existe aucun lien vers elle, aucune adresse publique, et aucun moyen d'y accéder sans être connecté en tant que l'une de ces deux personnes.",
        "Les pièces d'identité d'un chauffeur relèvent d'un autre régime : elles sont vérifiées par notre personnel avant sa validation, et ne sont jamais montrées aux passagers.",
      ],
    },
    {
      heading: "À qui d'autre nous transmettons des informations",
      body: [
        "Nous ne vendons vos informations à personne, et nous ne les utilisons pas pour vous adresser de la publicité.",
        "Nous ne partageons que le nécessaire, avec :",
        "• Votre chauffeur ou votre passager, pendant une course : un nom, une photographie si vous en avez ajouté une, un numéro de téléphone pour vous appeler, et la plaque.",
        "• Toute personne à qui vous envoyez un lien de suivi. C'est votre choix, le lien expire, et vous pouvez le révoquer.",
        "• L'opérateur de mobile money, pour qu'un paiement puisse être effectué.",
        "• La police ou un tribunal, si la loi nous y oblige — et nous vous le dirons lorsque nous avons le droit de vous le dire.",
      ],
    },
    {
      heading: "Combien de temps nous les gardons",
      body: [
        "Les courses, les réclamations et les alertes d'urgence sont conservées tant que le compte existe, car un litige sur un tarif ou un incident peut survenir des semaines plus tard et nous ne vous serions alors d'aucune utilité.",
        "Les documents d'un chauffeur sont conservés tant qu'il roule avec nous, et ensuite aussi longtemps que nous sommes tenus de les garder.",
        "Votre photographie est conservée jusqu'à ce que vous la retiriez. Quand vous la retirez, le fichier lui-même est supprimé, pas seulement masqué.",
        "La position d'un chauffeur en ligne n'est pas un historique. Elle est écrasée à mesure qu'il se déplace et supprimée dès qu'il se met hors ligne.",
      ],
    },
    {
      heading: "Vos droits",
      body: [
        "En vertu du droit camerounais — la loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel — vous pouvez nous demander de :",
        "• Vous montrer ce que nous détenons à votre sujet.",
        "• Corriger ce qui est inexact. Votre nom vous appartient et se modifie dans l'application à tout moment.",
        "• Supprimer votre compte et ce que nous détenons, sauf ce que nous sommes tenus de conserver.",
        "• Vous remettre une copie que vous pouvez emporter ailleurs.",
        "• Cesser un traitement qui repose sur votre accord, en le retirant.",
        "Demandez-nous et nous répondrons. Si la réponse ne vous satisfait pas, vous pouvez saisir l'autorité nationale de protection des données.",
      ],
    },
    {
      heading: "Où vos informations sont stockées",
      body: [
        "Certains des services que nous utilisons pour faire fonctionner l'application stockent des informations hors du Cameroun. Dans ce cas, nous sommes tenus d'obtenir une autorisation de transfert, et nous nommerons ici ces services et leurs emplacements avant l'ouverture de l'application au public.",
        "Nous préférons vous le dire franchement plutôt que de l'omettre.",
      ],
    },
    {
      heading: "Les garder en sécurité",
      body: [
        "Votre session est conservée dans le stockage sécurisé de votre téléphone, pas dans un fichier qu'une autre application pourrait lire.",
        "Les pièces d'identité et les photographies ne sont jamais servies depuis une adresse publique. Chaque demande est vérifiée au regard de qui vous êtes et de ce que vous avez le droit de voir.",
        "Si un incident survient et que vos informations sont exposées, nous sommes tenus de le signaler, et nous vous le dirons.",
      ],
    },
    {
      heading: "Les enfants",
      body: [
        "Fako Ride n'est pas destiné aux enfants. Il faut avoir au moins 18 ans pour détenir un compte, que vous soyez passager ou chauffeur.",
      ],
    },
    {
      heading: "Modifications, et nous joindre",
      body: [
        "Si nous modifions ce texte, nous le dirons dans l'application plutôt que de mettre à jour discrètement une page que personne ne consulte.",
        "Écrivez-nous à privacy@fakoride.cm, ou appelez le numéro indiqué sur l'écran d'assistance.",
      ],
    },
  ],
};

export const PRIVACY = { en, fr } as const;

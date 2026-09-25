/**
 * Every word the app says, in both languages.
 *
 * Grouped by the screen that shows it, because that is how you check a screen
 * is fully translated: read one block, not a flat list of four hundred keys.
 *
 * The French is Cameroonian usage, not a dictionary rendering. A trip is *une
 * course*, a driver on a taxi is *le chauffeur*, money is in *FCFA*, and the
 * daily charge is *les frais journaliers* — what a man would actually be told
 * at a motor park.
 *
 * `{n}`, `{place}` and the like are filled by `t()`.
 */

import type { Phrase } from "@/ui/i18n";

const p = (en: string, fr: string): Phrase => ({ en, fr });

export const S = {
  welcome: {
    tagline: p(
      "Taxi rides across Buea at a fixed price. You see the fare before you book.",
      "Des courses en taxi à travers Buea à prix fixe. Vous voyez le tarif avant de réserver.",
    ),
    checked: p(
      "Every driver is checked before they drive",
      "Chaque chauffeur est vérifié avant de conduire",
    ),
    asRider: p("Continue as a rider", "Continuer en tant que passager"),
    asDriver: p("I drive a taxi", "Je conduis un taxi"),
    agree: p("By continuing you agree to our", "En continuant, vous acceptez nos"),
    terms: p("Terms", "Conditions"),
    and: p("and", "et"),
    privacy: p("Privacy Policy", "Politique de confidentialité"),
  },

  signIn: {
    askNumber: p("What's your number?", "Quel est votre numéro ?"),
    askNumberWhy: p(
      "We'll send you a 6-digit code to confirm it's really you. No password to remember.",
      "Nous vous enverrons un code à 6 chiffres pour confirmer que c'est bien vous. Aucun mot de passe à retenir.",
    ),
    mobileNumber: p("Mobile number", "Numéro de téléphone"),
    networks: p(
      "MTN, Orange and Camtel numbers all work. Standard SMS rates from your network may apply.",
      "Les numéros MTN, Orange et Camtel fonctionnent tous. Les tarifs SMS habituels de votre opérateur peuvent s'appliquer.",
    ),
    sendCode: p("Send me the code", "Envoyez-moi le code"),
    sixDigits: p("Six-digit code", "Code à six chiffres"),
    signIn: p("Sign in", "Se connecter"),
    otherNumber: p("Use a different number", "Utiliser un autre numéro"),
    devHint: p("No SMS in development. Tap to fill:", "Pas de SMS en développement. Touchez pour remplir :"),
    goBack: p("Go back", "Retour"),
    enterCode: p("Enter your code", "Entrez votre code"),
    sentTo: p("Sent by SMS to", "Envoyé par SMS au"),
    changeNumber: p("Change number", "Changer de numéro"),
    codeLabel: p("6-digit code", "Code à 6 chiffres"),
    sixDigitCode: p("Six digit code", "Code à six chiffres"),
    yourName: p("Your name", "Votre nom"),
    namePlaceholder: p("Tazanu Stanley", "Tazanu Stanley"),
    nameHint: p(
      "A first name is enough. Drivers see this when they accept your ride.",
      "Un prénom suffit. Les chauffeurs le voient quand ils acceptent votre course.",
    ),
    verify: p("Verify and continue", "Vérifier et continuer"),
    phonePlaceholder: p("6 72 48 84 17", "6 72 48 84 17"),

    /* Chosen from the API's `code`, never from its English message. */
    badPhone: p(
      "Enter a Cameroon number, like 6 70 00 00 00.",
      "Entrez un numéro camerounais, par exemple 6 70 00 00 00.",
    ),
    tooManyCodes: p(
      "Too many codes asked for. Try again in an hour.",
      "Trop de codes demandés. Réessayez dans une heure.",
    ),
    wrongCode: p("That code is not right.", "Ce code n'est pas correct."),
    codeExpired: p(
      "That code has expired. Ask for a new one.",
      "Ce code a expiré. Demandez-en un nouveau.",
    ),
    smsUnavailable: p(
      "We cannot send codes right now. Try again shortly.",
      "Nous ne pouvons pas envoyer de code pour l'instant. Réessayez sous peu.",
    ),
    noNetwork: p(
      "No network. Check your connection and try again.",
      "Pas de réseau. Vérifiez votre connexion et réessayez.",
    ),
    wentWrong: p("Something went wrong. Try again.", "Une erreur s'est produite. Réessayez."),
  },

  home: {
    where: p("Where are you going?", "Où allez-vous ?"),
    search: p("Search for a place", "Chercher un lieu"),
    noMatch: p("No place here matches", "Aucun lieu ne correspond à"),
    oneTaxi: p("{n} taxi near you", "{n} taxi près de vous"),
    manyTaxis: p("{n} taxis near you", "{n} taxis près de vous"),
    noTaxis: p("No taxis near you", "Aucun taxi près de vous"),
    account: p("Your account", "Votre compte"),
    recentre: p("Centre on my location", "Centrer sur ma position"),
    onceBefore: p("{n} time", "{n} fois"),
    manyBefore: p("{n} times", "{n} fois"),
    upTheHill: p("up the hill", "en montée"),
    driveWithUs: p("Drive with Fako Ride", "Conduisez avec Fako Ride"),
    driveWithUsWhy: p(
      "Own a taxi? Carry riders and keep every franc of the fare.",
      "Vous avez un taxi ? Transportez des passagers et gardez chaque franc de la course.",
    ),
    goTo: p("Go to {place}", "Aller à {place}"),
    placeAndFare: p("{place}, {n} francs", "{place}, {n} francs"),

    needLocation: p(
      "We need your location to know where to send the taxi.",
      "Nous avons besoin de votre position pour savoir où envoyer le taxi.",
    ),
    turnOnLocation: p(
      "We could not find you. Check that location is on, then pull down.",
      "Nous ne vous trouvons pas. Vérifiez que la localisation est activée, puis tirez vers le bas.",
    ),
    pullDown: p(
      "We could not find you. Pull down to try again.",
      "Nous ne vous trouvons pas. Tirez vers le bas pour réessayer.",
    ),
    offlinePullDown: p(
      "No network. Pull down to try again.",
      "Pas de réseau. Tirez vers le bas pour réessayer.",
    ),
    whereAreYou: p(
      "We could not work out where you are.",
      "Nous n'arrivons pas à déterminer où vous êtes.",
    ),
  },

  account: {
    title: p("Your account", "Votre compte"),
    addPhoto: p("Add your photo", "Ajoutez votre photo"),
    changePhoto: p("Change your photo", "Changez votre photo"),
    photoPrivateNone: p(
      "Add a photo so the driver can find you in a crowd at the park. Only he sees it, and only during your trip.",
      "Ajoutez une photo pour que le chauffeur vous trouve dans la foule au parc. Lui seul la voit, et seulement pendant votre course.",
    ),
    photoPrivateSet: p(
      "Only the driver coming for you can see this, and only while the trip is running.",
      "Seul le chauffeur qui vient vous chercher peut la voir, et seulement pendant la course.",
    ),
    removePhoto: p("Remove photo", "Retirer la photo"),
    yourName: p("Your name", "Votre nom"),
    namePlaceholder: p(
      "The name a driver should call you",
      "Le nom par lequel un chauffeur doit vous appeler",
    ),
    saveName: p("Save name", "Enregistrer le nom"),
    saved: p("Saved.", "Enregistré."),
    language: p("Language", "Langue"),
    languageWhy: p(
      "The app and anything we write to you.",
      "L'application et tout ce que nous vous écrivons.",
    ),
    phone: p("Phone", "Téléphone"),
    plate: p("Plate", "Plaque"),
    vehicle: p("Vehicle", "Véhicule"),
    taxi: p("Taxi", "Taxi"),
    moto: p("Moto", "Moto"),
    rating: p("Rating", "Note"),
    ratingOf: p("{n} of 5", "{n} sur 5"),
    trips: p("Trips", "Courses"),
    reports: p("What you told us", "Ce que vous nous avez dit"),
    reportsWhy: p(
      "Reports you sent, and what came back",
      "Vos signalements, et les réponses reçues",
    ),
    signOut: p("Sign out", "Se déconnecter"),
  },

  /**
   * What a complaint is about.
   *
   * Shared: the rider picks one at the end of a trip and reads it back on the
   * reports screen, and the two lists must say the same words.
   */
  category: {
    FARE_DISPUTE: p("The fare", "Le tarif"),
    DRIVER_CONDUCT: p("The driver", "Le chauffeur"),
    RIDER_CONDUCT: p("The rider", "Le passager"),
    SAFETY: p("Safety", "La sécurité"),
    LOST_ITEM: p("Something left behind", "Un oubli dans le taxi"),
    APP_PROBLEM: p("The app", "L'application"),
    OTHER: p("Something else", "Autre chose"),
  },

  reports: {
    title: p("What you told us", "Ce que vous nous avez dit"),
    nothing: p(
      "Nothing yet. If a ride goes wrong, there is a link at the end of it — a person reads what you send and answers within a day.",
      "Rien pour le moment. Si une course se passe mal, un lien apparaît à la fin — une personne lit ce que vous envoyez et répond dans la journée.",
    ),
    waiting: p(
      "A person is reading this. Answer within a day.",
      "Une personne le lit. Réponse sous un jour.",
    ),
    lateStill: p(
      "Still no answer — {late}. We are sorry. It is still on the list.",
      "Toujours pas de réponse — {late}. Nous en sommes désolés. C'est toujours sur la liste.",
    ),
    loading: p("Loading…", "Chargement…"),
    couldNotLoad: p("Could not load these right now.", "Impossible de charger pour le moment."),
    offlinePullDown: p(
      "No network. Pull down to try again.",
      "Pas de réseau. Tirez vers le bas pour réessayer.",
    ),
    fromUs: p("Fako Ride", "Fako Ride"),
    /* How late we are, said plainly rather than hidden. */
    lateHour: p("{n} hour past when we said", "{n} heure de retard sur ce que nous avions dit"),
    lateHours: p("{n} hours past when we said", "{n} heures de retard sur ce que nous avions dit"),
    lateDay: p("{n} day past when we said", "{n} jour de retard sur ce que nous avions dit"),
    lateDays: p("{n} days past when we said", "{n} jours de retard sur ce que nous avions dit"),
  },

  when: {
    justNow: p("just now", "à l'instant"),
    today: p("today", "aujourd'hui"),
    yesterday: p("yesterday", "hier"),
    daysAgo: p("{n} days ago", "il y a {n} jours"),
    aWeekAgo: p("a week ago", "il y a une semaine"),
    weeksAgo: p("{n} weeks ago", "il y a {n} semaines"),
  },

  errors: {
    offline: p(
      "No network. Try again when you have signal.",
      "Pas de réseau. Réessayez quand vous aurez du signal.",
    ),
    generic: p("That did not work. Try again.", "Cela n'a pas fonctionné. Réessayez."),
  },
} as const;

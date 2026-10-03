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
    mapOfArea: p("Map of your area", "Carte de votre quartier"),
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
    rateLimited: p(
      "Too many tries from this connection. Wait a few minutes and try again.",
      "Trop d'essais depuis cette connexion. Attendez quelques minutes et réessayez.",
    ),
    tooManyAttempts: p(
      "Too many wrong codes. Ask for a new one.",
      "Trop de codes erronés. Demandez-en un nouveau.",
    ),
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
    goToFor: p("Go to {place}, {n} francs", "Aller à {place}, {n} francs"),
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
    signOutElsewhere: p("Sign out on every other phone", "Se déconnecter sur tous les autres téléphones"),
    signOutElsewhereAsk: p("Sign out everywhere else?", "Se déconnecter partout ailleurs ?"),
    signOutElsewhereWhy: p(
      "For a phone that was lost or stolen, or one you left signed in. It is signed out at once and stops receiving your rides. This phone stays signed in.",
      "Pour un téléphone perdu ou volé, ou resté connecté. Il est déconnecté aussitôt et ne reçoit plus vos courses. Ce téléphone reste connecté.",
    ),
    signOutElsewhereDo: p("Sign them out", "Les déconnecter"),
    signOutElsewhereDone: p(
      "Done. Every other phone is signed out.",
      "C'est fait. Tous les autres téléphones sont déconnectés.",
    ),
    saving: p("Saving…", "Enregistrement…"),
    english: p("English", "English"),
    french: p("Français", "Français"),
    terms: p("Terms", "Conditions"),
    privacyShort: p("Privacy", "Confidentialité"),

    photoAsk: p("Your photo", "Votre photo"),
    photoAskWhy: p(
      "The driver coming for you sees this, and nobody else.",
      "Le chauffeur qui vient vous chercher la voit, et personne d'autre.",
    ),
    takeOne: p("Take one now", "En prendre une maintenant"),
    chooseOne: p("Choose from photos", "Choisir dans la galerie"),
    cancel: p("Cancel", "Annuler"),
    removeAsk: p("Remove your photo?", "Retirer votre photo ?"),
    removeWhy: p(
      "Drivers will have only your name to go on.",
      "Les chauffeurs n'auront que votre nom.",
    ),
    remove: p("Remove", "Retirer"),

    offline: p(
      "No network. Try again when you have signal.",
      "Pas de réseau. Réessayez quand vous aurez du signal.",
    ),
    notAnImage: p(
      "That file is not a photo. Take one with the camera.",
      "Ce fichier n'est pas une photo. Prenez-en une avec l'appareil.",
    ),
    tooLarge: p(
      "That photo is too big. Take a new one rather than sending an original.",
      "Cette photo est trop grande. Reprenez-en une plutôt que d'envoyer l'originale.",
    ),
    didNotWork: p("That did not work. Try again.", "Cela n'a pas fonctionné. Réessayez."),
    needCamera: p(
      "We need the camera to take your photo.",
      "Nous avons besoin de l'appareil photo pour prendre votre photo.",
    ),
    needPhotos: p(
      "We need permission to open your photos.",
      "Nous avons besoin de votre autorisation pour ouvrir vos photos.",
    ),
    nameTooShort: p(
      "Type the name a driver should call you.",
      "Écrivez le nom par lequel un chauffeur doit vous appeler.",
    ),
  },

  confirm: {
    back: p("Back", "Retour"),
    findingYou: p("Finding you…", "Localisation en cours…"),
    yourFare: p("Your fare", "Votre tarif"),
    upTheHill: p("up the hill", "en montée"),
    fixedPrice: p(
      "Fixed price. Your driver cannot ask for more.",
      "Prix fixe. Votre chauffeur ne peut pas demander plus.",
    ),
    payWith: p("Pay with", "Payer avec"),
    cash: p("Cash", "Espèces"),
    momo: p("MoMo", "MoMo"),
    orange: p("Orange", "Orange"),
    phoneSaves: p(
      "Paying by phone saves you {n} FCFA — it costs us less too.",
      "Payer par téléphone vous fait économiser {n} FCFA — cela nous coûte moins cher aussi.",
    ),
    womanDriver: p("Woman driver", "Femme au volant"),
    womanDriverOnly: p("Woman driver only", "Femme au volant uniquement"),
    findTaxi: p("Find me a taxi", "Trouvez-moi un taxi"),

    offline: p("No network. Try again in a moment.", "Pas de réseau. Réessayez dans un instant."),
    noFare: p(
      "We do not have a price for that trip yet.",
      "Nous n'avons pas encore de tarif pour ce trajet.",
    ),
    alreadyRiding: p("You already have a ride running.", "Vous avez déjà une course en cours."),
    rateLimited: p(
      "That is a lot of bookings in a short time. Wait a few minutes.",
      "Cela fait beaucoup de réservations en peu de temps. Attendez quelques minutes.",
    ),
    didNotWork: p("That did not work. Try again.", "Cela n'a pas fonctionné. Réessayez."),
    needCamera: p(
      "We need the camera to take your photo.",
      "Nous avons besoin de l'appareil photo pour prendre votre photo.",
    ),
    needPhotos: p(
      "We need permission to open your photos.",
      "Nous avons besoin de votre autorisation pour ouvrir vos photos.",
    ),
    nameTooShort: p(
      "Type the name a driver should call you.",
      "Écrivez le nom par lequel un chauffeur doit vous appeler.",
    ),
  },

  /**
   * The driver's side.
   *
   * He is a taxi man at a junction with the phone in one hand. Short lines,
   * and the money said in full francs rather than rounded.
   */
  driver: {
    online: p("You're online", "Vous êtes en ligne"),
    offline: p("You're offline", "Vous êtes hors ligne"),
    goOnline: p("Go online", "Se mettre en ligne"),
    goOffline: p("Go offline", "Se mettre hors ligne"),

    today: p("Today", "Aujourd'hui"),
    ridesToday: p("Rides today", "Courses aujourd'hui"),
    yourRating: p("Your rating", "Votre note"),
    myMoney: p("My money", "Mon argent"),
    account: p("Your account", "Votre compte"),

    feePaid: p("Today's fee paid — {amount} FCFA", "Frais du jour payés — {amount} FCFA"),
    feeDue: p(
      "Today's fee — {amount} FCFA, taken tomorrow morning",
      "Frais du jour — {amount} FCFA, prélevés demain matin",
    ),

    newRide: p("NEW RIDE REQUEST", "NOUVELLE DEMANDE"),
    payCash: p("cash", "espèces"),
    payPhone: p("by phone", "par téléphone"),
    metresAway: p("{n} m away", "à {n} m"),
    kmAway: p("{n} km away", "à {n} km"),
    decline: p("Decline", "Refuser"),
    leaveRide: p("Leave this ride", "Laisser cette course"),
    accept: p("Accept ride", "Accepter la course"),
    acceptFor: p("Accept this ride for {n} francs", "Accepter cette course pour {n} francs"),

    needLocation: p(
      "We need your location to send you rides nearby.",
      "Nous avons besoin de votre position pour vous envoyer les courses proches.",
    ),
    turnOnLocation: p(
      "We could not find you. Check that location is on.",
      "Nous ne vous trouvons pas. Vérifiez que la localisation est activée.",
    ),
    offlineMoment: p("No network. Try again in a moment.", "Pas de réseau. Réessayez dans un instant."),
    offlinePullDown: p(
      "No network. Pull down to try again.",
      "Pas de réseau. Tirez vers le bas pour réessayer.",
    ),
    noNetwork: p("No network.", "Pas de réseau."),
    didNotWork: p("That did not work.", "Cela n'a pas fonctionné."),
    didNotWorkTryAgain: p("That did not work. Try again.", "Cela n'a pas fonctionné. Réessayez."),
  },

  /**
   * The ride he is carrying.
   *
   * Said in the second person to a man driving: short lines, one action on the
   * screen at a time, and the money stated before anything else.
   */
  job: {
    goGetHer: p("Go and get her", "Allez la chercher"),
    pickingUp: p("Picking up {name}", "Vous prenez {name}"),
    pickingUpRider: p("Picking up your rider", "Vous prenez votre passager"),
    lookFor: p("Look for this face at the pickup.", "Cherchez ce visage au point de départ."),
    youAreThere: p("You are there", "Vous y êtes"),
    carryingHer: p("Carrying her now", "Course en cours"),
    finished: p("Ride finished", "Course terminée"),
    over: p("This ride is over", "Cette course est terminée"),

    paysCash: p("She pays you cash", "Elle vous paie en espèces"),
    paidMomo: p("Paid by MTN MoMo", "Payé par MTN MoMo"),
    paidOrange: p("Paid by Orange Money", "Payé par Orange Money"),

    pickUp: p("PICK UP", "PRISE EN CHARGE"),
    drop: p("DROP", "DÉPOSE"),
    spareHelmet: p("Give her your spare helmet", "Donnez-lui votre casque de réserve"),

    iAmHere: p("I AM HERE", "JE SUIS ARRIVÉ"),
    askHerNumber: p("Ask her for her number", "Demandez-lui son numéro"),
    askHerNumberWhy: p(
      "She has four digits on her phone. Do not start until she reads them to you.",
      "Elle a quatre chiffres sur son téléphone. Ne démarrez pas avant qu'elle vous les lise.",
    ),
    herFourDigits: p("Her four digit number", "Son numéro à quatre chiffres"),
    startRide: p("START THE RIDE", "DÉMARRER LA COURSE"),
    finishRide: p("FINISH RIDE", "TERMINER LA COURSE"),
    done: p("DONE", "TERMINÉ"),

    takeCash: p(
      "Take the fare in cash. It is yours — we take nothing from it.",
      "Prenez le tarif en espèces. Il est à vous — nous n'en prenons rien.",
    ),
    paidByPhone: p(
      "Paid by phone. It lands in your balance.",
      "Payé par téléphone. Cela arrive dans votre solde.",
    ),

    callHer: p("Call her", "L'appeler"),
    dropRide: p("Drop this ride", "Abandonner cette course"),
    getHelp: p("GET HELP", "DEMANDER DE L'AIDE"),
    getHelpLabel: p("Get help", "Demander de l'aide"),

    sheCancelled: p("She cancelled", "Elle a annulé"),
    sheCancelledWhy: p("The rider called this ride off.", "La passagère a annulé cette course."),
    ok: p("OK", "OK"),
    dropAsk: p("Drop this ride?", "Abandonner cette course ?"),
    dropWhy: p(
      "She is waiting for you. Only do this if you truly cannot reach her.",
      "Elle vous attend. Ne faites cela que si vous ne pouvez vraiment pas la rejoindre.",
    ),
    keepIt: p("Keep it", "La garder"),
    dropIt: p("Drop it", "L'abandonner"),

    wrongPin: p(
      "That is not the number she has. Ask her to read it again.",
      "Ce n'est pas le numéro qu'elle a. Demandez-lui de le relire.",
    ),
    movedOn: p(
      "This ride has moved on. Pull down to refresh.",
      "Cette course a changé d'état. Tirez vers le bas pour actualiser.",
    ),
  },

  /**
   * The driver's money.
   *
   * The whole argument for this app over the roadside is a small fixed fee and
   * nothing else, which is a claim he should be able to check rather than take
   * on trust. So every figure here is said in full, including the ones that
   * are not in our favour.
   */
  money: {
    back: p("Back", "Retour"),
    title: p("My money", "Mon argent"),
    thisWeek: p("This week · {from} to {to}", "Cette semaine · du {from} au {to}"),
    earned: p("FCFA earned", "FCFA gagnés"),

    /* Derived from the date on the device: the API sends English days. */
    sun: p("Sun", "Dim"),
    mon: p("Mon", "Lun"),
    tue: p("Tue", "Mar"),
    wed: p("Wed", "Mer"),
    thu: p("Thu", "Jeu"),
    fri: p("Fri", "Ven"),
    sat: p("Sat", "Sam"),

    barGhost: p(
      "{day}, ghost town, you did not work",
      "{day}, ville morte, vous n'avez pas travaillé",
    ),
    barDay: p(
      "{day}, {amount} francs from {rides} rides",
      "{day}, {amount} francs pour {rides} courses",
    ),
    ghostNote: p(
      "A quiet Monday never counts against you.",
      "Un lundi calme ne vous sera jamais reproché.",
    ),

    feeTitle: p("500 FCFA a day, nothing per ride", "500 FCFA par jour, rien par course"),
    feeBody: p(
      "Taken from your MoMo each morning you work.",
      "Prélevés sur votre MoMo chaque matin où vous travaillez.",
    ),
    feeFigureOne: p(
      "{paid} of {worked} day paid — {fees} FCFA. You kept {kept} FCFA.",
      "{paid} jour sur {worked} payé — {fees} FCFA. Vous avez gardé {kept} FCFA.",
    ),
    feeFigureMany: p(
      "{paid} of {worked} days paid — {fees} FCFA. You kept {kept} FCFA.",
      "{paid} jours sur {worked} payés — {fees} FCFA. Vous avez gardé {kept} FCFA.",
    ),

    holding: p("We are holding for you", "Nous gardons pour vous"),
    cashIsYours: p(
      "Cash fares are already yours. This is only what we are holding.",
      "Les courses payées en espèces sont déjà à vous. Ceci n'est que ce que nous gardons.",
    ),
    stillToCollect: p(
      "{amount} FCFA of fees still to collect.",
      "{amount} FCFA de frais restent à prélever.",
    ),
    sendMomo: p("Send it to my MoMo", "Envoyer sur mon MoMo"),
    sendMomoLoud: p("SEND IT TO MY MOMO", "ENVOYER SUR MON MOMO"),
    nothingToSend: p(
      "Cash fares are already in your pocket — there is nothing for us to send.",
      "Les courses en espèces sont déjà dans votre poche — nous n'avons rien à envoyer.",
    ),

    onItsWay: p("On its way to your MoMo.", "En route vers votre MoMo."),
    couldNotSend: p("Could not send it", "Envoi impossible"),
    didNotGoThrough: p("That did not go through.", "Cela n'est pas passé."),
    refused: p(
      "Your mobile money service refused it. Try again later.",
      "Votre service mobile money l'a refusé. Réessayez plus tard.",
    ),

    /* The record underneath. */
    everyFranc: p("Every franc in and out", "Chaque franc qui entre et qui sort"),
    nothingYet: p(
      "Nothing yet. Your daily fee and anything we send you will be listed here.",
      "Rien pour le moment. Vos frais journaliers et tout ce que nous vous envoyons apparaîtront ici.",
    ),
    dailyFee: p("Daily fee", "Frais journaliers"),
    sentToMomo: p("Sent to your MoMo", "Envoyé sur votre MoMo"),
    farePaidByPhone: p("Fare paid by phone", "Course payée par téléphone"),
    stateDone: p("Done", "Fait"),
    stateOnItsWay: p("On its way", "En route"),
    stateFailed: p("Did not go through", "N'est pas passé"),
    stateExpired: p("Timed out", "Délai dépassé"),
    today: p("Today", "Aujourd'hui"),
    yesterday: p("Yesterday", "Hier"),
  },

  trip: {
    /* The line in the pill over the map. */
    looking: p("Looking for a taxi", "Recherche d'un taxi"),
    coming: p("Your taxi is on the way", "Votre taxi arrive"),
    outside: p("Your taxi is outside", "Votre taxi est dehors"),
    riding: p("On the way", "En route"),
    arrived: p("You have arrived", "Vous êtes arrivé"),
    nobodyTook: p("Nobody took this one", "Personne n'a pris cette course"),
    heDropped: p("He dropped the ride", "Le chauffeur a abandonné la course"),
    over: p("This ride is over", "Cette course est terminée"),

    usuallyQuick: p(
      "Usually under 4 minutes on this road.",
      "Généralement moins de 4 minutes sur cette route.",
    ),
    noTaxiTook: p(
      "No taxi took this one. Nothing has been charged. Try again, or walk to the junction.",
      "Aucun taxi n'a pris cette course. Rien ne vous a été facturé. Réessayez, ou marchez jusqu'au carrefour.",
    ),

    yourDriver: p("Your driver", "Votre chauffeur"),
    newDriver: p("New driver", "Nouveau chauffeur"),
    rateTitle: p("How was your ride?", "Comment s'est passée votre course ?"),
    rateThanks: p("Thank you. It helps the next rider.", "Merci. Cela aide le prochain passager."),
    rateStars: p("{n} out of 5", "{n} sur 5"),
    oneRide: p("{n} ride", "{n} course"),
    manyRides: p("{n} rides", "{n} courses"),
    callDriver: p("Call your driver", "Appeler votre chauffeur"),
    plateNumber: p("Plate number", "Numéro de plaque"),
    tellHim: p("TELL HIM THIS NUMBER", "DITES-LUI CE NUMÉRO"),
    tellHimWhy: p(
      "Do not get in before he says it back.",
      "Ne montez pas avant qu'il vous le répète.",
    ),

    youPaid: p("You paid", "Vous avez payé"),
    payOnArrival: p("You pay on arrival", "Vous payez à l'arrivée"),
    cash: p("Cash", "Espèces"),
    momo: p("MTN MoMo", "MTN MoMo"),
    orangeMoney: p("Orange Money", "Orange Money"),

    done: p("Done", "Terminé"),
    bookAnother: p("Book another", "Réserver une autre"),
    shareTrip: p("Share trip", "Partager la course"),
    shareThisTrip: p("Share this trip", "Partager cette course"),
    makingLink: p("Making a link…", "Création du lien…"),
    followMe: p("Follow my Fako Ride: {url}", "Suivez ma course Fako Ride : {url}"),
    cancelRide: p("Cancel ride", "Annuler la course"),
    cancelThisRide: p("Cancel this ride", "Annuler cette course"),
    getHelp: p("Get help", "Demander de l'aide"),

    cancelAsk: p("Cancel this ride?", "Annuler cette course ?"),
    cancelWhy: p(
      "He may already be on his way to you.",
      "Il est peut-être déjà en route vers vous.",
    ),
    keepIt: p("Keep it", "La garder"),
    cancelIt: p("Cancel it", "L'annuler"),

    helpComing: p("Help is coming", "L'aide arrive"),
    helpCominWhy: p(
      "Ops have your location and are calling you.",
      "L'équipe a votre position et vous appelle.",
    ),
    helpFailed: p("Could not send", "Envoi impossible"),
    callPolice: p("Call 117 if you are in danger.", "Appelez le 117 si vous êtes en danger."),

    offline: p("No network. Try again in a moment.", "Pas de réseau. Réessayez dans un instant."),
    tripOver: p("That ride has already finished.", "Cette course est déjà terminée."),
    notYours: p("That ride is not yours.", "Cette course n'est pas la vôtre."),
    didNotWork: p("That did not work. Try again.", "Cela n'a pas fonctionné. Réessayez."),
    needCamera: p(
      "We need the camera to take your photo.",
      "Nous avons besoin de l'appareil photo pour prendre votre photo.",
    ),
    needPhotos: p(
      "We need permission to open your photos.",
      "Nous avons besoin de votre autorisation pour ouvrir vos photos.",
    ),
    nameTooShort: p(
      "Type the name a driver should call you.",
      "Écrivez le nom par lequel un chauffeur doit vous appeler.",
    ),
  },

  /**
   * Something wrong with a finished ride.
   *
   * The picker is first person — she is saying what happened to her — where
   * the reports screen names the same thing as a topic she can read back.
   * Three of the five are the shared words; two are not, on purpose.
   */
  wrong: {
    link: p("Something wrong with this ride?", "Un problème avec cette course ?"),
    title: p("What went wrong?", "Que s'est-il passé ?"),
    feltUnsafe: p("I felt unsafe", "Je ne me suis pas senti en sécurité"),
    leftSomething: p("I left something", "J'ai oublié quelque chose"),
    placeholder: p(
      "He asked for more than the app price at Mile 17.",
      "Il a demandé plus que le prix de l'application à Mile 17.",
    ),
    tooShort: p("Say what happened, in a sentence.", "Dites ce qui s'est passé, en une phrase."),
    offline: p(
      "No network. Try again when you have signal.",
      "Pas de réseau. Réessayez quand vous aurez du signal.",
    ),
    didNotSend: p("That did not send. Try again.", "L'envoi a échoué. Réessayez."),
    notNow: p("Not now", "Pas maintenant"),
    sending: p("Sending…", "Envoi…"),
    send: p("Send", "Envoyer"),
    /* Our own words, not the server's sentence. */
    thanks: p(
      "A person reads this and answers you within a day. You will find the answer under “What you told us” in your account.",
      "Une personne le lit et vous répond dans la journée. Vous trouverez la réponse sous « Ce que vous nous avez dit » dans votre compte.",
    ),
  },

  /**
   * Coming to drive.
   *
   * Three steps: who you are, your papers, then the waiting. Written for a man
   * who owns a taxi and has been asked for documents by an office before, so
   * every field says what it wants and why.
   */
  apply: {
    title: p("Tell us about you and your taxi", "Parlez-nous de vous et de votre taxi"),
    why: p(
      "Riders see your name, your rating and your plate number before they get in.",
      "Les passagers voient votre nom, votre note et votre plaque avant de monter.",
    ),
    fullName: p("Full name, as written on your ID", "Nom complet, tel qu'écrit sur votre pièce"),
    fullNameShort: p("Full name", "Nom complet"),
    namePlaceholder: p("Epie Ndive", "Epie Ndive"),
    mobile: p("Mobile number", "Numéro de téléphone"),
    mobileHint: p("Already confirmed by SMS", "Déjà confirmé par SMS"),
    plateOnTaxi: p("Plate number on the taxi", "Numéro de plaque du taxi"),
    plate: p("Plate number", "Numéro de plaque"),
    platePlaceholder: p("SW 482 CK", "SW 482 CK"),
    cni: p("CNI number", "Numéro de CNI"),
    cniHint: p(
      "The nine digits on your national ID card",
      "Les neuf chiffres de votre carte nationale d'identité",
    ),
    cniPlaceholder: p("123456789", "123456789"),
    whereDrive: p("Where do you usually drive?", "Où conduisez-vous d'habitude ?"),
    send: p("Send my application", "Envoyer ma demande"),

    checking: p("We're checking your documents", "Nous vérifions vos documents"),
    checkingWhy: p(
      "Most applications are reviewed within one working day. We'll text you as soon as it's done.",
      "La plupart des demandes sont traitées en un jour ouvrable. Nous vous enverrons un SMS dès que ce sera fait.",
    ),
    stepReceived: p("Details received", "Informations reçues"),
    stepReviewing: p("Our team is reviewing them now", "Notre équipe les examine en ce moment"),
    stepOnline: p("You go online and start earning", "Vous passez en ligne et commencez à gagner"),
    myDocuments: p("My documents", "Mes documents"),
    checkDocuments: p("Check or replace my documents", "Vérifier ou remplacer mes documents"),
    checkAgain: p("Check again", "Vérifier à nouveau"),
    signOut: p("Sign out", "Se déconnecter"),
    underReview: p("Under review", "En cours d'examen"),

    refused: p("We could not approve this application", "Nous n'avons pas pu approuver cette demande"),
    refusedWhy: p(
      "Call us and we will tell you exactly what was wrong. It is usually a document we could not read.",
      "Appelez-nous et nous vous dirons exactement ce qui n'allait pas. C'est généralement un document illisible.",
    ),

    plateTaken: p(
      "That plate is already registered. Call us if it is yours.",
      "Cette plaque est déjà enregistrée. Appelez-nous si elle est à vous.",
    ),
    badCni: p(
      "Check the CNI number — it should be nine digits.",
      "Vérifiez le numéro de CNI — il doit comporter neuf chiffres.",
    ),
  },

  /** The three papers, and why each is wanted. */
  documents: {
    title: p("Your documents", "Vos documents"),
    why: p(
      "Take a clear photo of each one. Only the FakoRide team can see them.",
      "Prenez une photo nette de chacun. Seule l'équipe FakoRide peut les voir.",
    ),

    nationalId: p("National ID card", "Carte nationale d'identité"),
    registration: p("Car registration document", "Carte grise du véhicule"),
    facePhoto: p("Photo of your face", "Photo de votre visage"),
    tapToPhoto: p("Tap to take a photo", "Touchez pour prendre une photo"),
    ridersSee: p(
      "Riders see this before they get in",
      "Les passagers la voient avant de monter",
    ),
    sent: p("Sent", "Envoyé"),
    sending: p("Sending…", "Envoi…"),
    replace: p("Replace", "Remplacer"),
    replaceThis: p("Replace {what}", "Remplacer : {what}"),
    photographThis: p("Take a photo of your {what}", "Photographiez votre {what}"),

    advice: p(
      "Blurry or cut-off photos slow down your approval. Shoot in good light, flat on a table.",
      "Les photos floues ou coupées retardent votre validation. Photographiez à la lumière, à plat sur une table.",
    ),
    submit: p("Submit for review", "Soumettre pour vérification"),
    countSent: p("{n} of {total} sent", "{n} sur {total} envoyés"),

    needCamera: p(
      "We need the camera to take a photo of your documents.",
      "Nous avons besoin de l'appareil photo pour photographier vos documents.",
    ),
    notAnImage: p(
      "That file is not a photo. Use the camera.",
      "Ce fichier n'est pas une photo. Utilisez l'appareil photo.",
    ),
    tooLarge: p(
      "That photo is too large. Take it again.",
      "Cette photo est trop grande. Reprenez-la.",
    ),
    storageDown: p(
      "We cannot take documents right now. Try again shortly.",
      "Nous ne pouvons pas recevoir de documents pour l'instant. Réessayez sous peu.",
    ),
    notOpen: p("This application is closed. Call us.", "Cette demande est close. Appelez-nous."),
    didNotSend: p("That did not send. Try again.", "L'envoi a échoué. Réessayez."),
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

  /** The people texted when Get help is pressed. */
  contacts: {
    title: p("Trusted contacts", "Contacts de confiance"),
    why: p(
      "If you press Get help during a ride, we text them which taxi you are in and a link to follow the ride. Up to three people.",
      "Si vous appuyez sur Demander de l'aide pendant une course, nous leur envoyons par SMS le taxi dans lequel vous êtes et un lien pour suivre la course. Jusqu'à trois personnes.",
    ),
    nameLabel: p("Their name", "Son nom"),
    namePlaceholder: p("Mum", "Maman"),
    phoneLabel: p("Their number", "Son numéro"),
    phonePlaceholder: p("6 70 00 00 00", "6 70 00 00 00"),
    add: p("Add this person", "Ajouter cette personne"),
    remove: p("Remove", "Retirer"),
    removeOne: p("Remove {name}", "Retirer {name}"),
    full: p("You have {n} — the most you can keep.", "Vous en avez {n} — le maximum."),
    badPhone: p("Enter a Cameroon number, like 6 70 00 00 00.", "Entrez un numéro camerounais, par exemple 6 70 00 00 00."),
    ownNumber: p("That is your own number.", "C'est votre propre numéro."),
    already: p("That number is already on your list.", "Ce numéro est déjà dans votre liste."),
    tooMany: p("You can keep up to three people.", "Vous pouvez garder jusqu'à trois personnes."),
    texted: p(
      "We have also texted your trusted contacts a link to follow this ride.",
      "Nous avons aussi envoyé à vos contacts de confiance un lien pour suivre cette course.",
    ),
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

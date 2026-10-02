/**
 * Push notifications, end to end.
 *
 * The socket only reaches an open app, and a driver waits with his phone in
 * his pocket — so until now he missed every offer that arrived while it was.
 * These walk real bookings through the real dispatcher and read what reached
 * the runner's stand-in for Expo: who was told, in which language, with what
 * lifetime, and what happens to a phone that has been wiped.
 *
 * The driver waits at Bokwaongo, far enough up the hill that no other suite's
 * driver is within reach, so the dispatcher can only choose him.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const PUSH = process.env.PUSH_STANDIN;
const BOKWAONGO = { lat: 4.17, lng: 9.236 };
/** Eight kilometres from anybody: the dispatcher will find nobody here. */
const MUTENGENE = { lat: 4.0925, lng: 9.3153 };

// Ending in 7, always. The fake payment provider fails a number ending 00 and
// leaves one ending 11 pending forever; when this came straight off the clock,
// about two runs in a hundred drew one and a dozen money checks failed for no
// reason in the code.
const nonce = `${String(Date.now()).slice(-4)}7`;
const DRIVER_PHONE = `+2376788${nonce}`;
const DRIVER_PLATE = `SW ${nonce} P`;
const RIDER_PHONE = `+2376799${nonce}`;
const COUSIN_PHONE = `+2376811${nonce}`;
const DRIVER_TOKEN = `ExponentPushToken[driver-${nonce}]`;
const RIDER_TOKEN = `ExponentPushToken[rider-${nonce}]`;
const WIPED_TOKEN = `ExponentPushToken[gone-${nonce}]`;

let pass = 0;
let fail = 0;
const check = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok    ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? `  <- ${detail}` : ""}`);
  }
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      // Each suite arrives from its own address, as separate people would.
      ...(process.env.SUITE_IP ? { "x-forwarded-for": process.env.SUITE_IP } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: { raw: text } };
  }
}

function otpFromLog(phone) {
  const log = readFileSync(LOG, "utf8");
  const m = [...log.matchAll(/"to":"(\+237\d+)","message":"(\d{6})/g)].filter((x) => x[1] === phone);
  if (!m.length) throw new Error(`no OTP for ${phone}`);
  return m[m.length - 1][2];
}
/** How many codes the server has logged for this number so far. */
const codesLogged = (phone) =>
  [...readFileSync(LOG, "utf8").matchAll(/"to":"(\+237\d+)","message":"(\d{6})/g)].filter((m) => m[1] === phone).length;

/**
 * Ask for a code and wait until the server has logged it.
 *
 * This used to sleep 250 ms and hope. The log line lands a moment after the
 * response, and on a slow machine the moment is longer than that — the suite
 * then threw "no OTP" and died without a summary line.
 */
async function requestCode(phone) {
  const seen = codesLogged(phone);
  await call("POST", "/auth/otp/request", { body: { phone } });
  const until = Date.now() + 5000;
  while (codesLogged(phone) <= seen && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
}


async function signIn(phone, role, name) {
  await requestCode(phone);
  const v = await call("POST", "/auth/otp/verify", { body: { phone, code: otpFromLog(phone), role, name } });
  if (v.status !== 200) throw new Error(JSON.stringify(v.body));
  return v.body.token;
}

const DB = new URL(process.env.DATABASE_URL).pathname.slice(1);
const sql = (q) =>
  execSync(`docker exec fako-postgres psql -U fako -d ${DB} -tAc "${q.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
  }).trim();

/** Pushes are fire-and-forget, so they land just after the response. Wait for one. */
async function pushTo(token, kind, { within = 3000 } = {}) {
  const until = Date.now() + within;
  while (Date.now() < until) {
    const all = await fetch(`${PUSH}/__received`).then((r) => r.json());
    const hit = all.find((m) => m.to === token && m.data?.kind === kind);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
const pushesTo = async (token) =>
  (await fetch(`${PUSH}/__received`).then((r) => r.json())).filter((m) => m.to === token);

// --- setup ------------------------------------------------------------------

const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");
const driverToken = await signIn(DRIVER_PHONE, "DRIVER", "Mbua Ekema");
await call("POST", "/drivers/apply", {
  token: driverToken,
  body: { name: "Mbua Ekema", plate: DRIVER_PLATE, cniNumber: `6${nonce}0004`, homeZone: "BOKWAONGO" },
});
const queue = await call("GET", "/admin/drivers", { token: adminToken });
const driver = queue.body.drivers.find((d) => d.plate === DRIVER_PLATE);
await call("POST", `/admin/drivers/${driver.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: `S10-${nonce}-P`, overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
});
// He reads French. The notification must arrive in French, because the phone
// draws it before any of our own translation can run.
await call("PATCH", "/me", { token: driverToken, body: { language: "fr" } });
await call("POST", "/drivers/online", { token: driverToken, body: BOKWAONGO });

const riderToken = await signIn(RIDER_PHONE, "RIDER", "Enanga Mofor");

console.log("\n=== registering a phone ===");
const bad = await call("PUT", "/me/push-token", { token: driverToken, body: { token: "not-a-token" } });
check("something that is not an Expo token is refused", bad.status === 400, JSON.stringify(bad.body));

const anon = await call("PUT", "/me/push-token", { body: { token: DRIVER_TOKEN } });
check("registering needs an account", anon.status === 401, String(anon.status));

const reg = await call("PUT", "/me/push-token", { token: driverToken, body: { token: DRIVER_TOKEN } });
check("the driver's phone is registered", reg.status === 200 && reg.body.registered === true, JSON.stringify(reg.body));
await call("PUT", "/me/push-token", { token: riderToken, body: { token: RIDER_TOKEN } });
check("and the rider's", sql(`SELECT "pushToken" FROM "User" WHERE phone='${RIDER_PHONE}'`) === RIDER_TOKEN);

console.log("\n=== an offer reaches a pocket ===");
const trip = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: BOKWAONGO.lat, pickupLng: BOKWAONGO.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
});
check("the ride is offered to him", trip.body.status === "OFFERED", JSON.stringify(trip.body));

const offerPush = await pushTo(DRIVER_TOKEN, "offer");
check("his phone is told, whether or not the app is open", Boolean(offerPush));
check("in French, with the price and the route", offerPush?.title === `Nouvelle course — ${trip.body.priceXaf} FCFA` && offerPush?.body?.includes("→"), JSON.stringify({ title: offerPush?.title, body: offerPush?.body }));
check("and it dies when the offer does", offerPush?.ttl === 12 && offerPush?.priority === "high", JSON.stringify({ ttl: offerPush?.ttl, priority: offerPush?.priority }));
check("on the loud Android channel, carrying the trip", offerPush?.channelId === "offers" && offerPush?.data?.tripId === trip.body.id, JSON.stringify(offerPush?.data));

const held = await call("GET", "/drivers/me/offer", { token: driverToken });
check("an app opened from the notification can fetch the offer", held.body.offer?.tripId === trip.body.id, JSON.stringify(held.body));
check("with the seconds actually left, not the twelve it started with", held.body.offer?.expiresInSeconds > 0 && held.body.offer?.expiresInSeconds <= 12, String(held.body.offer?.expiresInSeconds));

const riderAsks = await call("GET", "/drivers/me/offer", { token: riderToken });
check("a rider cannot ask for a driver's offer", riderAsks.status === 403, String(riderAsks.status));

console.log("\n=== the rider is told as it happens ===");
await call("POST", `/trips/${trip.body.id}/accept`, { token: driverToken });
const gone = await call("GET", "/drivers/me/offer", { token: driverToken });
check("once accepted, there is no offer left to fetch", gone.body.offer === null, JSON.stringify(gone.body));

const accepted = await pushTo(RIDER_TOKEN, "accepted");
check("her phone hears the taxi is coming, with its plate", accepted?.title === "Your taxi is on the way" && accepted?.body?.includes(DRIVER_PLATE), JSON.stringify(accepted));
check("on the ordinary channel", accepted?.channelId === "trips");

await call("POST", `/trips/${trip.body.id}/arrived`, { token: driverToken });
const arrived = await pushTo(RIDER_TOKEN, "arrived");
check("and hears when it is outside", arrived?.title === "Your taxi is outside", JSON.stringify(arrived));

console.log("\n=== a phone changes hands ===");
const cousinToken = await signIn(COUSIN_PHONE, "RIDER", "Cousin Ngole");
await call("PUT", "/me/push-token", { token: cousinToken, body: { token: RIDER_TOKEN } });
check("the phone now belongs to whoever signed in on it last", sql(`SELECT "pushToken" FROM "User" WHERE phone='${COUSIN_PHONE}'`) === RIDER_TOKEN);
check("and the first owner stops receiving anything on it", sql(`SELECT coalesce("pushToken", 'none') FROM "User" WHERE phone='${RIDER_PHONE}'`) === "none");

console.log("\n=== a phone that has been wiped ===");
await call("PUT", "/me/push-token", { token: cousinToken, body: { token: WIPED_TOKEN } });
const nobody = await call("POST", "/trips", {
  token: cousinToken,
  body: { pickupLat: MUTENGENE.lat, pickupLng: MUTENGENE.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
});
check("with no taxi within reach, nobody takes it", nobody.body.status === "NO_DRIVER_FOUND", JSON.stringify(nobody.body.status));
const noDriver = await pushTo(WIPED_TOKEN, "no_driver");
check("she would have been told so", noDriver?.title === "No taxi took this one", JSON.stringify(noDriver));
await new Promise((r) => setTimeout(r, 400));
check("Expo says that phone is gone, so its token is forgotten", sql(`SELECT coalesce("pushToken", 'none') FROM "User" WHERE phone='${COUSIN_PHONE}'`) === "none");

console.log("\n=== signing out ===");
const out = await call("DELETE", "/me/push-token", { token: driverToken });
check("a phone can be unregistered", out.status === 204, String(out.status));
check("and is", sql(`SELECT coalesce("pushToken", 'none') FROM "User" WHERE phone='${DRIVER_PHONE}'`) === "none");
const before = (await pushesTo(DRIVER_TOKEN)).length;
await call("POST", `/trips/${trip.body.id}/start`, { token: driverToken, body: { pin: trip.body.pin } });
await call("POST", `/trips/${trip.body.id}/complete`, { token: driverToken });
await call("POST", "/drivers/online", { token: driverToken, body: BOKWAONGO });
const second = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: BOKWAONGO.lat, pickupLng: BOKWAONGO.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
});
await new Promise((r) => setTimeout(r, 600));
check("a signed-out phone is sent nothing, even with a ride on offer", second.body.status === "OFFERED" && (await pushesTo(DRIVER_TOKEN)).length === before, `${second.body.status}, ${(await pushesTo(DRIVER_TOKEN)).length - before} new`);
await call("POST", `/trips/${second.body.id}/cancel`, { token: riderToken, body: { reason: "test over" } });

console.log("\n=== finishing a ride twice ===");
/*
 * A double-tap on FINISH RIDE, or a retry after a timeout. Reading "is it still
 * in progress?" and then marking it complete were two steps, so every request
 * that arrived together passed the first — and each one completed the trip,
 * counted it, and charged for it again.
 */
await call("POST", "/drivers/online", { token: driverToken, body: BOKWAONGO });
const twice = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: BOKWAONGO.lat, pickupLng: BOKWAONGO.lng, toZone: "MOLYKO", paymentMethod: "MOMO" },
});
await call("POST", `/trips/${twice.body.id}/accept`, { token: driverToken });
await call("POST", `/trips/${twice.body.id}/start`, { token: driverToken, body: { pin: twice.body.pin } });
const tripsBefore = Number(sql(`SELECT "tripCount" FROM "Driver" WHERE id='${driver.id}'`));

const finishes = await Promise.all(Array.from({ length: 5 }, () => call("POST", `/trips/${twice.body.id}/complete`, { token: driverToken })));
check("five taps on FINISH RIDE complete it once", finishes.filter((r) => r.status === 200).length === 1, JSON.stringify(finishes.map((r) => r.status)));
check("the others are told it has already moved on", finishes.filter((r) => r.status === 409).length === 4, JSON.stringify(finishes.map((r) => r.status)));
check("the ride is counted once", Number(sql(`SELECT "tripCount" FROM "Driver" WHERE id='${driver.id}'`)) === tripsBefore + 1);
check("its history says COMPLETED once", sql(`SELECT count(*) FROM "TripEvent" WHERE "tripId"='${twice.body.id}' AND status='COMPLETED'`) === "1");
check("and she is asked to pay once", sql(`SELECT count(*) FROM "Payment" WHERE "tripId"='${twice.body.id}' AND purpose='TRIP_FARE'`) === "1");

console.log("\n=== booking twice ===");
// "Find me a taxi", tapped five times on a slow line. Booking never checked for
// a ride already running, so each tap was a ride, and a driver sent for each.
const bookings = await Promise.all(Array.from({ length: 5 }, () => call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: BOKWAONGO.lat, pickupLng: BOKWAONGO.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
})));
const booked = bookings.filter((r) => r.status === 201);
check("five taps on Find me a taxi book one ride", booked.length === 1, JSON.stringify(bookings.map((r) => r.status)));
check("the rest are told she already has one running", bookings.filter((r) => r.status === 409 && r.body.error?.code === "trip_in_progress").length === 4, JSON.stringify(bookings.map((r) => r.body.error?.code ?? r.status)));
const again = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: BOKWAONGO.lat, pickupLng: BOKWAONGO.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
});
check("and so is a second booking made later, while the first is live", again.status === 409 && again.body.error?.code === "trip_in_progress", JSON.stringify(again.body));
await call("POST", `/trips/${booked[0]?.body.id}/cancel`, { token: riderToken, body: { reason: "test over" } });
const afterCancel = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: BOKWAONGO.lat, pickupLng: BOKWAONGO.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
});
check("once it is over she can book again", afterCancel.status === 201, JSON.stringify(afterCancel.status));
await call("POST", `/trips/${afterCancel.body.id}/cancel`, { token: riderToken, body: { reason: "test over" } });

console.log("\n=== trusted contacts ===");
/*
 * Up to three people, saved in advance, each texted once when she presses Get
 * help: who, which taxi, and a link to follow the ride. The console SMS sender
 * writes every text to the server log, which is how these are read back.
 */
const MUM = `+2376844${String(nonce).slice(0, 4)}7`;
const BROTHER = `+2376855${String(nonce).slice(0, 4)}7`;
/** Every text the server has "sent" to this number, oldest first. */
const textsTo = (phone) =>
  [...readFileSync(LOG, "utf8").matchAll(/"to":"(\+237\d+)","message":"((?:[^"\\]|\\.)*)"/g)]
    .filter((m) => m[1] === phone)
    .map((m) => JSON.parse(`"${m[2]}"`));

const badNumber = await call("POST", "/me/contacts", { token: riderToken, body: { name: "Mum", phone: "+44 7700 900123" } });
check("a number that is not Cameroonian is refused", badNumber.status === 400 && badNumber.body.error?.code === "bad_phone", JSON.stringify(badNumber.body));
const ownNumber = await call("POST", "/me/contacts", { token: riderToken, body: { name: "Me", phone: RIDER_PHONE } });
check("so is her own", ownNumber.status === 400 && ownNumber.body.error?.code === "own_number", JSON.stringify(ownNumber.body));

const mum = await call("POST", "/me/contacts", { token: riderToken, body: { name: "Mum", phone: MUM.replace("+237", "") } });
check("she can save a contact, typed the way she would type it", mum.status === 201 && mum.body.phone === MUM, JSON.stringify(mum.body));
await call("POST", "/me/contacts", { token: riderToken, body: { name: "Brother", phone: BROTHER } });
const twiceMum = await call("POST", "/me/contacts", { token: riderToken, body: { name: "Mum again", phone: MUM } });
check("the same number twice is refused", twiceMum.status === 409 && twiceMum.body.error?.code === "already_a_contact", JSON.stringify(twiceMum.body));
await call("POST", "/me/contacts", { token: riderToken, body: { name: "Aunt", phone: `+2376866${String(nonce).slice(0, 4)}7` } });
const fourth = await call("POST", "/me/contacts", { token: riderToken, body: { name: "Uncle", phone: `+2376877${String(nonce).slice(0, 4)}7` } });
check("and a fourth — three is the limit", fourth.status === 409 && fourth.body.error?.code === "too_many_contacts", JSON.stringify(fourth.body));
const list = await call("GET", "/me/contacts", { token: riderToken });
check("she sees the three she saved", list.body.contacts?.length === 3, JSON.stringify(list.body));
const aunt = list.body.contacts.find((c) => c.name === "Aunt");
const notYours = await call("DELETE", `/me/contacts/${aunt.id}`, { token: driverToken });
check("nobody else can remove them", notYours.status === 404, String(notYours.status));
const removed = await call("DELETE", `/me/contacts/${aunt.id}`, { token: riderToken });
check("she can", removed.status === 204, String(removed.status));

await call("POST", "/drivers/online", { token: driverToken, body: BOKWAONGO });
const scared = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: BOKWAONGO.lat, pickupLng: BOKWAONGO.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
});
await call("POST", `/trips/${scared.body.id}/accept`, { token: driverToken });
await call("POST", `/trips/${scared.body.id}/start`, { token: driverToken, body: { pin: scared.body.pin } });

const alarm = await call("POST", `/trips/${scared.body.id}/sos`, { token: riderToken, body: { lat: BOKWAONGO.lat, lng: BOKWAONGO.lng } });
check("pressing Get help tells her how many people were texted", alarm.status === 201 && alarm.body.contactsTold === 2, JSON.stringify(alarm.body));
await new Promise((r) => setTimeout(r, 500));
const toMum = textsTo(MUM);
check("her mother gets a text", toMum.length === 1, `${toMum.length}`);
check("naming her, and the taxi", toMum[0]?.includes("Enanga Mofor") && toMum[0]?.includes(DRIVER_PLATE), toMum[0]);
check("so does her brother", textsTo(BROTHER).length === 1);
check("the one she removed does not", textsTo(`+2376866${String(nonce).slice(0, 4)}7`).length === 0);

const link = toMum[0]?.match(/\/share\/([A-Za-z0-9_-]+)/)?.[1];
const followed = await call("GET", `/share/${link}`);
check("the link in the text opens the live ride", followed.status === 200 && followed.body.driver?.plate === DRIVER_PLATE, JSON.stringify(followed.body).slice(0, 120));
check("and carries no PIN and no phone number", !JSON.stringify(followed.body).includes(scared.body.pin) && !JSON.stringify(followed.body).includes("+237"));

const again2 = await call("POST", `/trips/${scared.body.id}/sos`, { token: riderToken, body: {} });
await new Promise((r) => setTimeout(r, 500));
check("pressing it again raises the alarm again", again2.status === 201);
check("but does not text the same people twice", again2.body.contactsTold === 0 && textsTo(MUM).length === 1, JSON.stringify({ told: again2.body.contactsTold, mum: textsTo(MUM).length }));

await call("POST", `/trips/${scared.body.id}/complete`, { token: driverToken });
await call("POST", "/drivers/offline", { token: driverToken });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

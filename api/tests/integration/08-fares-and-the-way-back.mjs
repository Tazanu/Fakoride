/**
 * Finding a ride again, and the fare after it.
 *
 * Two things the app could not do until now:
 *
 *   come back to a ride after the app was closed — it only knew which ride was
 *   running while that ride's screen was open
 *
 *   tell the truth about a phone payment — both screens said "paid" the moment
 *   the ride ended, a declined prompt had no "try again", and a driver who took
 *   cash instead had nowhere to say so, so the ride vanished from his earnings
 *
 * And the one that would cost real money if it were wrong: a rider who pays in
 * cash after her prompt went quiet, and whose prompt then goes through anyway.
 * She has paid twice. He must not be paid twice, and a person must be told.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const CHECKPOINT = { lat: 4.1531, lng: 9.2764 };
const PUSH = process.env.PUSH_STANDIN;

// Ending in 7, always: the fake provider fails a number ending 00 and stalls
// one ending 11. The broke rider ends 00 on purpose.
const nonce = `${String(Date.now()).slice(-4)}7`;
const RIDER_PHONE = `+2376733${nonce}`;
const BROKE_PHONE = `+237673${nonce.slice(0, 4)}00`;
const DRIVER_PHONE = `+2376744${nonce}`;
const DRIVER_PLATE = `SW ${nonce} F`;
const BROKE_PUSH = `ExponentPushToken[fare-${nonce}]`;

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

const codes = (phone) =>
  [...readFileSync(LOG, "utf8").matchAll(/"to":"(\+237\d+)","message":"(\d{6})/g)].filter((m) => m[1] === phone);

async function signIn(phone, role, name) {
  const seen = codes(phone).length;
  await call("POST", "/auth/otp/request", { body: { phone } });
  const until = Date.now() + 5000;
  while (codes(phone).length <= seen && Date.now() < until) await sleep(50);
  const all = codes(phone);
  if (!all.length) throw new Error(`no OTP for ${phone}`);
  const v = await call("POST", "/auth/otp/verify", { body: { phone, code: all[all.length - 1][2], role, name } });
  if (v.status !== 200) throw new Error(JSON.stringify(v.body));
  return v.body.token;
}

const DB = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] || "fako_ride";
const sql = (q) =>
  execSync(`docker exec fako-postgres psql -U fako -d ${DB} -tAc "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read the trip until its fare reaches one of `states`, or give up. */
async function fareBecomes(tripId, token, states, timeoutMs = 10_000) {
  const until = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < until) {
    last = (await call("GET", `/trips/${tripId}`, { token })).body.fare;
    if (states.includes(last?.state)) return last;
    await sleep(300);
  }
  return last;
}

/** Book, take, pick up, carry and drop. Returns the trip and what completing said. */
async function ride(riderToken, paymentMethod, toZone = "UB") {
  const trip = await call("POST", "/trips", {
    token: riderToken,
    body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone, paymentMethod },
  });
  if (trip.body.status !== "OFFERED") throw new Error(`no taxi: ${JSON.stringify(trip.body)}`);
  await call("POST", `/trips/${trip.body.id}/accept`, { token: driverToken });
  await call("POST", `/trips/${trip.body.id}/arrived`, { token: driverToken });
  await call("POST", `/trips/${trip.body.id}/start`, { token: driverToken, body: { pin: trip.body.pin } });
  const done = await call("POST", `/trips/${trip.body.id}/complete`, { token: driverToken });
  return { id: trip.body.id, priceXaf: trip.body.priceXaf, completion: done.body };
}

// --- setup ------------------------------------------------------------------

const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");
// Every ride below must go to this suite's driver, so the corridor is cleared.
const leftover = await call("GET", "/admin/drivers?status=ACTIVE", { token: adminToken });
for (const d of leftover.body.drivers ?? []) {
  await call("POST", `/admin/drivers/${d.id}/suspend`, { token: adminToken, body: { reason: "Fare suite needs an empty corridor." } });
}

const driverToken = await signIn(DRIVER_PHONE, "DRIVER", "Fon Achu");
await call("POST", "/drivers/apply", {
  token: driverToken,
  body: { name: "Fon Achu", plate: DRIVER_PLATE, cniNumber: `7${nonce}0008` },
});
const queue = await call("GET", "/admin/drivers", { token: adminToken });
const applicant = queue.body.drivers?.find((d) => d.plate === DRIVER_PLATE);
await call("POST", `/admin/drivers/${applicant.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: `S10-${nonce}`, overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
});
await call("POST", "/drivers/online", { token: driverToken, body: CHECKPOINT });
const riderToken = await signIn(RIDER_PHONE, "RIDER", "Bih Comfort");

console.log("\n=== the way back to a ride ===");
const nothingYet = await call("GET", "/trips/current", { token: riderToken });
check("with no ride on, there is nothing to go back to", nothingYet.status === 200 && nothingYet.body.trip === null, JSON.stringify(nothingYet.body));

const booked = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB", paymentMethod: "CASH" },
});
const hers = await call("GET", "/trips/current", { token: riderToken });
check("a rider who reopens the app is told which ride is hers", hers.body.trip?.id === booked.body.id, JSON.stringify(hers.body));
check("with the two places she will recognise it by", Boolean(hers.body.trip?.pickupLabel) && Boolean(hers.body.trip?.dropLabel), JSON.stringify(hers.body.trip));

const again = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB", paymentMethod: "CASH" },
});
check("booking again names the ride already running", again.status === 409 && again.body.error?.details?.tripId === booked.body.id, JSON.stringify(again.body));

const notYetHis = await call("GET", "/trips/current", { token: driverToken });
check("an offer he has not taken is not his ride yet", notYetHis.body.trip === null, JSON.stringify(notYetHis.body));

await call("POST", `/trips/${booked.body.id}/accept`, { token: driverToken });
const his = await call("GET", "/trips/current", { token: driverToken });
check("once he takes it, reopening his app finds it too", his.body.trip?.id === booked.body.id, JSON.stringify(his.body));

const onTheWay = await call("GET", `/trips/${booked.body.id}`, { token: driverToken });
check("and he has her number while he is coming for her", onTheWay.body.rider?.phone === RIDER_PHONE, JSON.stringify(onTheWay.body.rider));
check("before the ride is over there is no fare to speak of", onTheWay.body.fare?.state === "NOT_DUE", JSON.stringify(onTheWay.body.fare));

await call("POST", `/trips/${booked.body.id}/arrived`, { token: driverToken });
await call("POST", `/trips/${booked.body.id}/start`, { token: driverToken, body: { pin: booked.body.pin } });
await call("POST", `/trips/${booked.body.id}/complete`, { token: driverToken });

check("a finished ride is not one to go back to — for her", (await call("GET", "/trips/current", { token: riderToken })).body.trip === null);
check("or for him", (await call("GET", "/trips/current", { token: driverToken })).body.trip === null);
const over = await call("GET", `/trips/${booked.body.id}`, { token: driverToken });
check("and her number goes with the ride", !JSON.stringify(over.body).includes(RIDER_PHONE), JSON.stringify(over.body.rider));
check("a cash ride is simply cash", over.body.fare?.state === "CASH", JSON.stringify(over.body.fare));

console.log("\n=== a phone payment that lands ===");
const paid = await ride(riderToken, "MOMO", "MILE17");
const rightAfter = (await call("GET", `/trips/${paid.id}`, { token: riderToken })).body.fare;
check("right after the ride she is told to check her phone, not that she paid", rightAfter?.state === "WAITING", JSON.stringify(rightAfter));
const landed = await fareBecomes(paid.id, riderToken, ["PAID"]);
check("and once it lands, that she paid", landed?.state === "PAID", JSON.stringify(landed));
check("he sees the same", (await call("GET", `/trips/${paid.id}`, { token: driverToken })).body.fare?.state === "PAID");

const cashToo = await call("POST", `/trips/${paid.id}/paid-cash`, { token: driverToken });
check("he cannot take cash for a ride her phone has paid", cashToo.status === 409 && cashToo.body.error?.code === "already_paid", JSON.stringify(cashToo.body));
const payTwice = await call("POST", `/trips/${paid.id}/pay-again`, { token: riderToken });
check("nor can she be asked to pay it again", payTwice.status === 409 && payTwice.body.error?.code === "already_paid", JSON.stringify(payTwice.body));

console.log("\n=== a phone payment that fails ===");
const brokeToken = await signIn(BROKE_PHONE, "RIDER", "Ngoh Delphine");
await call("PUT", "/me/push-token", { token: brokeToken, body: { token: BROKE_PUSH } });
const failed = await ride(brokeToken, "MOMO", "GREAT_SOPPO");

const declined = await fareBecomes(failed.id, brokeToken, ["FAILED"]);
check("she is told it did not go through", declined?.state === "FAILED", JSON.stringify(declined));
check("with the provider's reason", Boolean(declined?.reason), JSON.stringify(declined));
check("so is he", (await call("GET", `/trips/${failed.id}`, { token: driverToken })).body.fare?.state === "FAILED");
const herList = await call("GET", "/trips", { token: brokeToken });
check("and her list of rides says this one was not paid", herList.body.trips?.find((r) => r.id === failed.id)?.fare?.state === "FAILED", JSON.stringify(herList.body.trips?.[0]));

let told = [];
for (let i = 0; i < 20 && told.length === 0; i += 1) {
  told = (await fetch(`${PUSH}/__received`).then((r) => r.json())).filter((m) => m.to === BROKE_PUSH && m.data?.kind === "payment_failed");
  if (told.length === 0) await sleep(200);
}
check("and her phone is woken to say so, even with the app closed", told.length === 1 && told[0].data?.tripId === failed.id, JSON.stringify(told));

const triesBefore = Number(sql(`SELECT count(*) FROM "Payment" WHERE "tripId"='${failed.id}'`));
const retries = await Promise.all([1, 2, 3].map(() => call("POST", `/trips/${failed.id}/pay-again`, { token: brokeToken })));
const triesAfter = Number(sql(`SELECT count(*) FROM "Payment" WHERE "tripId"='${failed.id}'`));
check("she can try again", retries.every((r) => r.status === 200), JSON.stringify(retries.map((r) => r.status)));
check("and three taps put one prompt on her phone, not three", triesAfter === triesBefore + 1, `${triesBefore} → ${triesAfter}`);
check("the screen goes back to waiting on her phone", retries[0].body.fare?.state === "WAITING", JSON.stringify(retries[0].body.fare));

check("only the rider can ask her phone again", (await call("POST", `/trips/${failed.id}/pay-again`, { token: driverToken })).status === 403);
check("only the driver can say he took cash", (await call("POST", `/trips/${failed.id}/paid-cash`, { token: brokeToken })).status === 403);

await fareBecomes(failed.id, brokeToken, ["FAILED"]);
const heldBefore = (await call("GET", "/drivers/me/balance", { token: driverToken })).body.payableXaf;
const tookIt = await call("POST", `/trips/${failed.id}/paid-cash`, { token: driverToken });
check("he says he took the cash instead", tookIt.status === 200 && tookIt.body.fare?.state === "PAID_IN_CASH", JSON.stringify(tookIt.body));
const cashRows = sql(`SELECT type || '|' || "amountXaf" FROM "LedgerEntry" WHERE "tripId"='${failed.id}'`);
check("and the ride is in his earnings, as cash", cashRows === `FARE_CASH|${failed.priceXaf}`, cashRows);
const heldAfter = (await call("GET", "/drivers/me/balance", { token: driverToken })).body.payableXaf;
check("cash is his already — not added to what we hold for him", heldAfter === heldBefore, `${heldBefore} → ${heldAfter}`);

await call("POST", `/trips/${failed.id}/paid-cash`, { token: driverToken });
const stillOne = sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${failed.id}'`);
check("saying it twice records it once", stillOne === "1", stillOne);
check("she sees it was paid in cash", (await call("GET", `/trips/${failed.id}`, { token: brokeToken })).body.fare?.state === "PAID_IN_CASH");
const noMore = await call("POST", `/trips/${failed.id}/pay-again`, { token: brokeToken });
check("and is not asked by phone for money she has handed over", noMore.status === 409 && noMore.body.error?.code === "already_paid", JSON.stringify(noMore.body));

console.log("\n=== paid twice: cash at the kerb, then the phone ===");
/*
 * The fake provider settles after ~150 ms, but the reconciler only asks about
 * a payment a full second old. Saying "I took cash" straight after the ride
 * lands between the two — exactly the rider who gave up waiting on the prompt
 * and paid in notes, whose prompt then went through after all.
 */
const heldBeforeTwice = (await call("GET", "/drivers/me/balance", { token: driverToken })).body.payableXaf;
const twice = await ride(riderToken, "MOMO", "MOLYKO");
const kerb = await call("POST", `/trips/${twice.id}/paid-cash`, { token: driverToken });
check("he may take cash while her prompt is still out", kerb.status === 200 && kerb.body.fare?.state === "PAID_IN_CASH", JSON.stringify(kerb.body));

let phoneLanded = "";
for (let i = 0; i < 40 && phoneLanded !== "SUCCESSFUL"; i += 1) {
  phoneLanded = sql(`SELECT status FROM "Payment" WHERE "tripId"='${twice.id}' ORDER BY "createdAt" DESC LIMIT 1`);
  if (phoneLanded !== "SUCCESSFUL") await sleep(250);
}
check("then her phone payment goes through anyway", phoneLanded === "SUCCESSFUL", phoneLanded);
await sleep(300);
const twiceRows = sql(`SELECT string_agg(type::text, ',') FROM "LedgerEntry" WHERE "tripId"='${twice.id}'`);
check("he is not paid for the ride twice", twiceRows === "FARE_CASH", twiceRows);
const heldAfterTwice = (await call("GET", "/drivers/me/balance", { token: driverToken })).body.payableXaf;
check("and we do not owe him the phone money as well", heldAfterTwice === heldBeforeTwice, `${heldBeforeTwice} → ${heldAfterTwice}`);
const flagged = sql(`SELECT "failureReason" FROM "Payment" WHERE "tripId"='${twice.id}' AND status='SUCCESSFUL'`);
check("the payment is marked for a person to refund her", flagged.includes("refund"), flagged);

console.log("\n=== the list of rides ===");
const list = await call("GET", "/trips", { token: riderToken });
const byId = Object.fromEntries((list.body.trips ?? []).map((r) => [r.id, r]));
check("every ride she took is listed, newest first", list.body.trips?.[0]?.id === twice.id && Boolean(byId[booked.body.id]) && Boolean(byId[paid.id]), JSON.stringify(list.body.trips?.map((r) => r.id)));
check("each with where the money stands", byId[booked.body.id]?.fare?.state === "CASH" && byId[paid.id]?.fare?.state === "PAID", JSON.stringify([byId[booked.body.id]?.fare, byId[paid.id]?.fare]));
const hisList = await call("GET", "/trips", { token: driverToken });
check("his list is his rides, cash-instead included", hisList.body.trips?.find((r) => r.id === failed.id)?.fare?.state === "PAID_IN_CASH", JSON.stringify(hisList.body.trips?.length));

console.log("\n=== a copy of what we hold ===");
const MUM = `+2376955${nonce}`;
await call("POST", "/me/contacts", { token: riderToken, body: { name: "Mama Bih", phone: MUM } });
const copy = await call("GET", "/me/export", { token: riderToken });
check("she can have a copy of everything we hold about her", copy.status === 200 && copy.body.account?.phone === RIDER_PHONE, JSON.stringify(copy.body.account));
check("her rides are in it, with the plate she got into", copy.body.ridesTaken?.length >= 3 && copy.body.ridesTaken.every((r) => r.plate === DRIVER_PLATE), JSON.stringify(copy.body.ridesTaken?.map((r) => r.plate)));
check("and the people she trusts, and what she paid", copy.body.trustedContacts?.[0]?.phone === MUM && copy.body.payments?.length >= 2, JSON.stringify([copy.body.trustedContacts, copy.body.payments?.length]));
check("but not the driver's number — that is his", !JSON.stringify(copy.body).includes(DRIVER_PHONE));
const hisCopy = await call("GET", "/me/export", { token: driverToken });
check("a driver's copy has his rides given and his earnings", hisCopy.body.driver?.ridesGiven?.length >= 4 && hisCopy.body.driver?.earnings?.length >= 3, JSON.stringify([hisCopy.body.driver?.ridesGiven?.length, hisCopy.body.driver?.earnings?.length]));
check("and never a rider's number", !JSON.stringify(hisCopy.body).includes(RIDER_PHONE) && !JSON.stringify(hisCopy.body).includes(BROKE_PHONE));

console.log("\n=== deleting an account ===");
const riderId = sql(`SELECT id FROM "User" WHERE phone='${RIDER_PHONE}'`);
const ridesBefore = sql(`SELECT count(*) FROM "Trip" WHERE "riderId"='${riderId}'`);

const unconfirmed = await call("DELETE", "/me", { token: riderToken });
check("it is not done without saying so in words", unconfirmed.status === 400, JSON.stringify(unconfirmed.status));

const mid = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB", paymentMethod: "CASH" },
});
const midRide = await call("DELETE", "/me", { token: riderToken, body: { confirm: "DELETE" } });
check("nor in the middle of a ride", midRide.status === 409 && midRide.body.error?.code === "trip_in_progress", JSON.stringify(midRide.body));
await call("POST", `/trips/${mid.body.id}/cancel`, { token: riderToken, body: { reason: "testing" } });

const owed = await call("DELETE", "/me", { token: driverToken, body: { confirm: "DELETE" } });
check("a driver we still hold money for is told to send it to his MoMo first", owed.status === 409 && owed.body.error?.code === "money_held", JSON.stringify(owed.body));

const opsDesk = await call("DELETE", "/me", { token: adminToken, body: { confirm: "DELETE" } });
check("an ops account cannot delete itself from the app", opsDesk.status === 403, JSON.stringify(opsDesk.status));

const gone = await call("DELETE", "/me", { token: riderToken, body: { confirm: "DELETE" } });
check("she can delete her account", gone.status === 200 && gone.body.deleted === true, JSON.stringify(gone.body));
check("and she is signed out at once", (await call("GET", "/auth/me", { token: riderToken })).status === 401);
const emptied = sql(`SELECT phone || '|' || coalesce(name, '') || '|' || ("deletedAt" IS NOT NULL) FROM "User" WHERE id='${riderId}'`);
check("her name and number are gone", emptied === `deleted:${riderId}||true`, emptied);
check("and the people she trusted", sql(`SELECT count(*) FROM "TrustedContact" WHERE "userId"='${riderId}'`) === "0");
check("the rides stay — he was paid for them — but with nobody's name on them", sql(`SELECT count(*) FROM "Trip" WHERE "riderId"='${riderId}'`) === ridesBefore);

const returning = await signIn(RIDER_PHONE, "RIDER", "Bih Comfort");
const fresh = await call("GET", "/auth/me", { token: returning });
check("signing in with the same number again starts a new, empty account", fresh.status === 200 && fresh.body.id !== riderId, JSON.stringify(fresh.body.id));
check("with none of the old rides in it", (await call("GET", "/trips", { token: returning })).body.trips?.length === 0);

// A driver with nothing owed to him can go too — and his papers stay, as the
// privacy page says, with his record taken off the road.
const LEAVER_PHONE = `+2376766${nonce}`;
const leaverToken = await signIn(LEAVER_PHONE, "DRIVER", "Tabi Leaving");
await call("POST", "/drivers/apply", { token: leaverToken, body: { name: "Tabi Leaving", plate: `SW ${nonce} L`, cniNumber: `7${nonce}0009` } });
const leaverQueue = await call("GET", "/admin/drivers", { token: adminToken });
const leaver = leaverQueue.body.drivers?.find((d) => d.plate === `SW ${nonce} L`);
await call("POST", `/admin/drivers/${leaver.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: `S10-${nonce}9`, overrideMissingDocuments: true, note: "Test fixture." },
});
await call("POST", "/drivers/online", { token: leaverToken, body: CHECKPOINT });
const leaving = await call("DELETE", "/me", { token: leaverToken, body: { confirm: "DELETE" } });
check("a driver with nothing owed can delete his account", leaving.status === 200, JSON.stringify(leaving.body));
const leaverRow = sql(`SELECT status || '|' || online || '|' || "cniNumber" FROM "Driver" WHERE id='${leaver.id}'`);
check("he is off the road, and his ID number is kept", leaverRow === `SUSPENDED|f|7${nonce}0009`, leaverRow);
const REDIS_DB = new URL(process.env.REDIS_URL ?? "redis://localhost:6379").pathname.slice(1) || "0";
const stillDispatchable = execSync(`docker exec fako-redis redis-cli -n ${REDIS_DB} ZSCORE drivers:online:CAR ${leaver.id}`, { encoding: "utf8" }).trim();
check("and nobody can be sent to him", stillDispatchable === "", stillDispatchable);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

/**
 * The things that were missing before this could go live.
 *
 * Every section here was a way the system could quietly fail somebody on a
 * real day, and none of them had a test because none of them had any code:
 *
 *   a driver with a passenger was offered, and could take, a second ride
 *   a driver whose phone died stayed "online" and soaked up offers
 *   a ride nobody finished stayed in progress for good, and locked its rider out
 *   an alarm reached the console and no phone
 *   an unpaid access fee, after four refusals, cost a driver nothing
 *   an account could not be deleted
 *
 * The drivers wait at Muea, four kilometres from any other suite's, so the
 * dispatcher can only choose between the two this suite owns.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const PUSH = process.env.PUSH_STANDIN;
const MUEA = { lat: 4.175, lng: 9.314 };

// Ending in 7, always: the fake payment provider fails a number ending 00 and
// leaves one ending 11 pending forever.
const nonce = `${String(Date.now()).slice(-4)}7`;
const D1_PHONE = `+2376733${nonce}`;
const D2_PHONE = `+2376744${nonce}`;
const D1_PLATE = `SW ${nonce} X`;
const D2_PLATE = `SW ${nonce} Y`;
const R1_PHONE = `+2376755${nonce}`;
const R2_PHONE = `+2376766${nonce}`;
const R3_PHONE = `+2376777${nonce}`;
/** Ends in 00: the fake provider refuses every charge to this number. */
const BROKE_PHONE = `+23767${String(Date.now()).slice(-5)}00`;
const BROKE_PLATE = `SW ${nonce} Z`;
const D1_PUSH = `ExponentPushToken[quiet-${nonce}]`;
/** Set by the runner as OPS_ALERT_PHONES and SUPPORT_PHONE. */
const OPS_PHONE = "+237600000098";
const SUPPORT_PHONE = "+237677000007";

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

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(process.env.SUITE_IP ? { "x-forwarded-for": process.env.SUITE_IP } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text), text };
  } catch {
    return { status: res.status, body: { raw: text }, text };
  }
}

const codesLogged = (phone) =>
  [...readFileSync(LOG, "utf8").matchAll(/"to":"(\+237\d+)","message":"(\d{6})/g)].filter((m) => m[1] === phone);

async function signIn(phone, role, name) {
  const seen = codesLogged(phone).length;
  await call("POST", "/auth/otp/request", { body: { phone } });
  const until = Date.now() + 5000;
  while (codesLogged(phone).length <= seen && Date.now() < until) await sleep(50);
  const codes = codesLogged(phone);
  if (!codes.length) throw new Error(`no OTP for ${phone}`);
  const v = await call("POST", "/auth/otp/verify", { body: { phone, code: codes[codes.length - 1][2], role, name } });
  if (v.status !== 200) throw new Error(JSON.stringify(v.body));
  return v.body.token;
}

const DB = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] || "fako_ride";
const sql = (q) =>
  execSync(`docker exec fako-postgres psql -U fako -d ${DB} -tAc "${q.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
  }).trim();
const REDIS_DB = new URL(process.env.REDIS_URL ?? "redis://localhost:6379").pathname.slice(1) || "0";
const redisCmd = (...args) =>
  execSync(`docker exec fako-redis redis-cli -n ${REDIS_DB} ${args.join(" ")}`, { encoding: "utf8" }).trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until `read()` is truthy, or give up. The watchdog ticks once a second here. */
async function eventually(read, { within = 6000, every = 150 } = {}) {
  const until = Date.now() + within;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > until) return value;
    await sleep(every);
  }
}

const book = (token, paymentMethod = "CASH") =>
  call("POST", "/trips", {
    token,
    body: { pickupLat: MUEA.lat, pickupLng: MUEA.lng, toZone: "MOLYKO", paymentMethod },
  });
const tripStatus = (id) => sql(`SELECT status FROM "Trip" WHERE id='${id}'`);
/** Is he in the set dispatch searches? Asked of his own vehicle type's set. */
const inGeoSet = (driverId) =>
  redisCmd("ZSCORE", `drivers:online:${sql(`SELECT "vehicleType" FROM "Driver" WHERE id='${driverId}'`)}`, driverId) !== "";
const online = (driverId) => sql(`SELECT online FROM "Driver" WHERE id='${driverId}'`) === "t";

/** The provider settles after a moment; poll our own view until it has. */
async function settled(paymentId, token, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { body } = await call("GET", "/drivers/me/payments", { token });
    const row = body.payments?.find((p) => p.id === paymentId);
    if (row && ["SUCCESSFUL", "FAILED", "EXPIRED"].includes(row.status)) return row;
    await sleep(300);
  }
  return null;
}

// --- setup ------------------------------------------------------------------

const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");

async function newDriver(phone, plate, name, cni) {
  const token = await signIn(phone, "DRIVER", name);
  await call("POST", "/drivers/apply", { token, body: { name, plate, cniNumber: cni, homeZone: "MUEA" } });
  const queue = await call("GET", "/admin/drivers", { token: adminToken });
  const row = queue.body.drivers.find((d) => d.plate === plate);
  await call("POST", `/admin/drivers/${row.id}/verify`, {
    token: adminToken,
    body: { licenceNumber: `S10-${plate.replace(/\s/g, "")}`, overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
  });
  return { token, id: row.id };
}

const d1 = await newDriver(D1_PHONE, D1_PLATE, "Ngomba Elive", `7${nonce}0001`);
const toldApproved = await eventually(() => readFileSync(LOG, "utf8").includes(`"to":"${D1_PHONE}","message":"Fako Ride: you are approved`));
check("a driver is texted when he is approved, as the app promises", toldApproved);
const d2 = await newDriver(D2_PHONE, D2_PLATE, "Mola Njoh", `7${nonce}0002`);
const r1 = await signIn(R1_PHONE, "RIDER", "Limunga");
const r2 = await signIn(R2_PHONE, "RIDER", "Ebude");
const r3 = await signIn(R3_PHONE, "RIDER", "Namondo");
await call("PUT", "/me/push-token", { token: d1.token, body: { token: D1_PUSH } });

// ---------------------------------------------------------------------------
console.log("\n=== one passenger at a time ===");

await call("POST", "/drivers/online", { token: d1.token, body: MUEA });
const first = await book(r1);
check("the only driver at Muea is offered the ride", first.body.status === "OFFERED", JSON.stringify(first.body));
await call("POST", `/trips/${first.body.id}/accept`, { token: d1.token });
await call("POST", `/trips/${first.body.id}/start`, { token: d1.token, body: { pin: first.body.pin } });

// Reopening the app in the middle of this ride: each side must be led back to it.
const riderNow = await call("GET", "/trips/current?side=rider", { token: r1 });
check("a rider who reopens the app is told which ride she is on", riderNow.status === 200 && riderNow.body.trip?.id === first.body.id, JSON.stringify(riderNow.body));
const driverNow = await call("GET", "/trips/current?side=driver", { token: d1.token });
check("and so is her driver", driverNow.body.trip?.id === first.body.id && driverNow.body.trip?.status === "IN_PROGRESS", JSON.stringify(driverNow.body));
const driverAsRider = await call("GET", "/trips/current?side=rider", { token: d1.token });
check("his rider screen is not handed the ride he is driving", driverAsRider.body.trip === null, JSON.stringify(driverAsRider.body));
const nobodyNow = await call("GET", "/trips/current", { token: r3 });
check("somebody with no ride is told there is none", nobodyNow.status === 200 && nobodyNow.body.trip === null, JSON.stringify(nobodyNow.body));
check("it needs an account", (await call("GET", "/trips/current")).status === 401);

const whileCarrying = await book(r2);
check(
  "a second rider is not offered to a driver who already has a passenger",
  whileCarrying.body.status === "NO_DRIVER_FOUND",
  JSON.stringify(whileCarrying.body.status),
);
check("and that driver has nothing new on his screen", (await call("GET", "/drivers/me/offer", { token: d1.token })).body.offer === null);

await call("POST", "/drivers/online", { token: d2.token, body: MUEA });
const toSecondDriver = await book(r2);
const d2Offer = await call("GET", "/drivers/me/offer", { token: d2.token });
check(
  "she is offered to the free driver instead",
  toSecondDriver.body.status === "OFFERED" && d2Offer.body.offer?.tripId === toSecondDriver.body.id,
  JSON.stringify({ status: toSecondDriver.body.status, offer: d2Offer.body.offer?.tripId }),
);

const d2Accepts = await call("POST", `/trips/${toSecondDriver.body.id}/accept`, { token: d2.token });
check("he accepts it", d2Accepts.status === 200, JSON.stringify(d2Accepts.body));

// An offer that reached his screen a moment before he accepted another: forged
// here, because dispatch will no longer make one.
const stray = await book(r3);
sql(`UPDATE "Trip" SET status='OFFERED' WHERE id='${stray.body.id}'`);
redisCmd("SET", `trip:${stray.body.id}:offer`, d2.id, "EX", "30");
const greedy = await call("POST", `/trips/${stray.body.id}/accept`, { token: d2.token });
check(
  "accepting a second ride while carrying is refused, and says which ride to finish",
  greedy.status === 409 && greedy.body.error?.code === "finish_current_ride" && greedy.body.error?.details?.tripId === toSecondDriver.body.id,
  JSON.stringify(greedy.body),
);
check("the ride he tried to take is not his", sql(`SELECT coalesce("driverId", 'nobody') FROM "Trip" WHERE id='${stray.body.id}'`) === "nobody");
redisCmd("DEL", `trip:${stray.body.id}:offer`);
await call("POST", `/trips/${stray.body.id}/cancel`, { token: r3, body: { reason: "test over" } });

// ---------------------------------------------------------------------------
console.log("\n=== an alarm reaches a phone ===");

const sos = await call("POST", `/trips/${first.body.id}/sos`, { token: r1, body: MUEA });
check("the rider raises an alarm", sos.status === 201, JSON.stringify(sos.body));
const opsText = await eventually(() => {
  const log = readFileSync(LOG, "utf8");
  return [...log.matchAll(/"to":"(\+237\d+)","message":"(FAKO RIDE SOS[^"]*)"/g)].filter((m) => m[1] === OPS_PHONE).at(-1)?.[2];
});
check("the operator's phone is texted, not just the console", Boolean(opsText), String(opsText));
check("with her number to call back", opsText?.includes(`Call ${R1_PHONE} now`), String(opsText));
check("and the taxi she is in", opsText?.includes(D1_PLATE) && opsText?.includes("rider Limunga"), String(opsText));

// ---------------------------------------------------------------------------
console.log("\n=== a ride nobody finishes ===");

const cannot = await call("POST", `/trips/${first.body.id}/cancel`, { token: r1, body: { reason: "stuck" } });
check("a rider still cannot cancel a ride that has started", cannot.status === 409, String(cannot.status));
const lockedOut = await book(r1);
check("and cannot book another while it runs", lockedOut.status === 409 && lockedOut.body.error?.code === "trip_in_progress", JSON.stringify(lockedOut.body));

const tripsBefore = Number(sql(`SELECT "tripCount" FROM "Driver" WHERE id='${d1.id}'`));
sql(`UPDATE "Trip" SET "startedAt" = now() - interval '4 hours' WHERE id='${first.body.id}'`);
const finishedByWatchdog = await eventually(() => tripStatus(first.body.id) === "COMPLETED");
check("a ride in progress for four hours is finished by the watchdog", finishedByWatchdog, tripStatus(first.body.id));
check(
  "the fare is written once, as if he had pressed Finish",
  sql(`SELECT count(*) || '|' || coalesce(max(type::text), '') FROM "LedgerEntry" WHERE "tripId"='${first.body.id}'`) === "1|FARE_CASH",
  sql(`SELECT count(*) || '|' || coalesce(max(type::text), '') FROM "LedgerEntry" WHERE "tripId"='${first.body.id}'`),
);
check("his trip count goes up by exactly one", Number(sql(`SELECT "tripCount" FROM "Driver" WHERE id='${d1.id}'`)) === tripsBefore + 1);
check(
  "the record says the system ended it, not a person",
  sql(`SELECT count(*) FROM "TripEvent" WHERE "tripId"='${first.body.id}' AND status='COMPLETED' AND actor='system'`) !== "0",
);
await sleep(2200);
check(
  "and later sweeps do not finish it again",
  sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${first.body.id}'`) === "1" &&
    Number(sql(`SELECT "tripCount" FROM "Driver" WHERE id='${d1.id}'`)) === tripsBefore + 1,
);
const freeAgain = await book(r1);
check("she can book again", freeAgain.status === 201, JSON.stringify(freeAgain.body));
check("and a finished ride is no longer anybody's current one", (await call("GET", "/trips/current?side=driver", { token: d1.token })).body.trip === null);
await call("POST", `/trips/${freeAgain.body.id}/cancel`, { token: r1, body: { reason: "test over" } });

// The same, one step earlier: accepted, and he never came.
sql(`UPDATE "Trip" SET "acceptedAt" = now() - interval '2 hours' WHERE id='${toSecondDriver.body.id}'`);
const droppedByWatchdog = await eventually(() => tripStatus(toSecondDriver.body.id) === "CANCELLED_BY_OPS");
check("a ride accepted two hours ago and never started is cancelled", droppedByWatchdog, tripStatus(toSecondDriver.body.id));
check("with nothing written to anybody's ledger", sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${toSecondDriver.body.id}'`) === "0");
check(
  "and the reason kept on the ride",
  sql(`SELECT "cancelReason" FROM "Trip" WHERE id='${toSecondDriver.body.id}'`).startsWith("No pickup within"),
  sql(`SELECT "cancelReason" FROM "Trip" WHERE id='${toSecondDriver.body.id}'`),
);
const seenByRider = await call("GET", `/trips/${toSecondDriver.body.id}`, { token: r2 });
check("her app is told the truth about it", seenByRider.body.status === "CANCELLED_BY_OPS", JSON.stringify(seenByRider.body.status));

// ---------------------------------------------------------------------------
console.log("\n=== ending a ride from the console ===");

// Both drivers are free again; each rider takes whoever is offered.
const driverFor = async (tripId) => {
  for (const d of [d1, d2]) {
    if ((await call("GET", "/drivers/me/offer", { token: d.token })).body.offer?.tripId === tripId) return d;
  }
  return null;
};

const opsA = await book(r1);
const driverA = await driverFor(opsA.body.id);
await call("POST", `/trips/${opsA.body.id}/accept`, { token: driverA.token });
await call("POST", `/trips/${opsA.body.id}/start`, { token: driverA.token, body: { pin: opsA.body.pin } });

const notOps = await call("POST", `/admin/trips/${opsA.body.id}/cancel`, { token: r1, body: { reason: "let me out" } });
check("a rider cannot use the console's way out", notOps.status === 403, String(notOps.status));
const noReason = await call("POST", `/admin/trips/${opsA.body.id}/cancel`, { token: adminToken, body: {} });
check("ops must say why", noReason.status === 400, String(noReason.status));

const opsCancel = await call("POST", `/admin/trips/${opsA.body.id}/cancel`, {
  token: adminToken,
  body: { reason: "Driver's phone broke at Mile 16; rider called us." },
});
check("ops cancels a ride that is in progress", opsCancel.status === 200 && tripStatus(opsA.body.id) === "CANCELLED_BY_OPS", JSON.stringify(opsCancel.body));
check("no fare is written for it", sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${opsA.body.id}'`) === "0");
check(
  "who did it is on the record",
  sql(`SELECT count(*) FROM "TripEvent" e JOIN "User" u ON u.id = e.actor WHERE e."tripId"='${opsA.body.id}' AND e.status='CANCELLED_BY_OPS' AND u.role='ADMIN'`) === "1",
);
const twiceCancelled = await call("POST", `/admin/trips/${opsA.body.id}/cancel`, { token: adminToken, body: { reason: "again, by mistake" } });
check("a ride that is over cannot be ended again", twiceCancelled.status === 409, String(twiceCancelled.status));
const onBoard = await call("GET", "/admin/trips?status=CANCELLED_BY_OPS", { token: adminToken });
check("the board can list rides ops ended", onBoard.status === 200 && onBoard.body.trips?.some((t) => t.id === opsA.body.id), JSON.stringify(onBoard.status));

const opsB = await book(r1);
const driverB = await driverFor(opsB.body.id);
check("the driver ops freed is offered rides again", Boolean(driverB), "nobody was offered the next ride");
await call("POST", `/trips/${opsB.body.id}/accept`, { token: driverB.token });
const tooEarly = await call("POST", `/admin/trips/${opsB.body.id}/complete`, { token: adminToken, body: { reason: "He says he dropped her." } });
check("ops cannot complete a ride that never started", tooEarly.status === 409, String(tooEarly.status));
await call("POST", `/trips/${opsB.body.id}/start`, { token: driverB.token, body: { pin: opsB.body.pin } });
const opsComplete = await call("POST", `/admin/trips/${opsB.body.id}/complete`, {
  token: adminToken,
  body: { reason: "Driver confirmed by phone that he dropped her at Molyko." },
});
check("ops completes a ride that is in progress", opsComplete.status === 200 && tripStatus(opsB.body.id) === "COMPLETED", JSON.stringify(opsComplete.body));
check(
  "the driver's fare is written, exactly once",
  sql(`SELECT count(*) || '|' || coalesce(sum("amountXaf"), 0) FROM "LedgerEntry" WHERE "tripId"='${opsB.body.id}'`) === `1|${opsB.body.priceXaf}`,
  sql(`SELECT count(*) || '|' || coalesce(sum("amountXaf"), 0) FROM "LedgerEntry" WHERE "tripId"='${opsB.body.id}'`),
);
const lateTap = await call("POST", `/trips/${opsB.body.id}/complete`, { token: driverB.token });
check("his own late tap on Finish changes nothing", lateTap.status === 409 && sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${opsB.body.id}'`) === "1", String(lateTap.status));

// ---------------------------------------------------------------------------
console.log("\n=== a driver who goes quiet ===");

await call("POST", "/drivers/online", { token: d1.token, body: MUEA });
await call("POST", "/drivers/online", { token: d2.token, body: MUEA });
check("a position ping marks him as heard from", redisCmd("EXISTS", `driver:${d1.id}:seen`) === "1");
const pingOnline = await call("POST", "/drivers/position", { token: d1.token, body: MUEA });
check("and is told he is online, so his phone keeps reporting", pingOnline.status === 200 && pingOnline.body.online === true, JSON.stringify(pingOnline.body));
await sleep(2200);
check("a driver heard from lately is left online", online(d1.id) && online(d2.id));

// D2 takes a passenger, then both phones "die".
const carried = await book(r2);
const carrier = await driverFor(carried.body.id);
const idle = carrier.id === d1.id ? d2 : d1;
await call("POST", `/trips/${carried.body.id}/accept`, { token: carrier.token });

// A locked phone reports over plain HTTP, not the socket. That report has to
// move the taxi on her map exactly as a socket one does.
const { io: socketClient } = await import("socket.io-client");
const riderSocket = socketClient(API, { auth: { token: r2 }, transports: ["websocket"], reconnection: false });
await new Promise((resolve) => {
  riderSocket.on("connect", resolve);
  riderSocket.on("connect_error", resolve);
});
const moved = new Promise((resolve) => {
  riderSocket.on("trip:position", resolve);
  setTimeout(() => resolve(null), 3000);
});
riderSocket.emit("trip:watch", { tripId: carried.body.id });
await sleep(300);
await call("POST", "/drivers/position", { token: carrier.token, body: { lat: 4.1741, lng: 9.3133 } });
const seenOnMap = await moved;
check("a position sent with the screen off still moves the taxi on her map", seenOnMap?.lat === 4.1741 && seenOnMap?.lng === 9.3133, JSON.stringify(seenOnMap));
riderSocket.close();

const pushesBefore = (await fetch(`${PUSH}/__received`).then((r) => r.json())).length;
redisCmd("DEL", `driver:${d1.id}:seen`, `driver:${d2.id}:seen`);

const wentOffline = await eventually(() => !online(idle.id));
check("a waiting driver who has gone quiet is taken offline", wentOffline);
check("and out of the set dispatch searches", !inGeoSet(idle.id), "still in the geo set");
await sleep(1500);
check("a quiet driver with a passenger is left alone", online(carrier.id));
if (idle.id === d1.id) {
  const told = await eventually(async () =>
    (await fetch(`${PUSH}/__received`).then((r) => r.json())).slice(pushesBefore).find((m) => m.to === D1_PUSH && m.data?.kind === "taken_offline"),
  );
  check("he is told, on his phone, that he is offline", Boolean(told), JSON.stringify(told));
} else {
  check("he is told, on his phone, that he is offline (the other driver was idle this run — no token to read)", true);
}

const pingOffline = await call("POST", "/drivers/position", { token: idle.token, body: MUEA });
check("his phone's next report is answered with: you are offline, stop", pingOffline.status === 200 && pingOffline.body.online === false, JSON.stringify(pingOffline.body));
check("and puts no dot back on the map for a driver nobody can book", !inGeoSet(idle.id));
const unreachable = await book(r3);
check("a rider is not offered to the driver who went quiet", unreachable.body.status === "NO_DRIVER_FOUND", JSON.stringify(unreachable.body.status));

await call("POST", "/drivers/online", { token: idle.token, body: MUEA });
check("opening the app puts him straight back", online(idle.id) && redisCmd("EXISTS", `driver:${idle.id}:seen`) === "1");
await call("POST", `/trips/${carried.body.id}/cancel`, { token: r2, body: { reason: "test over" } });

// ---------------------------------------------------------------------------
console.log("\n=== an access fee that is never paid ===");

/*
 * The collection sweep runs every second here and asks for any fee whose day
 * is over. So the driver in this section has a MoMo that always says no — the
 * case the rule exists for: asked, refused, and until now free to carry on.
 */
const broke = await newDriver(BROKE_PHONE, BROKE_PLATE, "Sako Mbella", `7${nonce}0003`);
await call("POST", "/drivers/online", { token: broke.token, body: MUEA });
await call("POST", "/drivers/offline", { token: broke.token });
const brokeFee = sql(`SELECT id FROM "AccessFeeCharge" WHERE "driverId"='${broke.id}'`);
const feeState = (id) => sql(`SELECT paid || '|' || "amountXaf" || '|' || coalesce("providerRef", 'none') FROM "AccessFeeCharge" WHERE id='${id}'`);

// Yesterday's fee: asked for, refused, and still inside its grace.
sql(`UPDATE "AccessFeeCharge" SET "serviceDate" = "serviceDate" - interval '1 day' WHERE id='${brokeFee}'`);
const inGrace = await call("POST", "/drivers/online", { token: broke.token, body: MUEA });
check("a fee from yesterday does not stop him working today", inGrace.status === 200, JSON.stringify(inGrace.body));
await call("POST", "/drivers/offline", { token: broke.token });

// The same fee, five days old.
sql(`UPDATE "AccessFeeCharge" SET "serviceDate" = "serviceDate" - interval '4 days' WHERE id='${brokeFee}'`);
const chargesBefore = sql(`SELECT count(*) FROM "AccessFeeCharge" WHERE "driverId"='${broke.id}'`);
const blocked = await call("POST", "/drivers/online", { token: broke.token, body: MUEA });
check(
  "a fee five days old does",
  blocked.status === 402 && blocked.body.error?.code === "fees_overdue" && blocked.body.error?.details?.owedXaf === 500,
  JSON.stringify(blocked.body),
);
check("he is not online", !online(broke.id));
check("and was not charged for a day he was turned away from", sql(`SELECT count(*) FROM "AccessFeeCharge" WHERE "driverId"='${broke.id}'`) === chargesBefore);
const balance = await call("GET", "/drivers/me/balance", { token: broke.token });
check("his app is told how much stands in the way", balance.body.overdueFeesXaf === 500, JSON.stringify(balance.body));

const refusedPrompt = await call("POST", "/drivers/me/fees/pay", { token: broke.token });
check(
  "he can put the prompt on his own phone",
  [200, 201].includes(refusedPrompt.status) && refusedPrompt.body.amountXaf === 500 && Boolean(refusedPrompt.body.paymentId),
  JSON.stringify(refusedPrompt.body),
);
const refused = await settled(refusedPrompt.body.paymentId, broke.token);
check("his MoMo says no", refused?.status === "FAILED", JSON.stringify(refused));
check("and a refused prompt does not let him through", (await call("POST", "/drivers/online", { token: broke.token, body: MUEA })).status === 402);

const waiveAsDriver = await call("POST", `/admin/access-fees/${brokeFee}/waive`, { token: broke.token, body: { reason: "I do not want to pay" } });
check("a driver cannot waive his own fee", waiveAsDriver.status === 403, String(waiveAsDriver.status));
const waiveSilently = await call("POST", `/admin/access-fees/${brokeFee}/waive`, { token: adminToken, body: {} });
check("ops must say why a fee is let go", waiveSilently.status === 400, String(waiveSilently.status));
const feesCounted = () => Number(sql(`SELECT coalesce(sum(-"amountXaf"), 0) FROM "LedgerEntry" WHERE "driverId"='${broke.id}' AND type='ACCESS_FEE'`));
const feesCountedBefore = feesCounted();
const waived = await call("POST", `/admin/access-fees/${brokeFee}/waive`, {
  token: adminToken,
  body: { reason: "App was down that morning; he never carried anybody." },
});
check("ops waives it", waived.status === 200 && waived.body.waived === true, JSON.stringify(waived.body));
check("the day is settled at nothing", feeState(brokeFee) === "true|0|WAIVED", feeState(brokeFee));
check("and his ledger no longer counts that fee", feesCounted() === feesCountedBefore - 500, `${feesCountedBefore} -> ${feesCounted()}`);
check("waiving twice is refused", (await call("POST", `/admin/access-fees/${brokeFee}/waive`, { token: adminToken, body: { reason: "again, by mistake" } })).status === 409);
check("he can work", (await call("POST", "/drivers/online", { token: broke.token, body: MUEA })).status === 200);
const nothingDue = await call("POST", "/drivers/me/fees/pay", { token: broke.token });
check("with nothing owed, paying says so and prompts nobody", nothingDue.status === 200 && nothingDue.body.status === "NOTHING_DUE", JSON.stringify(nothingDue.body));
await call("POST", "/drivers/offline", { token: broke.token });

// A driver whose MoMo has money in it: pressing Pay settles the day.
await call("POST", "/drivers/offline", { token: d1.token });
const d1Fee = sql(`SELECT id FROM "AccessFeeCharge" WHERE "driverId"='${d1.id}' AND paid=false ORDER BY "serviceDate" ASC LIMIT 1`);
sql(`UPDATE "AccessFeeCharge" SET "serviceDate" = "serviceDate" - interval '5 days' WHERE id='${d1Fee}'`);
// The sweep is a second behind at most, so the prompt may be his or its — the
// same prompt either way, and never two.
const payNow = await call("POST", "/drivers/me/fees/pay", { token: d1.token });
check("a driver with money presses Pay", [200, 201].includes(payNow.status) && ["PENDING", "SUCCESSFUL"].includes(payNow.body.status), JSON.stringify(payNow.body));
check("the day is marked paid", await eventually(() => feeState(d1Fee).startsWith("true|500")), feeState(d1Fee));
check("by exactly one payment", sql(`SELECT count(*) FROM "Payment" WHERE "accessFeeChargeId"='${d1Fee}'`) === "1");
const afterPaying = await call("POST", "/drivers/online", { token: d1.token, body: MUEA });
check("and he can work", afterPaying.status === 200 && online(d1.id), JSON.stringify(afterPaying.body));

// ---------------------------------------------------------------------------
console.log("\n=== correcting what we hold for a driver ===");

const held0 = (await call("GET", "/drivers/me/balance", { token: d1.token })).body.payableXaf;
const tooMuch = await call("POST", `/admin/drivers/${d1.id}/adjustments`, { token: adminToken, body: { amountXaf: -(held0 + 1), reason: "Refunded the rider in full." } });
check("ops cannot take more than we are holding", tooMuch.status === 409 && tooMuch.body.error?.code === "more_than_held", JSON.stringify(tooMuch.body));
const nothing = await call("POST", `/admin/drivers/${d1.id}/adjustments`, { token: adminToken, body: { amountXaf: 0, reason: "Nothing at all." } });
check("or adjust by nothing", nothing.status === 400, String(nothing.status));
const credit = await call("POST", `/admin/drivers/${d1.id}/adjustments`, { token: adminToken, body: { amountXaf: 300, reason: "Fare credited twice to the wrong driver; moving it." } });
check("a credit raises what he can cash out", credit.status === 201 && credit.body.payableXaf === held0 + 300, JSON.stringify(credit.body));
check("his own balance agrees", (await call("GET", "/drivers/me/balance", { token: d1.token })).body.payableXaf === held0 + 300);
const debit = await call("POST", `/admin/drivers/${d1.id}/adjustments`, { token: adminToken, body: { amountXaf: -300, reason: "Reversing the test credit." } });
check("a debit takes it back", debit.status === 201 && debit.body.payableXaf === held0, JSON.stringify(debit.body));
check("a rider cannot adjust anything", (await call("POST", `/admin/drivers/${d1.id}/adjustments`, { token: r1, body: { amountXaf: 5000, reason: "A gift to my driver." } })).status === 403);

// ---------------------------------------------------------------------------
console.log("\n=== deleting an account ===");

check("it needs an account", (await call("DELETE", "/me")).status === 401);
check("an ops account is not deleted from the app", (await call("DELETE", "/me", { token: adminToken })).status === 403);

// R3: a contact, a ride in her history, and then a ride under way.
await call("POST", "/me/contacts", { token: r3, body: { name: "Mum", phone: `+2376788${nonce}` } });
const r3Id = sql(`SELECT id FROM "User" WHERE phone='${R3_PHONE}'`);
const tripsOnRecord = sql(`SELECT count(*) FROM "Trip" WHERE "riderId"='${r3Id}'`);
const midRide = await book(r3);
const BYE = { confirm: "DELETE" };
const refusedMidRide = await call("DELETE", "/me", { token: r3, body: BYE });
check("it is refused while she has a ride running", refusedMidRide.status === 409 && refusedMidRide.body.error?.code === "trip_in_progress", JSON.stringify(refusedMidRide.body));
await call("POST", `/trips/${midRide.body.id}/cancel`, { token: r3, body: { reason: "test over" } });

const gone = await call("DELETE", "/me", { token: r3, body: BYE });
check("then it is deleted", gone.status === 200 && gone.body.deleted === true, String(gone.status));
check("her token stops working at once", (await call("GET", "/auth/me", { token: r3 })).status === 401);
check(
  "the row no longer says who she was",
  sql(`SELECT phone || '|' || coalesce(name, 'none') || '|' || ("deletedAt" IS NOT NULL) FROM "User" WHERE id='${r3Id}'`) === `deleted:${r3Id}|none|true`,
  sql(`SELECT phone || '|' || coalesce(name, 'none') || '|' || ("deletedAt" IS NOT NULL) FROM "User" WHERE id='${r3Id}'`),
);
check("her number is nowhere in the accounts table", sql(`SELECT count(*) FROM "User" WHERE phone='${R3_PHONE}'`) === "0");
check("her trusted contacts are gone", sql(`SELECT count(*) FROM "TrustedContact" WHERE "userId"='${r3Id}'`) === "0");
check("her rides are kept", sql(`SELECT count(*) FROM "Trip" WHERE "riderId"='${r3Id}'`) === String(Number(tripsOnRecord) + 1), tripsOnRecord);

const back = await signIn(R3_PHONE, "RIDER", "Namondo");
const backId = sql(`SELECT id FROM "User" WHERE phone='${R3_PHONE}'`);
check("the same number can sign up again, as somebody new", backId !== r3Id && backId.length > 0);
check("with none of the old account's contacts", (await call("GET", "/me/contacts", { token: back })).body.contacts?.length === 0);

// A driver, with money of his that we are holding.
await call("POST", "/drivers/online", { token: d2.token, body: MUEA });
await call("POST", "/drivers/offline", { token: d1.token });
const paidRide = await book(r2, "MOMO");
await call("POST", `/trips/${paidRide.body.id}/accept`, { token: d2.token });
await call("POST", `/trips/${paidRide.body.id}/start`, { token: d2.token, body: { pin: paidRide.body.pin } });

const midDrive = await call("DELETE", "/me", { token: d2.token, body: BYE });
check("a driver cannot delete his account with a passenger in the car", midDrive.status === 409 && midDrive.body.error?.code === "trip_in_progress", JSON.stringify(midDrive.body));

const midRide2 = await call("GET", `/trips/${paidRide.body.id}`, { token: d2.token });
check("a fare by phone has no state until the ride is over", midRide2.body.fare?.state === "NOT_DUE", JSON.stringify(midRide2.body.fare));
const done = await call("POST", `/trips/${paidRide.body.id}/complete`, { token: d2.token });
const justDone = await call("GET", `/trips/${paidRide.body.id}`, { token: d2.token });
check("once finished, the driver's app can ask whether the fare has landed", ["WAITING", "PAID"].includes(justDone.body.fare?.state), JSON.stringify(justDone.body.fare));
await settled(done.body.payment.id, d2.token);
check("and is told when it has", (await call("GET", `/trips/${paidRide.body.id}`, { token: d2.token })).body.fare?.state === "PAID");
check("so is the rider's", (await call("GET", `/trips/${paidRide.body.id}`, { token: r2 })).body.fare?.state === "PAID");
const holding = (await call("GET", "/drivers/me/balance", { token: d2.token })).body.payableXaf;
const withMoney = await call("DELETE", "/me", { token: d2.token, body: BYE });
check(
  "nor while we are holding his money — deleting must not forfeit it",
  holding > 0 && withMoney.status === 409 && withMoney.body.error?.code === "money_held" && withMoney.body.error?.details?.payableXaf === holding,
  JSON.stringify({ holding, body: withMoney.body }),
);

const cashout = await call("POST", "/drivers/me/cashout", { token: d2.token });
const midPayout = await call("DELETE", "/me", { token: d2.token, body: BYE });
check("nor while the payout is still in the air", cashout.status === 201 && midPayout.status === 409, JSON.stringify({ cashout: cashout.status, del: midPayout.body }));
await settled(cashout.body.id, d2.token);

const driverGone = await call("DELETE", "/me", { token: d2.token, body: BYE });
check("once it has landed, he can", driverGone.status === 200, JSON.stringify(driverGone.body));
check(
  "he is offline and can never be dispatched",
  sql(`SELECT online || '|' || status FROM "Driver" WHERE id='${d2.id}'`) === "false|SUSPENDED",
  sql(`SELECT online || '|' || status FROM "Driver" WHERE id='${d2.id}'`),
);
check("his plate is kept, for a rider with a complaint", sql(`SELECT plate FROM "Driver" WHERE id='${d2.id}'`) === D2_PLATE);
check("his ledger is kept", Number(sql(`SELECT count(*) FROM "LedgerEntry" WHERE "driverId"='${d2.id}'`)) > 0);
check("he is out of the set dispatch searches", !inGeoSet(d2.id));
const pastTrip = await call("GET", `/trips/${paidRide.body.id}`, { token: r2 });
check("a rider looking back at that ride is not handed a placeholder to dial", pastTrip.status === 200 && pastTrip.body.driver?.phone === null, JSON.stringify(pastTrip.body.driver));

// ---------------------------------------------------------------------------
console.log("\n=== a fare by phone that does not go through ===");

/*
 * Her number ends in 00, so the fake provider refuses the charge. The server
 * has always recorded that and told both phones over the socket; neither app
 * listened, and both went on saying "paid". This is the question they now ask.
 */
const EMPTY_PHONE = `+23765${String(Date.now()).slice(-5)}00`;
const emptyRider = await signIn(EMPTY_PHONE, "RIDER", "Ndolo");
await call("POST", "/drivers/online", { token: d1.token, body: MUEA });
const unpaid = await book(emptyRider, "MOMO");
await call("POST", `/trips/${unpaid.body.id}/accept`, { token: d1.token });
await call("POST", `/trips/${unpaid.body.id}/start`, { token: d1.token, body: { pin: unpaid.body.pin } });
const unpaidDone = await call("POST", `/trips/${unpaid.body.id}/complete`, { token: d1.token });
await settled(unpaidDone.body.payment.id, d1.token);
const asDriverSees = await call("GET", `/trips/${unpaid.body.id}`, { token: d1.token });
check("the driver is told the phone payment failed, so he takes cash", asDriverSees.body.fare?.state === "FAILED", JSON.stringify(asDriverSees.body.fare));
check("the rider is told the same", (await call("GET", `/trips/${unpaid.body.id}`, { token: emptyRider })).body.fare?.state === "FAILED");
const cashRide = await call("GET", `/trips/${first.body.id}`, { token: r1 });
check("a cash ride is simply cash", cashRide.body.fare?.state === "CASH", JSON.stringify(cashRide.body.fare));
await call("POST", "/drivers/offline", { token: d1.token });

// ---------------------------------------------------------------------------
console.log("\n=== becoming a driver the way the app does it ===");

/*
 * Every suite signs its drivers in with the role already set to DRIVER. The app
 * never does: it signs everybody in as a rider, and the account becomes a
 * driver's when the application is sent. So the token on a real applicant's
 * phone says RIDER — and until this was fixed every driver route refused it.
 */
const APPLICANT_PHONE = `+2376577${nonce}`;
const asRider = await signIn(APPLICANT_PHONE, "RIDER", "Etonde Mokake");
const beforeApplying = await call("GET", "/drivers/me/documents", { token: asRider });
check("a rider's token is refused on a driver's route", beforeApplying.status === 403, String(beforeApplying.status));
const applied = await call("POST", "/drivers/apply", {
  token: asRider,
  body: { name: "Etonde Mokake", plate: `SW ${nonce} A`, cniNumber: `7${nonce}0009`, homeZone: "MUEA" },
});
check("applying hands back a token", applied.status === 201 && typeof applied.body.token === "string", JSON.stringify(Object.keys(applied.body)));
const withNewToken = await call("GET", "/drivers/me/documents", { token: applied.body.token });
check("which opens the documents screen he is sent to next", withNewToken.status === 200, JSON.stringify(withNewToken.body).slice(0, 120));

// Another phone, still holding the token from before he applied.
const healed = await call("GET", "/auth/me", { token: asRider });
check("a phone with the old token is given a current one when it asks who it is", healed.status === 200 && healed.body.role === "DRIVER" && typeof healed.body.token === "string", JSON.stringify({ role: healed.body.role, token: typeof healed.body.token }));
check("and that one works too", (await call("GET", "/drivers/me/documents", { token: healed.body.token })).status === 200);
const current = await call("GET", "/auth/me", { token: applied.body.token });
check("a token that is already right is not replaced", current.status === 200 && current.body.token === undefined, JSON.stringify(Object.keys(current.body)));

// ---------------------------------------------------------------------------
console.log("\n=== the pages anybody can open ===");

const page = (path, lang) => fetch(`${API}${path}`, { headers: { accept: "text/html", ...(lang ? { "accept-language": lang } : {}) } }).then(async (r) => ({ status: r.status, type: r.headers.get("content-type"), text: await r.text() }));

const privacy = await page("/legal/privacy");
check("the privacy policy has a web address", privacy.status === 200 && privacy.type?.includes("text/html") && privacy.text.includes("<h1>Privacy</h1>"), `${privacy.status} ${privacy.type}`);
const privacyFr = await page("/legal/privacy?lang=fr");
check("in French when asked", privacyFr.text.includes('<html lang="fr">') && privacyFr.text.includes("Confidentialité"));
const byBrowser = await page("/legal/terms", "fr-CM,fr;q=0.9");
check("or when the browser asks", byBrowser.status === 200 && byBrowser.text.includes('<html lang="fr">'));
const del = await page("/legal/delete-account");
check("there is a page for deleting an account without the app", del.status === 200 && del.text.includes("mailto:privacy@fakoride.cm"), String(del.status));
check("carrying the number to call", del.text.includes(`tel:${SUPPORT_PHONE}`));
const support = await call("GET", "/support");
check("the app can ask for that number", support.status === 200 && support.body.phone === SUPPORT_PHONE, JSON.stringify(support.body));

await call("POST", "/drivers/offline", { token: d1.token });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

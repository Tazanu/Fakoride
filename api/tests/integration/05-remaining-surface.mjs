/**
 * The endpoints the first four suites never touched.
 *
 * Written before starting the apps, because "the backend is done" is a claim
 * about endpoints nobody has called yet as much as about the ones we walked.
 * Three of these — resolve, zones, search — are the first three calls the rider
 * home screen makes, and nothing had ever exercised them.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const CHECKPOINT = { lat: 4.1531, lng: 9.2764 };
/** Between Checkpoint and Molyko, so resolution has to actually choose. */
const SOMEWHERE = { lat: 4.1543, lng: 9.2752 };

const nonce = String(Date.now()).slice(-5);
const DRIVER_PHONE = `+2376733${nonce}`;
const DRIVER_PLATE = `SW ${nonce} R`;
const REJECT_PHONE = `+2376744${nonce}`;
const REJECT_PLATE = `SW ${nonce} J`;
const RIDER_PHONE = `+2376755${nonce}`;

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

async function signIn(phone, role, name) {
  await call("POST", "/auth/otp/request", { body: { phone } });
  await new Promise((r) => setTimeout(r, 250));
  const v = await call("POST", "/auth/otp/verify", { body: { phone, code: otpFromLog(phone), role, name } });
  if (v.status !== 200) throw new Error(JSON.stringify(v.body));
  return v.body.token;
}

/**
 * The database the API under test is actually using.
 *
 * These helpers used to hardcode `fako_ride`. That is right until somebody
 * points the suite at a second database to avoid destroying their dev data —
 * and then every SQL assertion silently queries the wrong one and fails,
 * which reads exactly like a pile of real bugs. Follow DATABASE_URL.
 */
const DB = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] || "fako_ride";

const sql = (q) =>
  execSync(`docker exec fako-postgres psql -U fako -d ${DB} -tAc "${q.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
  }).trim();

const redisCmd = (...args) =>
  execSync(`docker exec fako-redis redis-cli ${args.join(" ")}`, { encoding: "utf8" }).trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- setup ------------------------------------------------------------------

const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");
const riderToken = await signIn(RIDER_PHONE, "RIDER", "Ayuk");

// Clear the road so dispatch has exactly one bike to choose from.
const leftover = await call("GET", "/admin/drivers?status=ACTIVE", { token: adminToken });
for (const d of leftover.body.drivers ?? []) {
  await call("POST", `/admin/drivers/${d.id}/suspend`, { token: adminToken, body: { reason: "Clearing the road." } });
}

const driverToken = await signIn(DRIVER_PHONE, "DRIVER", "Ernest Njie");
await call("POST", "/drivers/apply", {
  token: driverToken,
  body: { name: "Ernest Njie", plate: DRIVER_PLATE, cniNumber: `7${nonce}0001`, homeZone: "MOLYKO" },
});
const pending = await call("GET", "/admin/drivers", { token: adminToken });
const driver = pending.body.drivers.find((d) => d.plate === DRIVER_PLATE);
await call("POST", `/admin/drivers/${driver.id}/verify`, { token: adminToken, body: { licenceNumber: `S10-${nonce}` } });
await call("POST", "/drivers/online", { token: driverToken, body: CHECKPOINT });

console.log("\n=== the gazetteer, which the rider home screen opens with ===");
const zones = await call("GET", "/geo/zones");
check("every zone is served, without signing in", zones.body.zones?.length === 14, JSON.stringify(zones.body.zones?.length));
const checkpoint = zones.body.zones?.find((z) => z.code === "CHECKPOINT");
check("a zone carries its centroid and elevation", checkpoint?.centroid?.lat === 4.1531 && checkpoint?.elevationM === 470, JSON.stringify(checkpoint?.elevationM));
check("and the landmarks people actually name", checkpoint?.landmarks?.some((l) => l.name === "Checkpoint"), JSON.stringify(checkpoint?.landmarks?.map((l) => l.name)));
check("with the aliases they use out loud", checkpoint?.landmarks?.find((l) => l.name === "Checkpoint")?.aliases?.includes("CP"), JSON.stringify(checkpoint?.landmarks?.[0]?.aliases));

console.log("\n=== where am I ===");
const resolved = await call("GET", `/geo/resolve?lat=${CHECKPOINT.lat}&lng=${CHECKPOINT.lng}`);
check("a GPS fix becomes a zone", resolved.body.zone?.code === "CHECKPOINT", JSON.stringify(resolved.body.zone));
check("and a label a bendskin driver would understand", resolved.body.label?.includes("Checkpoint"), JSON.stringify(resolved.body.label));
check("with the nearest place named and measured", resolved.body.nearestLandmark?.name === "Checkpoint" && typeof resolved.body.nearestLandmark?.distanceKm === "number", JSON.stringify(resolved.body.nearestLandmark));

const between = await call("GET", `/geo/resolve?lat=${SOMEWHERE.lat}&lng=${SOMEWHERE.lng}`);
check("a point between two zones still resolves to one", Boolean(between.body.zone?.code), JSON.stringify(between.body.zone));

const badPoint = await call("GET", "/geo/resolve?lat=notanumber&lng=9.2");
check("a malformed fix is rejected, not guessed at", badPoint.status === 400, JSON.stringify(badPoint.status));

console.log("\n=== searching for a place ===");
const byName = await call("GET", "/geo/search?q=check");
check("a partial name finds it", byName.body.results?.some((r) => r.name === "Checkpoint"), JSON.stringify(byName.body.results?.map((r) => r.name)));
check("and says which zone it is in", byName.body.results?.[0]?.zone && byName.body.results?.[0]?.lat, JSON.stringify(byName.body.results?.[0]));

const byAlias = await call("GET", "/geo/search?q=CP");
check("an alias finds it too — 'CP' has to find Checkpoint", byAlias.body.results?.some((r) => r.name === "Checkpoint"), JSON.stringify(byAlias.body.results?.map((r) => r.name)));

const tooShort = await call("GET", "/geo/search?q=c");
check("one letter searches nothing, rather than everything", Array.isArray(tooShort.body.results) && tooShort.body.results.length === 0, JSON.stringify(tooShort.body.results?.length));

const noMatch = await call("GET", "/geo/search?q=zzzznowhere");
check("a miss is an empty list, not an error", noMatch.status === 200 && noMatch.body.results?.length === 0);

console.log("\n=== quoting a fare before anything is booked ===");
const quoteByZone = await call("GET", "/fares/quote?fromZone=CHECKPOINT&toZone=UB", { token: riderToken });
check("a zone pair quotes the seeded fare", quoteByZone.body.priceXaf === 250, JSON.stringify(quoteByZone.body));
check("and the mobile price is 15 less", quoteByZone.body.mobilePriceXaf === 235, JSON.stringify(quoteByZone.body.mobilePriceXaf));
check("saying whether the table or the formula priced it", ["FIELD", "FORMULA"].includes(quoteByZone.body.source), JSON.stringify(quoteByZone.body.source));

const quoteByPoint = await call("GET", `/fares/quote?fromLat=${CHECKPOINT.lat}&fromLng=${CHECKPOINT.lng}&toZone=UB`, { token: riderToken });
check("a GPS point quotes the same fare as the zone does", quoteByPoint.body.priceXaf === quoteByZone.body.priceXaf, JSON.stringify(quoteByPoint.body.priceXaf));

const uphill = await call("GET", "/fares/quote?fromZone=MOLYKO&toZone=GREAT_SOPPO", { token: riderToken });
const downhill = await call("GET", "/fares/quote?fromZone=GREAT_SOPPO&toZone=MOLYKO", { token: riderToken });
check("the mountain is priced directionally — uphill costs more", uphill.body.priceXaf > downhill.body.priceXaf, `up ${uphill.body.priceXaf} vs down ${downhill.body.priceXaf}`);
check("and the uphill leg is flagged as a hill fare", uphill.body.hillFare === true, JSON.stringify(uphill.body.hillFare));

const sameZone = await call("GET", "/fares/quote?fromZone=UB&toZone=UB", { token: riderToken });
check("a trip to where you already are is refused", sameZone.status === 400 && sameZone.body.error.code === "same_zone", JSON.stringify(sameZone.body));

const unknownZone = await call("GET", "/fares/quote?fromZone=CHECKPOINT&toZone=NOWHERE", { token: riderToken });
check("an unknown drop-off is a 404, not a guess", unknownZone.status === 404, JSON.stringify(unknownZone.status));

const anonQuote = await call("GET", "/fares/quote?fromZone=CHECKPOINT&toZone=UB");
check("quoting needs an account", anonQuote.status === 401, JSON.stringify(anonQuote.status));

console.log("\n=== the driver's own record ===");
const patched = await call("PATCH", "/drivers/me", {
  token: driverToken,
  body: { hasSpareHelmet: true, gender: "WOMAN", homeZone: "MILE17" },
});
check("he can correct what he carries and where he is based", patched.body.hasSpareHelmet === true && patched.body.gender === "WOMAN", JSON.stringify(patched.body));

const patchedZone = sql(`SELECT z.code FROM "Driver" d JOIN "Zone" z ON z.id=d."homeZoneId" WHERE d.id='${driver.id}'`);
check("the home zone actually moved", patchedZone === "MILE17", patchedZone);

const badZone = await call("PATCH", "/drivers/me", { token: driverToken, body: { homeZone: "ATLANTIS" } });
check("an unknown zone is refused", badZone.status === 404, JSON.stringify(badZone.status));

const plateAttempt = await call("PATCH", "/drivers/me", { token: driverToken, body: { plate: "FAKE 0000" } });
const plateNow = sql(`SELECT plate FROM "Driver" WHERE id='${driver.id}'`);
check("he cannot rewrite his own plate — that is ops' job", plateNow === DRIVER_PLATE, `${plateNow} (status ${plateAttempt.status})`);

const earnings = await call("GET", "/drivers/me/earnings?days=7", { token: driverToken });
check("the rolling earnings window answers", earnings.status === 200 && typeof earnings.body.earnedXaf === "number", JSON.stringify(earnings.body).slice(0, 120));
check("and carries the day's fee alongside the trips", Array.isArray(earnings.body.accessFees) && Array.isArray(earnings.body.trips), JSON.stringify(earnings.body.accessFees));

console.log("\n=== the position fallback, for when the socket is down ===");
/**
 * The dispatch key follows the vehicle, not a guess.
 *
 * These read `drivers:online:MOTO` before the taxi pivot made CAR the
 * default, so they were looking in an empty set: one failed, and the one
 * after it passed vacuously — zero equals zero whether or not suspension
 * clears Redis at all. A test that cannot fail is worse than one that does.
 */
const geoKey = `drivers:online:${sql(`SELECT "vehicleType" FROM "Driver" WHERE id='${driver.id}'`)}`;
const before = redisCmd("GEOPOS", geoKey, driver.id);
const moved = await call("POST", "/drivers/position", { token: driverToken, body: { lat: 4.1600, lng: 9.2800 } });
check("a REST position ping is accepted", moved.body.ok === true, JSON.stringify(moved.body));
const after = redisCmd("GEOPOS", geoKey, driver.id);
check("and actually moves him", after !== before, `${before} -> ${after}`);

const seenAt = sql(`SELECT "lastSeenAt" IS NOT NULL FROM "Driver" WHERE id='${driver.id}'`);
check("it also marks him as recently seen", seenAt === "t", seenAt);

console.log("\n=== asking the provider again about one payment ===");
await call("POST", "/drivers/position", { token: driverToken, body: CHECKPOINT });
const trip = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB", paymentMethod: "MOMO" },
});
check("a trip is offered to the one bike on the road", trip.body.status === "OFFERED", JSON.stringify(trip.body.status));
await call("POST", `/trips/${trip.body.id}/accept`, { token: driverToken });
await call("POST", `/trips/${trip.body.id}/start`, { token: driverToken, body: { pin: trip.body.pin } });
const completed = await call("POST", `/trips/${trip.body.id}/complete`, { token: driverToken });
const paymentId = completed.body.payment?.id;
check("completing starts a charge", Boolean(paymentId), JSON.stringify(completed.body.payment));

await sleep(600);
const refreshed = await call("POST", `/admin/payments/${paymentId}/refresh`, { token: adminToken });
check("ops can ask the provider again on demand", refreshed.status === 200, JSON.stringify(refreshed.body));
check("and is told what the provider actually said", ["SUCCESSFUL", "PENDING", "FAILED", "EXPIRED"].includes(refreshed.body.providerSaid), JSON.stringify(refreshed.body));

const unknownPayment = await call("POST", "/admin/payments/does-not-exist/refresh", { token: adminToken });
check("refreshing a payment that does not exist is a 404", unknownPayment.status === 404, JSON.stringify(unknownPayment.status));

console.log("\n=== the morning sweep ===");
const sweep = await call("POST", "/admin/access-fees/collect", { token: adminToken });
check("the sweep runs", sweep.status === 200 && typeof sweep.body.attempted === "number", JSON.stringify(sweep.body));
check(
  "and leaves today alone — he is still out working, and pays tomorrow",
  sweep.body.attempted === 0,
  JSON.stringify(sweep.body),
);
const todayStillUnpaid = sql(
  `SELECT paid FROM "AccessFeeCharge" WHERE "driverId"='${driver.id}' ORDER BY "serviceDate" DESC LIMIT 1`,
);
check("today's fee is still outstanding, as designed", todayStillUnpaid === "f", todayStillUnpaid);

console.log("\n=== going offline ===");
const offline = await call("POST", "/drivers/offline", { token: driverToken });
check("he can take himself off the road", offline.body.online === false, JSON.stringify(offline.body));

const gone = redisCmd("ZSCORE", geoKey, driver.id);
check("which clears him from the dispatch geo set", gone === "", `zscore='${gone}'`);

const dbOffline = sql(`SELECT online FROM "Driver" WHERE id='${driver.id}'`);
check("and from Postgres too", dbOffline === "f", dbOffline);

const noBikes = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB" },
});
check("with nobody on the road a rider is told honestly", noBikes.body.status === "NO_DRIVER_FOUND", JSON.stringify(noBikes.body.status));

console.log("\n=== turning an applicant down ===");
const rejectToken = await signIn(REJECT_PHONE, "DRIVER", "Ndip Arrey");
await call("POST", "/drivers/apply", {
  token: rejectToken,
  body: { name: "Ndip Arrey", plate: REJECT_PLATE, cniNumber: `8${nonce}0002` },
});
const queue = await call("GET", "/admin/drivers", { token: adminToken });
const applicant = queue.body.drivers.find((d) => d.plate === REJECT_PLATE);
check("he is waiting in the queue", Boolean(applicant), JSON.stringify(queue.body.waiting));

const noReason = await call("POST", `/admin/drivers/${applicant.id}/reject`, { token: adminToken, body: {} });
check("rejecting without a reason is refused", noReason.status === 400, JSON.stringify(noReason.status));

const rejected = await call("POST", `/admin/drivers/${applicant.id}/reject`, {
  token: adminToken,
  body: { reason: "The plate on the bike does not match the papers." },
});
check("with a reason it goes through", rejected.body.status === "REJECTED", JSON.stringify(rejected.body));

const stillBlocked = await call("POST", "/drivers/online", { token: rejectToken, body: CHECKPOINT });
check("and he cannot go online", stillBlocked.status === 403, JSON.stringify(stillBlocked.status));

const record = await call("GET", `/admin/drivers/${applicant.id}`, { token: adminToken });
check("the reason is kept, in words a person can read back to him", record.body.history?.[0]?.note?.includes("does not match"), JSON.stringify(record.body.history?.[0]));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

/**
 * End-to-end smoke test against the live stack.
 * Walks one trip from OTP to complaint, exercising every endpoint added today.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const CHECKPOINT = { lat: 4.1531, lng: 9.2764 };

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? `  <- ${detail}` : ""}`);
  }
}

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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

/** The console SMS sender writes the code to the server log. */
function otpFromLog(phone) {
  const log = readFileSync(LOG, "utf8");
  const matches = [...log.matchAll(/"to":"(\+237\d+)","message":"(\d{6})/g)];
  const mine = matches.filter((m) => m[1] === phone);
  if (mine.length === 0) throw new Error(`no OTP in log for ${phone}`);
  return mine[mine.length - 1][2];
}

async function signIn(phone, role, name) {
  const requested = await call("POST", "/auth/otp/request", { body: { phone } });
  if (requested.status !== 200) throw new Error(`otp request failed: ${JSON.stringify(requested.body)}`);
  await new Promise((r) => setTimeout(r, 250)); // let pino flush
  const code = otpFromLog(phone);
  const verified = await call("POST", "/auth/otp/verify", { body: { phone, code, role, name } });
  if (verified.status !== 200) throw new Error(`otp verify failed: ${JSON.stringify(verified.body)}`);
  return verified.body.token;
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
  execSync(`docker exec fako-postgres psql -U fako -d ${DB} -tAc "${q}"`, { encoding: "utf8" }).trim();

console.log("\n=== auth ===");
const riderToken = await signIn("+237670000001", "RIDER", "Mirabel");
check("rider signs in with a phone and a six-digit code", Boolean(riderToken));
const driverToken = await signIn("+237670000002", "DRIVER", "Ernest Njie");
check("driver signs in", Boolean(driverToken));

console.log("\n=== driver onboarding ===");
const applied = await call("POST", "/drivers/apply", {
  token: driverToken,
  body: {
    name: "Ernest Njie",
    plate: "SW 4192 B",
    cniNumber: "123456789",
    gender: "WOMAN",
    hasSpareHelmet: true,
    homeZone: "MOLYKO",
  },
});
check("driver applies and lands in PENDING_REVIEW", applied.body.status === "PENDING_REVIEW", JSON.stringify(applied.body));

const blocked = await call("POST", "/drivers/online", { token: driverToken, body: CHECKPOINT });
check("an unverified driver cannot go online", blocked.status === 403 && blocked.body.error.code === "not_verified");

// Approved the way ops actually approves him: through the console, with the S10
// number read off the card. No SQL — verification is a route, not a database poke.
const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");
const queue = await call("GET", "/admin/drivers", { token: adminToken });
const applicant = queue.body.drivers?.find((d) => d.plate === "SW 4192 B");
check("he is waiting in the ops verification queue", Boolean(applicant), JSON.stringify(queue.body.waiting));
const verifiedDriver = await call("POST", `/admin/drivers/${applicant.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: "S10-2026-0001", overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
});
check("ops verifies him", verifiedDriver.body.status === "ACTIVE", JSON.stringify(verifiedDriver.body));

const online = await call("POST", "/drivers/online", { token: driverToken, body: CHECKPOINT });
check("a verified driver goes online and is placed in a zone", online.body.zone?.code === "CHECKPOINT", JSON.stringify(online.body));

console.log("\n=== the access fee ===");
const today1 = await call("GET", "/drivers/me/today", { token: driverToken });
check("going online raises today's access fee", today1.body.accessFee?.amountXaf === 500, JSON.stringify(today1.body));
check("commission is zero and says so", today1.body.commissionXaf === 0);
check("no trips yet", today1.body.tripCount === 0 && today1.body.earnedXaf === 0);

await call("POST", "/drivers/online", { token: driverToken, body: CHECKPOINT });
const feeRows = Number(sql(`SELECT count(*) FROM \\"AccessFeeCharge\\"`));
check("going online twice in a day charges once", feeRows === 1, `rows=${feeRows}`);

console.log("\n=== demand ===");
const nearby = await call("GET", `/demand/nearby?lat=${CHECKPOINT.lat}&lng=${CHECKPOINT.lng}`, { token: riderToken });
check("the rider sees a driver count, not positions", nearby.body.driversNearby === 1 && nearby.body.position === undefined, JSON.stringify(nearby.body));

const boardBefore = await call("GET", "/demand/zones", { token: driverToken });
const cpBefore = boardBefore.body.zones?.find((z) => z.zone === "CHECKPOINT");
check("the board is driver-only and lists every zone", boardBefore.body.zones?.length === 14, `len=${boardBefore.body.zones?.length}`);
check("a zone with a bike and no riders reads QUIET", cpBefore?.level === "QUIET", JSON.stringify(cpBefore));
const boardAsRider = await call("GET", "/demand/zones", { token: riderToken });
check("a rider cannot read the supply board", boardAsRider.status === 403);

console.log("\n=== booking ===");
const fares = await call("GET", "/fares/from/CHECKPOINT");
const toUB = fares.body.destinations?.find((d) => d.code === "UB");
check("the seeded corridor fare matches the mockup: Checkpoint to UB is 250", toUB?.priceXaf === 250, JSON.stringify(toUB));

const trip = await call("POST", "/trips", {
  token: riderToken,
  body: {
    pickupLat: CHECKPOINT.lat,
    pickupLng: CHECKPOINT.lng,
    toZone: "UB",
    paymentMethod: "CASH",
    needsHelmet: true,
    womanDriverOnly: true,
  },
});
check("the trip is created at the quoted fare", trip.body.priceXaf === 250, JSON.stringify(trip.body));
check("preferences are recorded", trip.body.needsHelmet === true && trip.body.womanDriverOnly === true);
check("a four-digit PIN is issued to the rider", /^\d{4}$/.test(trip.body.pin ?? ""));
check("dispatch offered it to the matching driver", trip.body.status === "OFFERED", JSON.stringify(trip.body));

const tripId = trip.body.id;
const pin = trip.body.pin;

const boardBusy = await call("GET", "/demand/zones", { token: driverToken });
const cpBusy = boardBusy.body.zones?.find((z) => z.zone === "CHECKPOINT");
check("a waiting rider moves the zone off QUIET", cpBusy?.waitingRiders === 1 && cpBusy?.level !== "QUIET", JSON.stringify(cpBusy));

console.log("\n=== the trip ===");
const asDriver = await call("GET", `/trips/${tripId}`, { token: driverToken });
check("the driver never sees the PIN", asDriver.body.pin === undefined, JSON.stringify(asDriver.body.pin));

const accepted = await call("POST", `/trips/${tripId}/accept`, { token: driverToken });
check("the driver holding the offer can accept", accepted.body.status === "ACCEPTED", JSON.stringify(accepted.body));

await call("POST", `/trips/${tripId}/arrived`, { token: driverToken });

const wrongPin = await call("POST", `/trips/${tripId}/start`, { token: driverToken, body: { pin: pin === "0000" ? "1111" : "0000" } });
check("a wrong PIN does not start the trip", wrongPin.status === 400 && wrongPin.body.error.code === "wrong_pin");

const started = await call("POST", `/trips/${tripId}/start`, { token: driverToken, body: { pin } });
check("the right PIN starts it", started.body.status === "IN_PROGRESS", JSON.stringify(started.body));

console.log("\n=== sharing ===");
const share = await call("POST", `/trips/${tripId}/share`, { token: riderToken, body: { sharedWith: "Mum" } });
check("the rider can share the trip", Boolean(share.body.token), JSON.stringify(share.body));

const watched = await call("GET", `/share/${share.body.token}`);
check("the link opens without signing in", watched.status === 200, JSON.stringify(watched.body).slice(0, 200));
check("it shows the plate", watched.body.driver?.plate === "SW 4192 B");
check("it shows a first name only", watched.body.driver?.firstName === "Ernest");
check("it never carries the PIN", JSON.stringify(watched.body).includes(pin) === false);
check("it never carries a phone number", JSON.stringify(watched.body).includes("+237") === false);
check("it shows the live position", watched.body.position !== null, JSON.stringify(watched.body.position));

const mine = await call("GET", `/trips/${tripId}/share`, { token: riderToken });
check("the rider is told who is watching, and that it was opened", mine.body.shares?.[0]?.sharedWith === "Mum" && mine.body.shares?.[0]?.viewCount === 1, JSON.stringify(mine.body));

const revoked = await call("DELETE", `/trips/${tripId}/share/${share.body.token}`, { token: riderToken });
check("the rider can take the link back", revoked.body.revoked === true);
const dead = await call("GET", `/share/${share.body.token}`);
check("a revoked link stops working", dead.status === 404 && dead.body.error.code === "link_dead");

console.log("\n=== SOS ===");
const sos = await call("POST", `/trips/${tripId}/sos`, { token: riderToken, body: { ...CHECKPOINT, note: "test" } });
check("the rider can raise an alarm", sos.status === 201 && Boolean(sos.body.alertId), JSON.stringify(sos.body));
const sosRow = sql(`SELECT status || '|' || \\"raisedByRole\\" FROM \\"SosAlert\\" LIMIT 1`);
check("it is stored as RAISED, by the rider, for a human to close", sosRow === "RAISED|RIDER", sosRow);

console.log("\n=== money ===");
const completed = await call("POST", `/trips/${tripId}/complete`, { token: driverToken });
check("the driver completes the trip", completed.body.status === "COMPLETED", JSON.stringify(completed.body));

const today2 = await call("GET", "/drivers/me/today", { token: driverToken });
check("today shows one trip at 250", today2.body.tripCount === 1 && today2.body.earnedXaf === 250, JSON.stringify(today2.body));
check("still nothing taken by us", today2.body.commissionXaf === 0);
check("he keeps the fare less the day's fee", today2.body.keptXaf === 250 - 500, JSON.stringify(today2.body.keptXaf));

const week = await call("GET", "/drivers/me/week", { token: driverToken });
check("the week has seven days, Monday first", week.body.days?.length === 7 && week.body.days?.[0]?.weekday === "Mon", JSON.stringify(week.body.days?.map((d) => d.weekday)));
const monday = week.body.days?.[0];
check("an unworked Monday is named a ghost town", monday?.ghostTown === true && monday?.feeXaf === 0, JSON.stringify(monday));
check("the week totals the day he did work", week.body.earnedXaf === 250 && week.body.daysWorked === 1, JSON.stringify({ e: week.body.earnedXaf, d: week.body.daysWorked }));

console.log("\n=== after the trip ===");
const rated = await call("POST", `/trips/${tripId}/rate`, { token: riderToken, body: { stars: 5 } });
check("the rider rates the trip", rated.body.rated === true);

const complaint = await call("POST", "/complaints", {
  token: riderToken,
  body: { tripId, category: "FARE_DISPUTE", message: "He asked for more at the top of the hill." },
});
check("a complaint is filed", complaint.status === 201, JSON.stringify(complaint.body));
const respondBy = new Date(complaint.body.respondBy) - new Date();
check("it carries the one-day promise as a deadline", respondBy > 23 * 3600e3 && respondBy <= 24 * 3600e3, `${Math.round(respondBy / 3600e3)}h`);

const list = await call("GET", "/trips", { token: riderToken });
check("the rider's trips tab lists it", list.body.trips?.length === 1 && list.body.trips[0].id === tripId, JSON.stringify(list.body.trips?.length));

const repeats = await call("GET", "/trips/repeats?fromZone=CHECKPOINT", { token: riderToken });
check("the home screen offers it as a one-tap repeat at the right price", repeats.body.repeats?.[0]?.zone === "UB" && repeats.body.repeats?.[0]?.priceXaf === 250, JSON.stringify(repeats.body));

console.log("\n=== preference filtering ===");
sql(`UPDATE \\"Driver\\" SET gender='MAN'`);
const noWoman = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB", womanDriverOnly: true },
});
check("asking for a woman driver when none is online finds no bike", noWoman.body.status === "NO_DRIVER_FOUND", JSON.stringify(noWoman.body));

sql(`UPDATE \\"Driver\\" SET \\"hasSpareHelmet\\"=false`);
const noHelmet = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB", needsHelmet: true },
});
check("asking for a helmet when no bike carries one finds no bike", noHelmet.body.status === "NO_DRIVER_FOUND", JSON.stringify(noHelmet.body));

const plain = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB" },
});
check("without the preference the same driver is offered it", plain.body.status === "OFFERED", JSON.stringify(plain.body));

console.log("\n=== driver declines, rider keeps waiting ===");
const declined = await call("POST", `/trips/${plain.body.id}/decline`, { token: driverToken });
check("the driver can leave it", declined.body.declined === true, JSON.stringify(declined.body));
check("with nobody else nearby the rider is told honestly", declined.body.passedOn === false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

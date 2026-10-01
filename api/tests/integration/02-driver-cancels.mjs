/**
 * The defect fixed today: a driver cancelling after accepting used to write
 * CANCELLED_BY_DRIVER onto the trip, which dispatch will not re-offer — the
 * rider sat watching a spinner that could never resolve.
 *
 * Needs two drivers on the road to prove, which is why it is not in the main
 * smoke run.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const CHECKPOINT = { lat: 4.1531, lng: 9.2764 };

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

async function signIn(phone, role, name) {
  await call("POST", "/auth/otp/request", { body: { phone } });
  await new Promise((r) => setTimeout(r, 250));
  const v = await call("POST", "/auth/otp/verify", { body: { phone, code: otpFromLog(phone), role, name } });
  if (v.status !== 200) throw new Error(JSON.stringify(v.body));
  return v.token ?? v.body.token;
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

const riderToken = await signIn("+237670000001", "RIDER", "Mirabel");

// A second bike on the same corner.
const driverBToken = await signIn("+237670000003", "DRIVER", "Bernard Eyong");
await call("POST", "/drivers/apply", {
  token: driverBToken,
  body: { name: "Bernard Eyong", plate: "SW 7781 C", cniNumber: "987654321" },
});
// Verified through the ops console, like the first one.
const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");
const pending = await call("GET", "/admin/drivers", { token: adminToken });
const bernard = pending.body.drivers?.find((d) => d.plate === "SW 7781 C");
check("the second bike is waiting for verification", Boolean(bernard), JSON.stringify(pending.body.waiting));
await call("POST", `/admin/drivers/${bernard.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: "S10-2026-0002", overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
});
await call("POST", "/drivers/online", { token: driverBToken, body: CHECKPOINT });

// Driver A from the first run is still online; make sure of it.
const driverAToken = await signIn("+237670000002", "DRIVER", "Ernest Njie");
await call("POST", "/drivers/online", { token: driverAToken, body: CHECKPOINT });

const tokenByDriverId = {
  [sql(`SELECT d.id FROM \\"Driver\\" d JOIN \\"User\\" u ON u.id=d.\\"userId\\" WHERE u.phone='+237670000002'`)]: driverAToken,
  [sql(`SELECT d.id FROM \\"Driver\\" d JOIN \\"User\\" u ON u.id=d.\\"userId\\" WHERE u.phone='+237670000003'`)]: driverBToken,
};

console.log("\n=== a driver cancels after accepting ===");
const trip = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB" },
});
const tripId = trip.body.id;
check("two bikes online, the trip is offered", trip.body.status === "OFFERED", JSON.stringify(trip.body));

const firstHolder = sql(`SELECT \\"offeredDriverIds\\"[1] FROM \\"Trip\\" WHERE id='${tripId}'`);
const firstToken = tokenByDriverId[firstHolder];
check("we know which bike holds it", Boolean(firstToken), firstHolder);

const accepted = await call("POST", `/trips/${tripId}/accept`, { token: firstToken });
check("he accepts", accepted.body.status === "ACCEPTED", JSON.stringify(accepted.body));

const cancelled = await call("POST", `/trips/${tripId}/cancel`, { token: firstToken, body: { reason: "bike trouble" } });
check("the trip is re-offered rather than killed", cancelled.body.status === "OFFERED", JSON.stringify(cancelled.body));
check("and it says so plainly", cancelled.body.requeued === true);

const row = sql(`SELECT status || '|' || coalesce(\\"driverId\\",'none') FROM \\"Trip\\" WHERE id='${tripId}'`);
const [status, attached] = row.split("|");
check("the trip is not in a terminal state", status === "OFFERED", row);
check("the cancelling driver is detached from the trip", attached === "none", row);

// An OFFERED trip has no driverId — that is only written on accept. The current
// holder of the offer is the last entry in offeredDriverIds.
const holder = sql(`SELECT "offeredDriverIds"[2] FROM "Trip" WHERE id='${tripId}'`.replace(/"/g, '\\"'));
check("it is now with the other bike", Boolean(holder) && holder !== firstHolder, holder);

const offered = sql(`SELECT array_length(\\"offeredDriverIds\\",1) FROM \\"Trip\\" WHERE id='${tripId}'`);
check("the driver who walked away is excluded from re-offer", Number(offered) === 2, `offeredDriverIds=${offered}`);

const events = sql(`SELECT string_agg(status::text, ',' ORDER BY at) FROM \\"TripEvent\\" WHERE \\"tripId\\"='${tripId}'`);
check("the cancellation is still on the record", events.includes("CANCELLED_BY_DRIVER"), events);
check("the append-only history reads in order", events.startsWith("REQUESTED,OFFERED,ACCEPTED,CANCELLED_BY_DRIVER,OFFERED"), events);

console.log("\n=== the second bike finishes it ===");
const secondToken = tokenByDriverId[holder];
const accepted2 = await call("POST", `/trips/${tripId}/accept`, { token: secondToken });
check("the second driver can accept the re-offer", accepted2.body.status === "ACCEPTED", JSON.stringify(accepted2.body));

const full = await call("GET", `/trips/${tripId}`, { token: riderToken });
await call("POST", `/trips/${tripId}/arrived`, { token: secondToken });
const started = await call("POST", `/trips/${tripId}/start`, { token: secondToken, body: { pin: full.body.pin } });
check("the PIN the rider was given still works after the handover", started.body.status === "IN_PROGRESS", JSON.stringify(started.body));

const done = await call("POST", `/trips/${tripId}/complete`, { token: secondToken });
check("the trip completes at the fare quoted before any of this", done.body.priceXaf === 250, JSON.stringify(done.body));

const paid = sql(
  `SELECT d.plate FROM \\"LedgerEntry\\" l JOIN \\"Driver\\" d ON d.id=l.\\"driverId\\" WHERE l.\\"tripId\\"='${tripId}' AND l.type='FARE_CASH'`,
);
check("the fare is credited to the bike that actually rode it", paid === "SW 7781 C", paid);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

/**
 * The ops console API, end to end.
 *
 * The thing being proved: a driver can be taken from application to dispatch
 * without anybody touching SQL, and can be taken back out again in one call
 * that reaches both Postgres and Redis.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const CHECKPOINT = { lat: 4.1531, lng: 9.2764 };

// A fresh applicant every run: the queue only holds drivers nobody has decided
// about yet, so re-running with the same person would find an empty queue.
const nonce = String(Date.now()).slice(-6);
const APPLICANT_PHONE = `+2376700${nonce.slice(-5)}`;
const APPLICANT_PLATE = `SW ${nonce.slice(0, 4)} X`;
const APPLICANT_CNI = `555${nonce}`;

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

console.log("\n=== who may open the console ===");
const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");
const whoami = await call("GET", "/auth/me", { token: adminToken });
check("the granted account signs in as ADMIN", whoami.body.role === "ADMIN", JSON.stringify(whoami.body.role));
check("signing in cannot downgrade the role", whoami.body.role !== "RIDER");

const riderToken = await signIn("+237670000001", "RIDER", "Mirabel");
const denied = await call("GET", "/admin/drivers", { token: riderToken });
check("a rider cannot open the console", denied.status === 403 && denied.body.error.code === "wrong_role");
const anon = await call("GET", "/admin/drivers");
check("nor can an anonymous caller", anon.status === 401);

console.log("\n=== the verification queue ===");
const applicantToken = await signIn(APPLICANT_PHONE, "DRIVER", "Grace Ndive");
const application = await call("POST", "/drivers/apply", {
  token: applicantToken,
  body: { name: "Grace Ndive", plate: APPLICANT_PLATE, cniNumber: APPLICANT_CNI, gender: "WOMAN", hasSpareHelmet: true },
});
check("a new driver can apply", application.status === 201, JSON.stringify(application.body));

const queue = await call("GET", "/admin/drivers", { token: adminToken });
const grace = queue.body.drivers?.find((d) => d.plate === APPLICANT_PLATE);
check("the new applicant is in the pending queue", Boolean(grace), JSON.stringify(queue.body.waiting));
check("the queue says how long they have waited", typeof grace?.waitingDays === "number");

const detail = await call("GET", `/admin/drivers/${grace.id}`, { token: adminToken });
check("the detail view carries the CNI for checking", detail.body.cniNumber === APPLICANT_CNI);
check("and no licence number yet", detail.body.licenceNumber === null, JSON.stringify(detail.body.licenceNumber));

const noLicence = await call("POST", `/admin/drivers/${grace.id}/verify`, { token: adminToken, body: {} });
check("cannot verify without the S10 licence number", noLicence.status === 400, JSON.stringify(noLicence.body.error?.code));

const blocked = await call("POST", "/drivers/online", { token: applicantToken, body: CHECKPOINT });
check("an unverified driver still cannot go online", blocked.status === 403);

/*
 * No papers, no dispatch.
 *
 * Grace has sent nothing. This used to be guarded only by a disabled button
 * in the console, which is to say not guarded at all — anything holding an
 * admin token could put an unchecked driver on the road.
 */
const noDocs = await call("POST", `/admin/drivers/${grace.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: "S10-2026-4471" },
});
check("cannot verify a driver who has sent no documents", noDocs.status === 409 && noDocs.body.error?.code === "documents_missing", JSON.stringify(noDocs.body.error?.code));

const bareOverride = await call("POST", `/admin/drivers/${grace.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: "S10-2026-4471", overrideMissingDocuments: true },
});
check("and overriding that needs a reason in writing", bareOverride.status === 400 && bareOverride.body.error?.code === "override_needs_reason", JSON.stringify(bareOverride.body.error?.code));

const verified = await call("POST", `/admin/drivers/${grace.id}/verify`, {
  token: adminToken,
  body: {
    licenceNumber: "S10-2026-4471",
    overrideMissingDocuments: true,
    note: "CNI and S10 seen at the office.",
  },
});
check("verifying with the licence number activates the driver", verified.body.status === "ACTIVE", JSON.stringify(verified.body));

const nowOnline = await call("POST", "/drivers/online", { token: applicantToken, body: CHECKPOINT });
check("and she can now go online — no SQL touched", nowOnline.body.online === true, JSON.stringify(nowOnline.body));

const history = await call("GET", `/admin/drivers/${grace.id}`, { token: adminToken });
check("the decision is on the record with who made it", history.body.history?.[0]?.action === "VERIFIED", JSON.stringify(history.body.history));
check("and the record says the documents were missing", /document\(s\) missing/.test(history.body.history?.[0]?.note ?? ""), history.body.history?.[0]?.note);
check("the licence number is stored", history.body.licenceNumber === "S10-2026-4471");

console.log("\n=== suspension reaches dispatch ===");
/**
 * The dispatch key follows the vehicle, not a guess.
 *
 * These read `drivers:online:MOTO` before the taxi pivot made CAR the
 * default, so they were looking in an empty set: one failed, and the one
 * after it passed vacuously — zero equals zero whether or not suspension
 * clears Redis at all. A test that cannot fail is worse than one that does.
 */
const GEO_KEY = `drivers:online:${sql(`SELECT "vehicleType" FROM "Driver" WHERE id='${grace.id}'`)}`;
const geoBefore = Number(redisCmd("ZCARD", GEO_KEY));
check("she is in the dispatch geo set", geoBefore >= 1, `zcard=${geoBefore}`);

// Take every bike off the road through the console, then try to book.
const active = await call("GET", "/admin/drivers?status=ACTIVE", { token: adminToken });
for (const d of active.body.drivers) {
  await call("POST", `/admin/drivers/${d.id}/suspend`, { token: adminToken, body: { reason: "Testing suspension." } });
}
const geoAfter = Number(redisCmd("ZCARD", GEO_KEY));
check("suspending clears them from Redis, not just Postgres", geoAfter === 0, `zcard=${geoAfter}`);

const noBike = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB" },
});
check("a suspended fleet is offered nothing", noBike.body.status === "NO_DRIVER_FOUND", JSON.stringify(noBike.body.status));

const reinstated = await call("POST", `/admin/drivers/${grace.id}/reinstate`, { token: adminToken, body: { note: "Test over." } });
check("reinstating returns her to ACTIVE", reinstated.body.status === "ACTIVE", JSON.stringify(reinstated.body));
await call("POST", "/drivers/online", { token: applicantToken, body: CHECKPOINT });

const backOn = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "UB" },
});
check("and she is offered trips again", backOn.body.status === "OFFERED", JSON.stringify(backOn.body.status));

const trail = await call("GET", `/admin/drivers/${grace.id}`, { token: adminToken });
check("every decision is kept, newest first", trail.body.history?.map((h) => h.action).join(",") === "REINSTATED,SUSPENDED,VERIFIED", JSON.stringify(trail.body.history?.map((h) => h.action)));
check("the suspension reason was not lost", trail.body.history?.some((h) => h.note === "Testing suspension."));

console.log("\n=== the fare table ===");
const table = await call("GET", "/admin/fares?from=CHECKPOINT", { token: adminToken });
check("the table says how much of itself is still a guess", typeof table.body.stillProvisional === "number" && table.body.stillProvisional > 0, JSON.stringify(table.body.stillProvisional));

const notRound = await call("PUT", "/admin/fares", {
  token: adminToken,
  body: { from: "CHECKPOINT", to: "MOLYKO", priceXaf: 237 },
});
check("a fare that is not a multiple of 50 is refused", notRound.status === 400 && notRound.body.error.code === "not_round");

const tooLow = await call("PUT", "/admin/fares", {
  token: adminToken,
  body: { from: "CHECKPOINT", to: "MOLYKO", priceXaf: 100 },
});
check("a fare below the floor is refused", tooLow.status === 400 && tooLow.body.error.code === "below_floor");

// Pick a pair nobody has priced yet and move it off whatever the formula said,
// so the change is genuinely visible. Checkpoint to Molyko is no good for this:
// it is short enough that the formula already floors at 200.
const target = sql(
  `SELECT b.code || '|' || f."priceXaf" FROM "Fare" f JOIN "Zone" a ON a.id=f."fromZoneId" JOIN "Zone" b ON b.id=f."toZoneId" WHERE a.code='CHECKPOINT' AND f.source='FORMULA' ORDER BY f."priceXaf" DESC LIMIT 1`,
);
const [toCode, guessStr] = target.split("|");
const guessXaf = Number(guessStr);
const newPrice = guessXaf + 50;

const priced = await call("PUT", "/admin/fares", {
  token: adminToken,
  body: { from: "CHECKPOINT", to: toCode, priceXaf: newPrice, note: "Walked it on 15 Sept." },
});
check("a hand-priced fare is accepted", priced.body.priceXaf === newPrice, JSON.stringify(priced.body));
check(
  "it reports what the guess used to be",
  priced.body.previousXaf === guessXaf && priced.body.previousXaf !== newPrice,
  `was ${priced.body.previousXaf}, expected ${guessXaf}`,
);
const after = sql(
  `SELECT f.source FROM "Fare" f JOIN "Zone" a ON a.id=f."fromZoneId" JOIN "Zone" b ON b.id=f."toZoneId" WHERE a.code='CHECKPOINT' AND b.code='${toCode}'`,
);
check("and is now FIELD, which the seed formula will never overwrite", after === "FIELD", after);

const quoted = await call("GET", "/fares/from/CHECKPOINT");
check(
  "riders immediately see the corrected price",
  quoted.body.destinations?.find((d) => d.code === toCode)?.priceXaf === newPrice,
);

console.log("\n=== the live trip board ===");
// Booked fresh, because an offer expires after OFFER_TTL_SECONDS and moves on.
// With one bike on the road that means the trip goes terminal within seconds,
// and a board test reading an older trip is racing the sweeper.
const live = await call("POST", "/trips", {
  token: riderToken,
  body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "MILE17" },
});
check("a fresh trip is offered", live.body.status === "OFFERED", JSON.stringify(live.body.status));

const board = await call("GET", "/admin/trips", { token: adminToken });
check("the board shows trips still in flight", board.body.trips?.length > 0, JSON.stringify(board.body.trips?.length));
const waiting = board.body.trips?.find((t) => t.status === "OFFERED");
check("an unmatched rider shows how long they have waited", typeof waiting?.waitingSeconds === "number", JSON.stringify(waiting));
check("ops can see the rider's phone, to call them", Boolean(board.body.trips?.[0]?.riderPhone));

console.log("\n=== the SOS queue ===");
// Raised here rather than relying on a leftover from another suite: this has
// to be runnable twice in a row against the same database.
const raised = await call("POST", `/trips/${live.body.id}/sos`, {
  token: riderToken,
  body: { ...CHECKPOINT, note: "Bike went the wrong way." },
});
check("a rider can raise an alarm on a live trip", raised.status === 201, JSON.stringify(raised.body));

const sosQueue = await call("GET", "/admin/sos", { token: adminToken });
check("it lands in the ops queue, open and waiting", sosQueue.body.open >= 1, JSON.stringify(sosQueue.body.open));
const alert = sosQueue.body.alerts.find((a) => a.id === raised.body.alertId);
check("ops sees the one that was just raised", Boolean(alert), JSON.stringify(sosQueue.body.alerts?.length));
check("it carries the plate and both phone numbers", Boolean(alert.raisedByPhone) && alert.plate !== undefined);
check("and how long it has been open", typeof alert.minutesOpen === "number");

const ack = await call("POST", `/admin/sos/${alert.id}/resolve`, { token: adminToken, body: { status: "ACKNOWLEDGED" } });
check("acknowledging does not close it", ack.body.status === "ACKNOWLEDGED" && ack.body.resolvedAt === null, JSON.stringify(ack.body));
const closed = await call("POST", `/admin/sos/${alert.id}/resolve`, {
  token: adminToken,
  body: { status: "RESOLVED", outcome: "Called the rider; she was fine." },
});
check("resolving closes it with an outcome", closed.body.status === "RESOLVED" && Boolean(closed.body.resolvedAt));

console.log("\n=== the complaints queue ===");
const filed = await call("POST", "/complaints", {
  token: riderToken,
  body: { tripId: live.body.id, category: "FARE_DISPUTE", message: "He asked for more at the top of the hill." },
});
check("a rider can file a complaint", filed.status === 201, JSON.stringify(filed.body));

const complaints = await call("GET", "/admin/complaints", { token: adminToken });
const first = complaints.body.complaints?.find((c) => c.id === filed.body.id);
check("it reaches the ops queue", Boolean(first), JSON.stringify(complaints.body.complaints?.length));
check("it is shown with the trip it is about", Boolean(first.route) && first.priceXaf !== null, JSON.stringify(first));
check("and whether we are late answering it", first.overdue === false, JSON.stringify(first.respondBy));

const answered = await call("POST", `/admin/complaints/${first.id}/respond`, {
  token: adminToken,
  body: { response: "We called the driver. The fare was 250, as quoted.", close: true },
});
check("answering closes it", answered.body.status === "CLOSED", JSON.stringify(answered.body));
check("and records that we kept the one-day promise", answered.body.withinPromise === true);

const mine = await call("GET", "/complaints/mine", { token: riderToken });
const answeredBack = mine.body.complaints?.find((c) => c.id === filed.body.id);
check("the rider can read the answer", answeredBack?.response?.includes("250"), JSON.stringify(answeredBack?.response));

console.log("\n=== the service banner ===");
const notice = await call("POST", "/admin/notices", {
  token: adminToken,
  body: {
    message: "Heavy rain on the Soppo climb — expect longer waits.",
    messageFr: "Fortes pluies sur la montee de Soppo — attentes plus longues.",
    severity: "WARNING",
  },
});
check("ops can post a notice", notice.status === 201, JSON.stringify(notice.body));

const shown = await call("GET", "/geo/notices");
const posted = shown.body.notices?.find((n) => n.severity === "WARNING");
check("both apps see it immediately", Boolean(posted), JSON.stringify(shown.body.notices?.length));
check("in English and in French", Boolean(posted?.message) && Boolean(posted?.messageFr));

await call("DELETE", `/admin/notices/${notice.body.id}`, { token: adminToken });
const cleared = await call("GET", "/geo/notices");
check("and it can be ended", !cleared.body.notices?.some((n) => n.severity === "WARNING"), JSON.stringify(cleared.body.notices?.length));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

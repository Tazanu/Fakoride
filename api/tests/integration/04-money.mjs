/**
 * Money, end to end.
 *
 * Runs against the fake provider, which settles asynchronously and fails on a
 * number ending 00 — so every branch below is reached deliberately rather than
 * by luck. The claims being checked are the ones that would cost somebody real
 * francs if they were wrong:
 *
 *   a fare only becomes earnings when the money actually lands
 *   a declined prompt becomes cash owed, and both phones are told
 *   a webhook replayed twice pays once
 *   a forged webhook pays nothing
 *   a driver cannot cash out more than we are holding
 *   cash he was handed is never something we owe him
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "http://localhost:4000";
const LOG = process.argv[2];
const CHECKPOINT = { lat: 4.1531, lng: 9.2764 };
const WEBHOOK_SECRET = process.env.FAPSHI_WEBHOOK_SECRET ?? "integration-webhook-secret";

const nonce = String(Date.now()).slice(-5);
/** The fake provider fails any number ending 00 and succeeds on the rest. */
const PAYING_RIDER = `+2376711${nonce}`;
const BROKE_RIDER = "+237671100100";
const DRIVER_PHONE = `+2376722${nonce}`;
const DRIVER_PLATE = `SW ${nonce} M`;

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
      ...(headers ?? {}),
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The provider settles after a moment; poll our own view until it has. */
async function settled(paymentId, token, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { body } = await call("GET", "/drivers/me/payments", { token });
    const row = body.payments?.find((p) => p.id === paymentId);
    if (row && ["SUCCESSFUL", "FAILED", "EXPIRED"].includes(row.status)) return row;
    await sleep(400);
  }
  return null;
}

/** One complete trip, paid the given way. Returns the trip. */
async function ride(riderToken, driverToken, paymentMethod, toZone = "UB") {
  const trip = await call("POST", "/trips", {
    token: riderToken,
    body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone, paymentMethod },
  });
  if (trip.body.status !== "OFFERED") throw new Error(`no bike: ${JSON.stringify(trip.body)}`);
  const accepted = await call("POST", `/trips/${trip.body.id}/accept`, { token: driverToken });
  if (accepted.status !== 200) throw new Error(`our bike did not get the offer: ${JSON.stringify(accepted.body)}`);
  await call("POST", `/trips/${trip.body.id}/arrived`, { token: driverToken });
  await call("POST", `/trips/${trip.body.id}/start`, { token: driverToken, body: { pin: trip.body.pin } });
  const done = await call("POST", `/trips/${trip.body.id}/complete`, { token: driverToken });
  return { id: trip.body.id, priceXaf: trip.body.priceXaf, completion: done.body };
}

// --- setup ------------------------------------------------------------------

const adminToken = await signIn("+237600000099", "RIDER", "Ops Desk");

// The earlier suites leave their bikes on the road, and dispatch quite correctly
// offers trips to whoever is nearest. Every assertion below is about one
// driver's money, so this suite takes the corridor for itself first.
const leftover = await call("GET", "/admin/drivers?status=ACTIVE", { token: adminToken });
for (const d of leftover.body.drivers ?? []) {
  await call("POST", `/admin/drivers/${d.id}/suspend`, { token: adminToken, body: { reason: "Money suite needs an empty corridor." } });
}

const driverToken = await signIn(DRIVER_PHONE, "DRIVER", "Ernest Njie");
await call("POST", "/drivers/apply", {
  token: driverToken,
  body: { name: "Ernest Njie", plate: DRIVER_PLATE, cniNumber: `9${nonce}0001` },
});
const queue = await call("GET", "/admin/drivers", { token: adminToken });
const applicant = queue.body.drivers?.find((d) => d.plate === DRIVER_PLATE);
await call("POST", `/admin/drivers/${applicant.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: `S10-${nonce}`, overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
});
await call("POST", "/drivers/online", { token: driverToken, body: CHECKPOINT });

console.log("\n=== cash is never ours to hold ===");
const cashTrip = await ride(await signIn(PAYING_RIDER, "RIDER", "Mirabel"), driverToken, "CASH");
check("a cash trip completes with no payment attached", cashTrip.completion.payment === null, JSON.stringify(cashTrip.completion));

const afterCash = await call("GET", "/drivers/me/balance", { token: driverToken });
check("and we owe him nothing for it — he was handed the notes", afterCash.body.payableXaf === 0, JSON.stringify(afterCash.body.payableXaf));

const cashEntry = sql(`SELECT type FROM "LedgerEntry" WHERE "tripId"='${cashTrip.id}'`);
check("the cash fare is still recorded as his earnings", cashEntry === "FARE_CASH", cashEntry);

console.log("\n=== a fare paid by phone ===");
const riderToken = await signIn(PAYING_RIDER, "RIDER", "Mirabel");
const momoTrip = await ride(riderToken, driverToken, "MOMO", "MILE17");
check("completing starts a charge rather than finishing one", momoTrip.completion.payment?.status === "PENDING", JSON.stringify(momoTrip.completion.payment));

const beforeLanding = sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${momoTrip.id}'`);
check("nothing is credited while the money is still in the air", beforeLanding === "0", beforeLanding);

const landed = await settled(momoTrip.completion.payment.id, driverToken);
check("the charge settles", landed?.status === "SUCCESSFUL", JSON.stringify(landed));

const afterLanding = sql(`SELECT type || '|' || "amountXaf" FROM "LedgerEntry" WHERE "tripId"='${momoTrip.id}'`);
check("and only then is it his earnings", afterLanding === `FARE_MOBILE|${momoTrip.priceXaf}`, afterLanding);

const held = await call("GET", "/drivers/me/balance", { token: driverToken });
check("we are now holding exactly that fare for him", held.body.payableXaf === momoTrip.priceXaf, JSON.stringify(held.body));

console.log("\n=== a prompt the rider declines ===");
const brokeToken = await signIn(BROKE_RIDER, "RIDER", "Ngwa");
const failedTrip = await ride(brokeToken, driverToken, "MOMO", "GREAT_SOPPO");
const declined = await settled(failedTrip.completion.payment.id, driverToken);
check("the charge fails", declined?.status === "FAILED", JSON.stringify(declined));
check("with a reason a person can read", Boolean(declined?.failureReason), JSON.stringify(declined?.failureReason));

const noCredit = sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${failedTrip.id}'`);
check("a declined fare never becomes earnings", noCredit === "0", noCredit);

const stillHeld = await call("GET", "/drivers/me/balance", { token: driverToken });
check("and never becomes something we owe him", stillHeld.body.payableXaf === momoTrip.priceXaf, JSON.stringify(stillHeld.body.payableXaf));

const failureEvent = sql(
  `SELECT count(*) FROM "TripEvent" WHERE "tripId"='${failedTrip.id}' AND meta->>'mobilePaymentFailed'='true'`,
);
check("the trip record says the money did not arrive", failureEvent === "1", failureEvent);

const tripStill = sql(`SELECT status FROM "Trip" WHERE id='${failedTrip.id}'`);
check("but the trip itself stays completed — the ride happened", tripStill === "COMPLETED", tripStill);

console.log("\n=== the webhook ===");
/*
 * A webhook is a prompt to go and ask the provider, never a statement to be
 * believed. Two riders make that testable without racing the reconciler:
 *
 *   stuck   a number ending 11, which the fake provider keeps PENDING forever.
 *           Anything that settles it must have believed the webhook's body.
 *   target  an ordinary number, which the provider settles after ~150 ms and
 *           the reconciler would only notice after a full second. A webhook
 *           sent in between is the thing that settles it.
 */
async function completedMomoTrip(phone, name) {
  const token = await signIn(phone, "RIDER", name);
  const trip = await call("POST", "/trips", {
    token,
    body: { pickupLat: CHECKPOINT.lat, pickupLng: CHECKPOINT.lng, toZone: "MALINGO", paymentMethod: "MOMO" },
  });
  await call("POST", `/trips/${trip.body.id}/accept`, { token: driverToken });
  await call("POST", `/trips/${trip.body.id}/start`, { token: driverToken, body: { pin: trip.body.pin } });
  const done = await call("POST", `/trips/${trip.body.id}/complete`, { token: driverToken });
  const paymentId = done.body.payment.id;
  const transId = sql(`SELECT "providerTransId" FROM "Payment" WHERE id='${paymentId}'`);
  return { trip: trip.body, paymentId, transId };
}

const stuck = await completedMomoTrip(`+2376711${String(nonce).slice(0, -2)}11`, "Adeline");

const noSecret = await call("POST", "/payments/webhook", {
  body: { transId: stuck.transId, status: "SUCCESSFUL", externalId: stuck.paymentId },
});
check("a webhook with no secret is refused", noSecret.status === 401, JSON.stringify(noSecret.body));

const wrongSecret = await call("POST", "/payments/webhook", {
  headers: { "x-wh-secret": "not-the-secret-at-all-no" },
  body: { transId: stuck.transId, status: "SUCCESSFUL", externalId: stuck.paymentId },
});
check("a webhook with the wrong secret is refused", wrongSecret.status === 401, JSON.stringify(wrongSecret.body));

// The right secret, and a lie: SUCCESSFUL, for money the provider never took.
const lie = await call("POST", "/payments/webhook", {
  headers: { "x-wh-secret": WEBHOOK_SECRET },
  body: { transId: stuck.transId, status: "SUCCESSFUL", externalId: stuck.paymentId, amount: 99999 },
});
check("a webhook with the secret is still only a prompt", lie.body.matched === true && lie.body.status === "PENDING", JSON.stringify(lie.body));
const lieLedger = sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${stuck.trip.id}'`);
check("a secret-holder claiming success the provider never confirmed credits nobody", lieLedger === "0", lieLedger);

// Nine digits, and ending in 5 so the fake provider neither fails (00) nor stalls (11) it.
const target = await completedMomoTrip(`+2376766${String(nonce).slice(0, -1)}5`, "Beatrice");
// Past the provider's 150 ms, well short of the reconciler's one second.
await new Promise((r) => setTimeout(r, 350));

const good = await call("POST", "/payments/webhook", {
  headers: { "x-wh-secret": WEBHOOK_SECRET },
  body: { transId: target.transId, status: "SUCCESSFUL", externalId: target.paymentId, financialTransId: "FORGED-REF" },
});
check("the real webhook settles it, on the provider's word", good.body.matched === true && good.body.status === "SUCCESSFUL", JSON.stringify(good.body));

const credited = sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${target.trip.id}'`);
check("it credits the fare", credited === "1", credited);

const replay = await call("POST", "/payments/webhook", {
  headers: { "x-wh-secret": WEBHOOK_SECRET },
  body: { transId: target.transId, status: "SUCCESSFUL", externalId: target.paymentId },
});
check("a replay is accepted without complaint", replay.body.matched === true);
const afterReplay = sql(`SELECT count(*) FROM "LedgerEntry" WHERE "tripId"='${target.trip.id}'`);
check("but pays exactly once", afterReplay === "1", afterReplay);

const operatorRef = sql(`SELECT "financialTransId" FROM "Payment" WHERE id='${target.paymentId}'`);
check("the operator's reference is the provider's, not the webhook's", operatorRef === `fin_${target.transId}`, operatorRef);

console.log("\n=== cashing out ===");
const balance = await call("GET", "/drivers/me/balance", { token: driverToken });
const owed = balance.body.payableXaf;
check("we are holding both settled mobile fares", owed === momoTrip.priceXaf + target.trip.priceXaf, `${owed}`);

const greedy = await call("POST", "/drivers/me/cashout", { token: driverToken, body: { amountXaf: owed + 5000 } });
check("he cannot take out more than we hold", greedy.status === 400 && greedy.body.error.code === "payout_refused", JSON.stringify(greedy.body));

const cashout = await call("POST", "/drivers/me/cashout", { token: driverToken });
check("cashing out is accepted for the whole balance", cashout.status === 201 && cashout.body.amountXaf === owed, JSON.stringify(cashout.body));

const doubleSpend = await call("POST", "/drivers/me/cashout", { token: driverToken });
check("a second request while one is in flight is refused", doubleSpend.status === 409, JSON.stringify(doubleSpend.body));

const paidOut = await settled(cashout.body.id, driverToken);
check("the payout settles", paidOut?.status === "SUCCESSFUL", JSON.stringify(paidOut));

const afterPayout = await call("GET", "/drivers/me/balance", { token: driverToken });
check("and we now owe him nothing", afterPayout.body.payableXaf === 0, JSON.stringify(afterPayout.body));
check("while still showing what was sent", afterPayout.body.paidOutXaf === owed, JSON.stringify(afterPayout.body.paidOutXaf));

const week = await call("GET", "/drivers/me/week", { token: driverToken });
check("a payout is not a fee and must not eat his earnings", week.body.feesXaf === 500, JSON.stringify({ fees: week.body.feesXaf, earned: week.body.earnedXaf }));

console.log("\n=== the daily access fee ===");
const feeRow = sql(`SELECT id || '|' || paid FROM "AccessFeeCharge" WHERE "driverId"='${applicant.id}'`);
const [chargeId, paidFlag] = feeRow.split("|");
// Concatenated through `||`, so the boolean arrives as text, not as psql's t/f.
check("going online raised today's fee, unpaid", paidFlag === "false", feeRow);

const collect = await call("POST", `/admin/access-fees/${chargeId}/collect`, { token: adminToken });
check("ops can collect it on demand", collect.status === 200, JSON.stringify(collect.body));

const feePayment = await settled(collect.body.paymentId, driverToken);
check("the debit settles", feePayment?.status === "SUCCESSFUL", JSON.stringify(feePayment));

const nowPaid = sql(`SELECT paid FROM "AccessFeeCharge" WHERE id='${chargeId}'`);
check("and the day is marked paid", nowPaid === "t", nowPaid);

const retry = await call("POST", `/admin/access-fees/${chargeId}/collect`, { token: adminToken });
check("collecting a paid day is refused", retry.status === 409, JSON.stringify(retry.body));

const feeEntries = sql(
  `SELECT count(*) FROM "LedgerEntry" WHERE "driverId"='${applicant.id}' AND type='ACCESS_FEE'`,
);
check("one working day, one fee entry — never two", feeEntries === "1", feeEntries);

console.log("\n=== a fee the driver's MoMo refuses ===");
// A number ending 00 always fails with the fake provider, which is the whole
// point of it: the refusal path has to be reachable on purpose.
const BROKE_DRIVER = "+237679000900";
const BROKE_PLATE = `SW ${nonce} B`;
const brokeToken2 = await signIn(BROKE_DRIVER, "DRIVER", "Sammy Ekane");
await call("POST", "/drivers/apply", {
  token: brokeToken2,
  body: { name: "Sammy Ekane", plate: BROKE_PLATE, cniNumber: `6${nonce}0003` },
});
const brokeQueue = await call("GET", "/admin/drivers", { token: adminToken });
const brokeDriver = brokeQueue.body.drivers.find((d) => d.plate === BROKE_PLATE);
await call("POST", `/admin/drivers/${brokeDriver.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: `S10-${nonce}-B`, overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
});
await call("POST", "/drivers/online", { token: brokeToken2, body: CHECKPOINT });

// The sweep only touches days that are already over, so age his fee by a day.
sql(`UPDATE "AccessFeeCharge" SET "serviceDate" = "serviceDate" - INTERVAL '1 day' WHERE "driverId"='${brokeDriver.id}'`);
const brokeChargeId = sql(`SELECT id FROM "AccessFeeCharge" WHERE "driverId"='${brokeDriver.id}' LIMIT 1`);

const firstSweep = await call("POST", "/admin/access-fees/collect", { token: adminToken });
/*
 * `due`, not `attempted`.
 *
 * The harness runs the background access-fee job every second, so it can put
 * the prompt on his phone a moment before this manual sweep does — and the
 * manual one then correctly reports `inFlight` rather than `attempted`,
 * because a second USSD on the same charge is exactly what must not happen.
 * What this line is really asserting is that the sweep did not walk past a
 * fee owed from yesterday, and `due` says that without racing the job.
 * "one attempt was made", below, is what holds the prompt count to one.
 */
check("the sweep picks up a fee due from yesterday", firstSweep.body.due >= 1, JSON.stringify(firstSweep.body));

await sleep(1500);
const attemptsAfterFirst = Number(sql(`SELECT count(*) FROM "Payment" WHERE "accessFeeChargeId"='${brokeChargeId}'`));
check("one attempt was made", attemptsAfterFirst === 1, `${attemptsAfterFirst}`);

const failedStatus = sql(`SELECT status FROM "Payment" WHERE "accessFeeChargeId"='${brokeChargeId}'`);
check("and his MoMo refused it", failedStatus === "FAILED", failedStatus);

// The bug this guards: without a backoff the sweep built a fresh payment every
// thirty seconds, putting a USSD prompt on the handset of a driver who has no
// money, all day, for 500 francs.
const secondSweep = await call("POST", "/admin/access-fees/collect", { token: adminToken });
check("a second sweep does not ask him again", secondSweep.body.attempted === 0, JSON.stringify(secondSweep.body));

// The bug this guards: `alreadyPaid` used to be `due - attempted`, so a fee we
// had merely deferred was reported as one that had been paid. That is the
// number ops reads to know who is behind, and it was quietly wrong.
check(
  "and reports him as deferred, not as settled",
  secondSweep.body.deferred >= 1 && secondSweep.body.alreadyPaid === 0,
  JSON.stringify(secondSweep.body),
);
check(
  "the counts account for every charge the sweep looked at",
  secondSweep.body.attempted +
    secondSweep.body.inFlight +
    secondSweep.body.deferred +
    secondSweep.body.exhausted +
    secondSweep.body.alreadyPaid +
    secondSweep.body.belowFloor +
    secondSweep.body.missing ===
    secondSweep.body.due,
  JSON.stringify(secondSweep.body),
);

await sleep(1500);
const attemptsAfterSecond = Number(sql(`SELECT count(*) FROM "Payment" WHERE "accessFeeChargeId"='${brokeChargeId}'`));
check("still exactly one prompt on his phone", attemptsAfterSecond === 1, `${attemptsAfterSecond}`);

const stillUnpaid = sql(`SELECT paid FROM "AccessFeeCharge" WHERE id='${brokeChargeId}'`);
check("the day is still owed — backing off is not forgiving it", stillUnpaid === "f", stillUnpaid);

const recordedFailure = sql(`SELECT "failureCode" IS NOT NULL FROM "AccessFeeCharge" WHERE id='${brokeChargeId}'`);
check("and the reason is on the charge for ops to read", recordedFailure === "t", recordedFailure);

// Ops overriding is the escape hatch — a person decided, usually with the
// driver on the phone saying he has topped up.
const forced = await call("POST", `/admin/access-fees/${brokeChargeId}/collect`, { token: adminToken });
check("ops can still force a retry past the backoff", forced.status === 200, JSON.stringify(forced.body));

await sleep(1500);
const attemptsAfterForce = Number(sql(`SELECT count(*) FROM "Payment" WHERE "accessFeeChargeId"='${brokeChargeId}'`));
check("which does make a second attempt", attemptsAfterForce === 2, `${attemptsAfterForce}`);

console.log("\n=== what ops can see ===");
const board = await call("GET", "/admin/payments", { token: adminToken });
check("the money board names the provider in use", board.body.provider === "fake", JSON.stringify(board.body.provider));
check("and counts what failed", board.body.failed >= 1, JSON.stringify(board.body.failed));
const failedRow = board.body.payments?.find((p) => p.status === "FAILED");
check("a failure shows the plate and the reason", Boolean(failedRow?.plate) && Boolean(failedRow?.failureReason), JSON.stringify(failedRow));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

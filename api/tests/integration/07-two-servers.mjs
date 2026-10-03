/**
 * Two API servers, one Fako Ride.
 *
 * Until now every instance knew only its own sockets: an offer dispatched by
 * one never reached a driver connected to the other, and "sign out everywhere"
 * closed only the connections that happened to be local. Render runs one
 * instance today; this is so the day it runs two is not the day rides stop
 * arriving.
 *
 * The runner's server is A. This suite starts a second, B, on the same
 * database and Redis, and checks that what one does reaches phones connected
 * to the other — both ways — and then stops it.
 */
import { readFileSync, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { io as socketClient } from "socket.io-client";

const A = "http://localhost:4000";
const B = "http://localhost:4001";
const LOG = process.argv[2];
const TSX = join(import.meta.dirname, "../../node_modules/tsx/dist/cli.mjs");
/** Eight kilometres from every other suite's drivers. */
const MUTENGENE = { lat: 4.0925, lng: 9.3153 };

const nonce = `${String(Date.now()).slice(-4)}7`;
const DRIVER_PHONE = `+2376888${nonce}`;
const DRIVER_PLATE = `SW ${nonce} T`;
const RIDER_PHONE = `+2376899${nonce}`;

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

async function call(base, method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
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

const codesLogged = (phone) =>
  [...readFileSync(LOG, "utf8").matchAll(/"to":"(\+237\d+)","message":"(\d{6})/g)].filter((m) => m[1] === phone);

/** Signs in through A, whose log the runner hands us. */
async function signIn(phone, name, role = "RIDER") {
  const seen = codesLogged(phone).length;
  await call(A, "POST", "/auth/otp/request", { body: { phone } });
  const until = Date.now() + 5000;
  while (codesLogged(phone).length <= seen && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  const code = codesLogged(phone).at(-1)?.[2];
  const v = await call(A, "POST", "/auth/otp/verify", { body: { phone, code, role, name } });
  if (v.status !== 200) throw new Error(JSON.stringify(v.body));
  return v.body.token;
}

/** Resolves with the first event of this name, or null after `ms`. */
const nextEvent = (sock, name, ms = 4000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    sock.once(name, (payload) => {
      clearTimeout(t);
      resolve(payload ?? true);
    });
  });
const connect = (base, token) =>
  new Promise((resolve) => {
    const sock = socketClient(base, { auth: { token }, transports: ["websocket"], reconnection: false });
    sock.on("connect", () => resolve(sock));
    sock.on("connect_error", () => resolve(null));
  });

// --- start B ------------------------------------------------------------------

// A server left over from an earlier run would answer instead, on yesterday's
// database. Refuse rather than test against it.
if (await fetch(`${B}/health`).then(() => true, () => false)) {
  console.log("  FAIL  something is already answering on 4001 — stop it and run again");
  process.exit(1);
}

console.log("Starting a second API server on 4001.");
const logB = createWriteStream(`${LOG}.b`);
const serverB = spawn(process.execPath, [TSX, "src/server.ts"], {
  cwd: join(import.meta.dirname, "../.."),
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: "4001",
    NODE_ENV: "development",
    SMS_PROVIDER: "console",
    MOMO_PROVIDER: "fake",
    DOCUMENT_STORE: "postgres",
    TRUST_PROXY: "1",
    PAYMENT_RECONCILE_AFTER_SECONDS: "1",
    PAYMENT_JOB_INTERVAL_SECONDS: "1",
    EXPO_PUSH_URL: `${process.env.PUSH_STANDIN}/--/api/v2/push/send`,
  },
});
serverB.stdout.pipe(logB);
serverB.stderr.pipe(logB);
const stopB = () => serverB.kill();
process.on("exit", stopB);

const upUntil = Date.now() + 90_000;
let up = false;
while (!up && Date.now() < upUntil) {
  up = await fetch(`${B}/health`).then((r) => r.ok, () => false);
  if (!up) await new Promise((r) => setTimeout(r, 500));
}
check("a second server starts on the same database and Redis", up);
if (!up) {
  console.log(`\n${pass} passed, ${fail + 1} failed\n`);
  process.exit(1);
}

// --- set up through A ---------------------------------------------------------

const adminToken = await signIn("+237600000099", "Ops Desk");
const driverToken = await signIn(DRIVER_PHONE, "Ekema Two", "DRIVER");
await call(A, "POST", "/drivers/apply", {
  token: driverToken,
  body: { name: "Ekema Two", plate: DRIVER_PLATE, cniNumber: `5${nonce}0007` },
});
const queue = await call(A, "GET", "/admin/drivers", { token: adminToken });
const applicant = queue.body.drivers.find((d) => d.plate === DRIVER_PLATE);
await call(A, "POST", `/admin/drivers/${applicant.id}/verify`, {
  token: adminToken,
  body: { licenceNumber: `S10-${nonce}-T`, overrideMissingDocuments: true, note: "Test fixture — no documents uploaded." },
});
await call(A, "POST", "/drivers/online", { token: driverToken, body: MUTENGENE });
const riderToken = await signIn(RIDER_PHONE, "Two Servers");

console.log("\n=== an offer made on one server reaches a driver on the other ===");
const driverOnB = await connect(B, driverToken);
check("the driver's phone is connected to B", Boolean(driverOnB));
const offered = nextEvent(driverOnB, "trip:offer");
const trip = await call(A, "POST", "/trips", {
  token: riderToken,
  body: { pickupLat: MUTENGENE.lat, pickupLng: MUTENGENE.lng, toZone: "MOLYKO", paymentMethod: "CASH" },
});
check("the rider books through A", trip.body.status === "OFFERED", JSON.stringify(trip.body.status));
const offer = await offered;
check("and the driver, connected to B, is offered it live", offer?.tripId === trip.body.id, JSON.stringify(offer));

console.log("\n=== and the other way round ===");
const riderOnA = await connect(A, riderToken);
const accepted = nextEvent(riderOnA, "trip:accepted");
const acceptedViaB = await call(B, "POST", `/trips/${trip.body.id}/accept`, { token: driverToken });
check("the driver accepts through B", acceptedViaB.status === 200, JSON.stringify(acceptedViaB.body));
const heard = await accepted;
check("and the rider, connected to A, hears it", heard?.tripId === trip.body.id, JSON.stringify(heard));

console.log("\n=== signing out everywhere reaches every server ===");
const riderOnB = await connect(B, riderToken);
const closed = new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), 4000);
  riderOnB.on("disconnect", (reason) => {
    clearTimeout(t);
    resolve(reason);
  });
});
const out = await call(A, "POST", "/auth/sign-out-everywhere", { token: riderToken });
check("she signs out everywhere through A", out.status === 200, JSON.stringify(out.status));
check("and her connection to B is closed too", (await closed) === "io server disconnect");

// --- tidy up ------------------------------------------------------------------
await call(A, "POST", `/trips/${trip.body.id}/cancel`, { token: out.body.token, body: { reason: "test over" } });
await call(A, "POST", "/drivers/offline", { token: driverToken });
for (const s of [driverOnB, riderOnA, riderOnB]) s?.close();
stopB();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

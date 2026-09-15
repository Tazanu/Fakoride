/**
 * The integration suite.
 *
 *   npm run test:integration
 *
 * Unlike `npm test` — which is pure arithmetic and needs nothing — this walks
 * real HTTP against a real Postgres and a real Redis, because the things most
 * worth breaking here are the ones that only exist between processes: a driver
 * suspended in Postgres but still sitting in the Redis geo set, a trip re-offered
 * to the driver who just walked away, a share link that leaks a PIN.
 *
 * It RESETS THE DATABASE first. That is the point — every suite below asserts on
 * exact counts, and a suite that passes only on a fresh database but is run
 * against a dirty one tells you nothing. Never point this at anything but the
 * local docker-compose stack.
 *
 *   docker compose up -d      # from the repo root, first
 */

import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const API = "http://localhost:4000";
const HEALTH_TIMEOUT_MS = 30_000;

/** The ops account these suites sign in as. Created before the server starts. */
const ADMIN_PHONE = "+237600000099";

const SUITES = ["01-one-trip.mjs", "02-driver-cancels.mjs", "03-ops-console.mjs"];

/**
 * Call the tools by their JS entrypoints rather than through npm or npx.
 *
 * Node refuses to run a .cmd shim from child_process without a shell (its fix
 * for CVE-2024-27980), so `execFileSync("npx.cmd", …)` fails on Windows — and
 * turning the shell on instead would mean quoting every argument by hand. Going
 * straight to the entrypoint sidesteps both and behaves the same everywhere.
 */
const PRISMA = join(import.meta.dirname, "../../node_modules/prisma/build/index.js");
const TSX = join(import.meta.dirname, "../../node_modules/tsx/dist/cli.mjs");

function run(args, label) {
  process.stdout.write(`${label}... `);
  try {
    execFileSync(process.execPath, args, { stdio: "pipe", encoding: "utf8" });
    console.log("done");
  } catch (err) {
    console.log("FAILED");
    console.error(`  ${err.message}`);
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

/**
 * Redis has to go too, not just Postgres.
 *
 * Driver positions outlive a database reset, and a geo set full of driver ids
 * that no longer exist is not a state any real deployment reaches — leaving it
 * behind means the suite spends its time failing on a fiction.
 */
async function flushRedis() {
  process.stdout.write("  flush redis... ");
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
  try {
    await redis.flushdb();
    console.log("done");
  } catch (err) {
    console.log("FAILED");
    console.error(`  ${err.message}`);
    process.exit(1);
  } finally {
    redis.disconnect();
  }
}

function guardDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? "";
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  if (!local) {
    console.error("DATABASE_URL does not point at localhost. This suite wipes the database — refusing.");
    console.error(`  ${url.replace(/:[^:@/]*@/, ":****@")}`);
    process.exit(2);
  }
}

async function waitForHealth(deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${API}/health`);
      if (res.ok) return true;
    } catch {
      // Not up yet. Normal for the first second or two.
    }
    await sleep(400);
  }
  return false;
}

// --- go ---------------------------------------------------------------------

import "dotenv/config";
guardDatabaseUrl();

console.log("Resetting the development database.\n");
run([PRISMA, "migrate", "reset", "--force", "--skip-generate"], "  migrate reset");
await flushRedis();
run([TSX, "prisma/seed.ts"], "  seed");
run([TSX, "scripts/grant-admin.ts", ADMIN_PHONE, "Ops Desk"], "  grant ops admin");

const logDir = mkdtempSync(join(tmpdir(), "fako-integration-"));
const logPath = join(logDir, "server.log");
const logFile = createWriteStream(logPath);

console.log("\nStarting the API.");
const server = spawn(process.execPath, [TSX, "src/server.ts"], {
  stdio: ["ignore", "pipe", "pipe"],
  // The suites read OTP codes back out of the log, the way a person would read
  // them off a phone. The console SMS sender exists precisely for this.
  env: { ...process.env, SMS_PROVIDER: "console", NODE_ENV: "development" },
});
server.stdout.pipe(logFile);
server.stderr.pipe(logFile);

let serverExited = false;
server.on("exit", (code) => {
  serverExited = true;
  if (code !== 0 && code !== null) {
    console.error(`\nThe API exited with code ${code}:\n`);
    console.error(readFileSync(logPath, "utf8").split("\n").slice(-25).join("\n"));
  }
});

const stop = () => {
  if (!serverExited) server.kill();
};
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

if (!(await waitForHealth(HEALTH_TIMEOUT_MS))) {
  console.error(`The API did not answer /health within ${HEALTH_TIMEOUT_MS / 1000}s.`);
  console.error(readFileSync(logPath, "utf8").split("\n").slice(-25).join("\n"));
  stop();
  process.exit(1);
}
console.log(`  up at ${API}\n`);

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n${"=".repeat(60)}\n${suite}\n${"=".repeat(60)}`);
  const result = spawn(process.execPath, [join(import.meta.dirname, suite), logPath], { stdio: "inherit" });
  const code = await new Promise((resolve) => result.on("exit", resolve));
  if (code !== 0) failed += 1;
}

stop();

if (failed > 0) {
  console.error(`\n${failed} of ${SUITES.length} suites failed.\n`);
  process.exit(1);
}
console.log(`\nAll ${SUITES.length} suites passed.\n`);

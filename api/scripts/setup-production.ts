/**
 * Prepare the production database, once, from this laptop.
 *
 *   npm run setup:production -- +2376XXXXXXXX "Your Name"
 *
 * Reads DATABASE_URL from api/.env.production — a file git ignores, so the
 * address never ends up in a commit or pasted into a chat. Then, in order:
 *
 *   1. applies the migrations     safe every time; it only adds what is missing
 *   2. loads Fako's places and    ONLY into an empty database. Re-running the
 *      fares                      seed rewrites the observed corridor fares,
 *                                 and by then ops may have corrected them.
 *                                 --reseed forces it, deliberately.
 *   3. makes your number admin    so you can sign in to the ops console
 *
 * Safe to run twice: the second time it changes nothing but the admin grant.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

// CommonJS, like the rest of the API, so __dirname rather than import.meta.
const ROOT = join(__dirname, "..");
const ENV_FILE = join(ROOT, ".env.production");
const PRISMA = join(ROOT, "node_modules/prisma/build/index.js");
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function step(label: string, args: string[], env: NodeJS.ProcessEnv): string {
  process.stdout.write(`${label}... `);
  try {
    const out = execFileSync(process.execPath, args, { env, cwd: ROOT, stdio: "pipe", encoding: "utf8" });
    console.log("done");
    return out;
  } catch (err) {
    console.log("FAILED");
    const e = err as { stdout?: string; stderr?: string; message: string };
    fail(`${e.stderr || e.stdout || e.message}`.trim());
  }
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [phone, name] = args.filter((a) => !a.startsWith("--"));

if (!phone) fail('Give your phone number, and your name if you like:\n  npm run setup:production -- +2376XXXXXXXX "Your Name"');
if (!existsSync(ENV_FILE)) {
  fail(
    `There is no ${ENV_FILE}.\n` +
      'Create it with one line — the Neon connection string WITHOUT "-pooler" in it:\n' +
      '  DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"',
  );
}

// Parsed, not loaded: nothing else from this file leaks into the environment.
const loaded = parse(readFileSync(ENV_FILE));
const url = loaded.DATABASE_URL;
if (!url) fail(`${ENV_FILE} has no DATABASE_URL.`);

const host = new URL(url).hostname;
if (host.includes("-pooler")) {
  fail("That is Neon's pooled address. Use the direct one (no \"-pooler\" in the host): migrations need it.");
}
if ((host === "localhost" || host === "127.0.0.1") && !flags.has("--allow-local")) {
  fail("DATABASE_URL points at this laptop, not Neon. (--allow-local is for testing this script.)");
}

// Only this one variable is changed; everything else the scripts read stays as it is.
const env = { ...process.env, DATABASE_URL: url };
console.log(`Production database: ${host}\n`);

step("  apply migrations", [PRISMA, "migrate", "deploy"], env);

const zones = execFileSync(
  process.execPath,
  [TSX, "-e", 'import("@prisma/client").then(async ({ PrismaClient }) => { const p = new PrismaClient(); console.log(await p.zone.count()); await p.$disconnect(); })'],
  { env, encoding: "utf8", cwd: ROOT },
).trim();

if (zones === "0" || flags.has("--reseed")) {
  step(flags.has("--reseed") && zones !== "0" ? "  reseed places and fares (--reseed)" : "  load places and fares", [TSX, "prisma/seed.ts"], env);
} else {
  console.log(`  places and fares... already there (${zones} zones) — left alone, so corrected fares survive`);
}

step(`  make ${phone} an admin`, [TSX, "scripts/grant-admin.ts", phone, ...(name ? [name] : [])], env);

console.log("\nDone. Sign in to the ops console with that number once SMS is working.\n");

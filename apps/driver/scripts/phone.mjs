#!/usr/bin/env node
/**
 * Runs the driver app on a phone over the USB cable.
 *
 * This exists because the Wi-Fi route does not work here. The MTN HomeBox has
 * AP isolation on, so the handset cannot open a socket to the laptop at all —
 * Expo Go sits on "Downloading" until it gives up, and nothing in the output
 * says why. The cable sidesteps the router entirely, and as a bonus the phone
 * charges instead of draining and the bundle never costs a franc of data.
 *
 *   npm run phone
 *
 * Two things have to be true for that to work, and both are easy to get wrong:
 *
 *   1. `adb reverse` points the phone's own localhost back down the cable, so
 *      8081 (Metro) and 4000 (the API) resolve to this laptop. It is dropped on
 *      every unplug, which is why this re-arms it on each run.
 *   2. Metro has to be listening on IPv4. `expo start --localhost` binds ::1
 *      only, and `adb reverse` forwards to 127.0.0.1 — the two never meet, the
 *      phone connects to a dead port, and again nothing says why. So we do not
 *      pass --localhost; the default bind covers both, and
 *      REACT_NATIVE_PACKAGER_HOSTNAME is what makes the app ask for 127.0.0.1.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Metro, and the API that src/api/client.ts derives from Metro's host. */
const PORTS = [8081, 4000];

/**
 * Find adb.
 *
 * It is usually not on PATH on Windows even when Android Studio installed it,
 * so fall back to the standard SDK locations before giving up.
 */
function findAdb() {
  if (spawnSync("adb", ["version"]).status === 0) return "adb";

  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    process.env.HOME && join(process.env.HOME, "Library", "Android", "sdk"),
    process.env.HOME && join(process.env.HOME, "Android", "Sdk"),
  ].filter(Boolean);

  for (const root of roots) {
    for (const name of ["adb.exe", "adb"]) {
      const candidate = join(root, "platform-tools", name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** The attached device, or an explanation of why there isn't one. */
function device(adb) {
  const out = spawnSync(adb, ["devices"], { encoding: "utf8" }).stdout ?? "";
  const rows = out
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/));

  const ready = rows.find((r) => r[1] === "device");
  if (ready) return { serial: ready[0] };

  // These two are worth naming, because the fix is on the handset and no
  // amount of restarting the bundler will help.
  if (rows.some((r) => r[1] === "unauthorized")) {
    return { error: 'Phone says "unauthorized" — tap "Allow USB debugging" on its screen, ticking "Always allow from this computer".' };
  }
  if (rows.some((r) => r[1] === "offline")) {
    return { error: "Phone is offline to adb — unplug and replug the cable, then set the USB mode to File transfer (MTP)." };
  }
  return { error: "No phone attached. Plug it in, and enable USB debugging under Developer options." };
}

const adb = findAdb();
if (!adb) {
  console.error("Could not find adb. Install Android platform-tools, or set ANDROID_HOME.");
  process.exit(1);
}

const found = device(adb);
if (found.error) {
  console.error(found.error);
  process.exit(1);
}

for (const port of PORTS) {
  const result = spawnSync(adb, ["reverse", `tcp:${port}`, `tcp:${port}`]);
  if (result.status !== 0) {
    console.error(`Could not forward port ${port} to the phone.`);
    process.exit(1);
  }
}

console.log(`Phone ${found.serial} is listening on ${PORTS.join(" and ")} down the cable.`);
console.log("Press a in the Expo terminal to open the app.\n");

// Everything after `npm run phone --` reaches expo, so `-- --clear` works.
const passthrough = process.argv.slice(2);

/**
 * Run Expo's CLI entry on this Node directly, rather than shelling out to npx.
 *
 * `spawn(cmd, args, { shell: true })` concatenates instead of escaping, which
 * Node now warns about (DEP0190) and which would mangle any passthrough
 * argument containing a space. expo/bin/cli is plain JS, so there is nothing
 * a shell was needed for.
 */
const cli = join(here, "..", "node_modules", "expo", "bin", "cli");
const expo = spawn(process.execPath, [cli, "start", ...passthrough], {
  stdio: "inherit",
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: "127.0.0.1" },
});

expo.on("exit", (code) => process.exit(code ?? 0));

/**
 * Make somebody an admin.
 *
 *   npm run admin:grant -- +237670000000 "Stanley Tazanu"
 *   npm run admin:grant -- 670000000 --revoke
 *
 * This is a script and not an endpoint on purpose. An API that can promote its
 * own users is one stolen phone away from a stranger approving drivers and
 * rewriting the fare table. Running this needs shell access to a machine that
 * already holds DATABASE_URL, which is a much higher bar than a bearer token.
 *
 * The person still signs in normally afterwards — phone plus an SMS code, same
 * as everybody else. This only changes what their account is allowed to do.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalisePhone } from "../src/lib/phone";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const positional = args.filter((a) => !a.startsWith("--"));
  const [rawPhone, name] = positional;

  if (!rawPhone) {
    console.error("Usage: npm run admin:grant -- <phone> [name] [--revoke]");
    process.exit(2);
  }

  let phone: string;
  try {
    phone = normalisePhone(rawPhone);
  } catch {
    console.error(`"${rawPhone}" is not a Cameroon number. Try 670000000 or +237670000000.`);
    process.exit(2);
  }

  const existing = await prisma.user.findUnique({
    where: { phone },
    include: { driver: { select: { id: true } } },
  });

  if (revoke) {
    if (!existing) {
      console.error(`No account for ${phone}.`);
      process.exit(1);
    }
    // Back to RIDER, unless they also drive — demoting a working driver out of
    // his own app because somebody revoked an admin flag would be a bad day.
    const role = existing.driver ? "DRIVER" : "RIDER";
    await prisma.user.update({ where: { phone }, data: { role } });
    console.log(`${phone} is no longer an admin (now ${role}).`);
    return;
  }

  if (existing?.driver) {
    // One account cannot both approve drivers and be one of them.
    console.error(`${phone} is a registered driver. Use a separate number for ops.`);
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, name: name ?? null, role: "ADMIN" },
    update: { role: "ADMIN", ...(name ? { name } : {}) },
  });

  console.log(`${user.phone} (${user.name ?? "no name"}) is an admin.`);
  console.log("They sign in the normal way — phone number, code by SMS.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

/**
 * Delete somebody's account for them.
 *
 *   npm run account:delete -- +237670000000
 *
 * For the person who wrote to privacy@fakoride.cm because they no longer have
 * the app. Call the number first and make sure the request is theirs — whoever
 * runs this is the only check there is. It does exactly what the button in the
 * app does (src/modules/account.ts), and refuses for the same reasons: a ride
 * under way, a payment in flight, or money we are still holding for a driver.
 *
 * A script and not a button on the console, for the reason `admin:grant` is
 * one: an API that can erase its own users is one stolen ops phone away from
 * somebody erasing them.
 */

import "dotenv/config";
import { ApiError } from "../src/lib/http";
import { normalisePhone } from "../src/lib/phone";
import { disconnectPrisma, prisma } from "../src/lib/prisma";
import { disconnectRedis } from "../src/lib/redis";
import { deleteAccount } from "../src/modules/account";

async function main(): Promise<void> {
  const [rawPhone] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!rawPhone) {
    console.error("Usage: npm run account:delete -- <phone>");
    process.exitCode = 2;
    return;
  }

  let phone: string;
  try {
    phone = normalisePhone(rawPhone);
  } catch {
    console.error(`"${rawPhone}" is not a Cameroon number. Try 670000000 or +237670000000.`);
    process.exitCode = 2;
    return;
  }

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, role: true, name: true } });
  if (!user) {
    console.error(`No account for ${phone}.`);
    process.exitCode = 1;
    return;
  }
  if (user.role === "ADMIN") {
    console.error(`${phone} is an ops account. Revoke it first: npm run admin:grant -- ${phone} --revoke`);
    process.exitCode = 1;
    return;
  }

  try {
    await deleteAccount(user.id);
    console.log(`Deleted the account for ${phone} (${user.name ?? "no name"}).`);
    console.log("Rides, payments and complaints are kept, no longer attached to a name. See src/modules/account.ts.");
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`Not deleted: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis().catch(() => undefined);
    await disconnectPrisma();
  });

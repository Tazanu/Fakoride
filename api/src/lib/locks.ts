/**
 * One caller at a time for one key, while `decide` runs.
 *
 * "Is there already one? If not, make one" is two steps, and requests that
 * arrive together all pass the first before any reaches the second. That is
 * how five cash-outs sent at once became four payouts of the same balance, how
 * the background fee job and a manual sweep both put a USSD prompt on one
 * driver's phone for one day's fee, and how a double-tap on "Find me a taxi"
 * would book two rides and send two drivers to one person.
 *
 * A Postgres advisory lock held for the length of a transaction makes the pair
 * atomic: the second caller waits, then sees what the first one wrote. It holds
 * across API instances, because the lock lives in the database. Keep `decide`
 * to reads and writes — anything slow, like a call to a payment provider, goes
 * after it, so nobody else is kept waiting.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function oneAtATime<T>(key: string, decide: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // FROM, not a bare SELECT: the function returns void, which Prisma cannot read.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
    return decide(tx);
  });
}

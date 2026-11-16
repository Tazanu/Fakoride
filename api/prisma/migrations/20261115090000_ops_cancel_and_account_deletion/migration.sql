-- A ride ended from outside it: by an operator, or by the watchdog.
-- Only added here, never used in this migration: Postgres refuses to use a new
-- enum value in the transaction that created it.
ALTER TYPE "TripStatus" ADD VALUE 'CANCELLED_BY_OPS';

-- When the owner deleted the account. See the comment on User in schema.prisma.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

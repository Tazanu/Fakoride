-- A ride ended from outside it: by an operator, or by the watchdog.
-- Only added here, never used in this migration: Postgres refuses to use a new
-- enum value in the transaction that created it.
ALTER TYPE "TripStatus" ADD VALUE 'CANCELLED_BY_OPS';

-- User."deletedAt" is added by 20261011090000_account_deletion, which was
-- written on the other branch first.

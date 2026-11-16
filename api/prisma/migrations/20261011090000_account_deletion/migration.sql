-- Deleting an account: the row is emptied, not removed, and says when.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- A ride is rated once, and remembers it.
-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "riderStars" INTEGER;

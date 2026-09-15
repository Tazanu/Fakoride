-- CreateEnum
CREATE TYPE "DriverReviewAction" AS ENUM ('VERIFIED', 'REJECTED', 'SUSPENDED', 'REINSTATED');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "licenceNumber" TEXT;

-- CreateTable
CREATE TABLE "DriverReview" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "action" "DriverReviewAction" NOT NULL,
    "by" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverReview_driverId_at_idx" ON "DriverReview"("driverId", "at");

-- AddForeignKey
ALTER TABLE "DriverReview" ADD CONSTRAINT "DriverReview_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

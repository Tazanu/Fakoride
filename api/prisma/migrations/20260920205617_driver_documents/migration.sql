/*
  Warnings:

  - You are about to drop the column `cniDocKey` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `licenceKey` on the `Driver` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('NATIONAL_ID', 'VEHICLE_REGISTRATION', 'DRIVER_PHOTO');

-- AlterTable
ALTER TABLE "Driver" DROP COLUMN "cniDocKey",
DROP COLUMN "licenceKey";

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverDocument_driverId_idx" ON "DriverDocument"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverDocument_driverId_kind_key" ON "DriverDocument"("driverId", "kind");

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('TRIP_FARE', 'ACCESS_FEE', 'DRIVER_PAYOUT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'PAYOUT';

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amountXaf" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "medium" TEXT,
    "tripId" TEXT,
    "driverId" TEXT,
    "accessFeeChargeId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'fapshi',
    "providerTransId" TEXT,
    "financialTransId" TEXT,
    "failureReason" TEXT,
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTransId_key" ON "Payment"("providerTransId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ledgerEntryId_key" ON "Payment"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_driverId_createdAt_idx" ON "Payment"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_purpose_status_idx" ON "Payment"("purpose", "status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accessFeeChargeId_fkey" FOREIGN KEY ("accessFeeChargeId") REFERENCES "AccessFeeCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

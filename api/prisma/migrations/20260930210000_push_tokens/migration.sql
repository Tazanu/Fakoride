-- The phone to wake when something happens and the app is not open.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pushToken" TEXT,
ADD COLUMN     "pushTokenAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_pushToken_key" ON "User"("pushToken");

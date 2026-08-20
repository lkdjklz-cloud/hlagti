-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN "guestId" TEXT;
CREATE INDEX "QueueEntry_barberId_guestId_idx" ON "QueueEntry"("barberId", "guestId");

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN "guestId" TEXT;
CREATE INDEX "Slot_barberId_guestId_idx" ON "Slot"("barberId", "guestId");
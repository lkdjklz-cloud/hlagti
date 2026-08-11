-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN "entryId" TEXT;

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_entryId_idx" ON "PushSubscription"("entryId");

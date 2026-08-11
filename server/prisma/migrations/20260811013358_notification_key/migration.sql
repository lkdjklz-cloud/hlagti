-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "key" TEXT;

-- CreateIndex
CREATE INDEX "Notification_key_idx" ON "Notification"("key");

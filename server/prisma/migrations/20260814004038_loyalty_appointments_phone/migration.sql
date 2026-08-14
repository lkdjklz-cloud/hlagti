-- AlterTable
ALTER TABLE "Barber" ADD COLUMN "loyaltyEvery" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QueueEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barberId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "doneAt" DATETIME,
    "canceledAt" DATETIME,
    CONSTRAINT "QueueEntry_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QueueEntry" ("barberId", "canceledAt", "customerName", "doneAt", "id", "joinedAt", "number", "startedAt", "status", "userId") SELECT "barberId", "canceledAt", "customerName", "doneAt", "id", "joinedAt", "number", "startedAt", "status", "userId" FROM "QueueEntry";
DROP TABLE "QueueEntry";
ALTER TABLE "new_QueueEntry" RENAME TO "QueueEntry";
CREATE INDEX "QueueEntry_barberId_status_idx" ON "QueueEntry"("barberId", "status");
CREATE INDEX "QueueEntry_barberId_number_idx" ON "QueueEntry"("barberId", "number");
CREATE TABLE "new_Slot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barberId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Slot_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Slot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Slot" ("barberId", "createdAt", "customerName", "endsAt", "id", "startsAt", "status", "userId") SELECT "barberId", "createdAt", "customerName", "endsAt", "id", "startsAt", "status", "userId" FROM "Slot";
DROP TABLE "Slot";
ALTER TABLE "new_Slot" RENAME TO "Slot";
CREATE INDEX "Slot_barberId_startsAt_idx" ON "Slot"("barberId", "startsAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

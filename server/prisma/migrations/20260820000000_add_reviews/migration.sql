-- AlterTable: Barber — add lat/lng/photo from db push, plus rating aggregate fields
ALTER TABLE "Barber" ADD COLUMN "lat" REAL;
ALTER TABLE "Barber" ADD COLUMN "lng" REAL;
ALTER TABLE "Barber" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Barber" ADD COLUMN "avgRating" REAL;
ALTER TABLE "Barber" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Slot — add doneAt (missing from prior migrations)
ALTER TABLE "Slot" ADD COLUMN "doneAt" DATETIME;

-- Fix QueueEntry unique constraint (prior migration only created a regular index)
DROP INDEX IF EXISTS "QueueEntry_barberId_number_idx";
CREATE UNIQUE INDEX "QueueEntry_barberId_number_idx" ON "QueueEntry"("barberId", "number");

-- CreateTable: Review
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barberId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_barberId_userId_key" ON "Review"("barberId", "userId");
CREATE INDEX "Review_barberId_idx" ON "Review"("barberId");

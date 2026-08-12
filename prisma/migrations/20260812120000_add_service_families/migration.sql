-- CreateTable
CREATE TABLE "ServiceFamily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceFamily_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServiceFamily_clinicId_idx" ON "ServiceFamily"("clinicId");

-- Backfill: default "General" family per clinic, so existing services can be reassigned.
INSERT INTO "ServiceFamily" ("id", "clinicId", "name", "active", "sortOrder", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(4)) || hex(randomblob(4)) || hex(randomblob(4)) || hex(randomblob(4))),
       "id", 'General', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Clinic";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "pricingType" TEXT NOT NULL DEFAULT 'FIXED',
    "pricePerMinuteCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Service_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ServiceFamily" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Service" ("id", "clinicId", "familyId", "name", "description", "durationMinutes", "priceCents", "pricingType", "pricePerMinuteCents", "active", "createdAt", "updatedAt")
SELECT s."id", s."clinicId",
       (SELECT f."id" FROM "ServiceFamily" f WHERE f."clinicId" = s."clinicId" ORDER BY f."createdAt" ASC LIMIT 1),
       s."name", s."description", s."durationMinutes", s."priceCents", s."pricingType", s."pricePerMinuteCents", s."active", s."createdAt", s."updatedAt"
FROM "Service" s;
DROP TABLE "Service";
ALTER TABLE "new_Service" RENAME TO "Service";
CREATE INDEX "Service_familyId_idx" ON "Service"("familyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

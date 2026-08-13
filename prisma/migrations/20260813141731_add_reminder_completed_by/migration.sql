-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomerReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "completedAt" DATETIME,
    "completedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerReminder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerReminder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerReminder_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CustomerReminder" ("alertDaysBefore", "clinicId", "completedAt", "createdAt", "createdByUserId", "customerId", "dueDate", "id", "title", "updatedAt") SELECT "alertDaysBefore", "clinicId", "completedAt", "createdAt", "createdByUserId", "customerId", "dueDate", "id", "title", "updatedAt" FROM "CustomerReminder";
DROP TABLE "CustomerReminder";
ALTER TABLE "new_CustomerReminder" RENAME TO "CustomerReminder";
CREATE INDEX "CustomerReminder_clinicId_completedAt_dueDate_idx" ON "CustomerReminder"("clinicId", "completedAt", "dueDate");
CREATE INDEX "CustomerReminder_customerId_idx" ON "CustomerReminder"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Clinic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "openingTime" TEXT NOT NULL DEFAULT '09:00',
    "closingTime" TEXT NOT NULL DEFAULT '20:00',
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappTemplateName" TEXT DEFAULT 'appointment_reminder_es',
    "whatsappTemplateLang" TEXT DEFAULT 'es',
    "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "inactivityWarningDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Clinic" ("address", "closingTime", "createdAt", "email", "id", "name", "openingTime", "phone", "reminderHoursBefore", "taxId", "timezone", "updatedAt", "whatsappEnabled", "whatsappTemplateLang", "whatsappTemplateName") SELECT "address", "closingTime", "createdAt", "email", "id", "name", "openingTime", "phone", "reminderHoursBefore", "taxId", "timezone", "updatedAt", "whatsappEnabled", "whatsappTemplateLang", "whatsappTemplateName" FROM "Clinic";
DROP TABLE "Clinic";
ALTER TABLE "new_Clinic" RENAME TO "Clinic";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

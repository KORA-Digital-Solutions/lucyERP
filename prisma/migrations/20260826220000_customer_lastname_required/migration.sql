-- El primer apellido pasa a ser obligatorio, como el nombre y el teléfono.
--
-- No se rellena ningún hueco a la fuerza: si quedara algún cliente sin primer
-- apellido, la migración falla con "NOT NULL constraint failed" y no se aplica
-- nada (SQLite la ejecuta dentro de una transacción). En ese caso hay que
-- rellenar esos apellidos a mano antes de volver a intentarlo — es preferible
-- a inventarse un valor vacío que luego nadie sabría de dónde salió.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "fileNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "lastName2" TEXT,
    "sex" TEXT,
    "birthDate" DATETIME,
    "profession" TEXT,
    "phone" TEXT NOT NULL,
    "phoneLabel" TEXT,
    "phone2" TEXT,
    "phone2Label" TEXT,
    "email" TEXT,
    "address" TEXT,
    "referralSource" TEXT,
    "allergies" TEXT,
    "notes" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("id", "clinicId", "fileNumber", "firstName", "lastName", "lastName2", "sex", "birthDate", "profession", "phone", "phoneLabel", "phone2", "phone2Label", "email", "address", "referralSource", "allergies", "notes", "whatsappOptIn", "active", "balanceCents", "createdAt", "updatedAt")
SELECT "id", "clinicId", "fileNumber", "firstName", "lastName", "lastName2", "sex", "birthDate", "profession", "phone", "phoneLabel", "phone2", "phone2Label", "email", "address", "referralSource", "allergies", "notes", "whatsappOptIn", "active", "balanceCents", "createdAt", "updatedAt"
FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_clinicId_fileNumber_key" ON "Customer"("clinicId", "fileNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

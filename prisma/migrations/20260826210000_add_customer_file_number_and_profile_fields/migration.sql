-- Nº de expediente + campos de ficha (sexo, profesión, dirección, alergias,
-- origen del cliente y etiquetas de teléfono).
--
-- `fileNumber` es obligatorio, así que se reconstruye la tabla y se rellena a
-- los clientes existentes por antigüedad (createdAt, desempatando por id):
-- el primer cliente dado de alta se queda con el expediente 1.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "fileNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
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
INSERT INTO "new_Customer" ("id", "clinicId", "fileNumber", "firstName", "lastName", "lastName2", "birthDate", "phone", "phone2", "email", "notes", "whatsappOptIn", "active", "balanceCents", "createdAt", "updatedAt")
SELECT
    c."id",
    c."clinicId",
    (SELECT COUNT(*) FROM "Customer" c2
      WHERE c2."clinicId" = c."clinicId"
        AND (c2."createdAt" < c."createdAt"
             OR (c2."createdAt" = c."createdAt" AND c2."id" <= c."id"))),
    c."firstName",
    c."lastName",
    c."lastName2",
    c."birthDate",
    c."phone",
    c."phone2",
    c."email",
    c."notes",
    c."whatsappOptIn",
    c."active",
    c."balanceCents",
    c."createdAt",
    c."updatedAt"
FROM "Customer" c;
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_clinicId_fileNumber_key" ON "Customer"("clinicId", "fileNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

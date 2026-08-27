-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SaleLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "serviceId" TEXT,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "totalCents" INTEGER NOT NULL,
    "workerId" TEXT,
    "notes" TEXT,
    CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SaleLine_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SaleLine" ("description", "discountPercent", "durationMinutes", "id", "productId", "quantity", "saleId", "serviceId", "totalCents", "type", "unitPriceCents") SELECT "description", "discountPercent", "durationMinutes", "id", "productId", "quantity", "saleId", "serviceId", "totalCents", "type", "unitPriceCents" FROM "SaleLine";
DROP TABLE "SaleLine";
ALTER TABLE "new_SaleLine" RENAME TO "SaleLine";
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

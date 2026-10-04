-- Corregir un cierre de caja el mismo día: cada corrección deja su fila, con lo
-- que había antes, lo que hay ahora y quién lo hizo.
-- CreateTable
CREATE TABLE "CashRegisterEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cashRegisterId" TEXT NOT NULL,
    "editedByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declaredBeforeCents" INTEGER NOT NULL,
    "declaredAfterCents" INTEGER NOT NULL,
    "keptBeforeCents" INTEGER NOT NULL,
    "keptAfterCents" INTEGER NOT NULL,
    "differenceBeforeCents" INTEGER NOT NULL,
    "differenceAfterCents" INTEGER NOT NULL,
    "notesBefore" TEXT,
    "notesAfter" TEXT,
    CONSTRAINT "CashRegisterEdit_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashRegisterEdit_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CashRegisterEdit_cashRegisterId_idx" ON "CashRegisterEdit"("cashRegisterId");

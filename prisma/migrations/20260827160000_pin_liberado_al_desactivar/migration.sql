-- AlterTable
ALTER TABLE "User" ADD COLUMN "restorePinOnReactivate" BOOLEAN NOT NULL DEFAULT false;

-- Quien ya estaba desactivada conservaba su PIN guardado, y esos dígitos
-- seguían reservados a alguien que no trabaja aquí. Se le retira ahora, con la
-- nota de que lo tenía para darle uno nuevo si vuelve.
UPDATE "User"
SET "restorePinOnReactivate" = true, "pinHash" = NULL, "mustChangePin" = false
WHERE "active" = false AND "pinHash" IS NOT NULL;

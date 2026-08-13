-- Las cabinas son un recurso compartido: cualquier empleada puede usar
-- cualquier cabina, no hay una trabajadora "por defecto" asignada.
ALTER TABLE "Cabin" DROP COLUMN "defaultWorkerId";

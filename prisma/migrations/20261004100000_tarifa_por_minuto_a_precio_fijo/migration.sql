-- La tarifa por minuto se retira: todo servicio pasa a precio fijo.
-- Solo datos, sin tocar la estructura de la tabla. El precio fijo que se
-- le da a un servicio por minuto es lo que costaba su duración habitual
-- (€/min × minutos), que es lo que ya se ofrecía al cobrar una cita.
UPDATE "Service"
SET "priceCents" = "pricePerMinuteCents" * "durationMinutes",
    "pricingType" = 'FIXED',
    "pricePerMinuteCents" = NULL
WHERE "pricingType" = 'PER_MINUTE'
  AND "pricePerMinuteCents" IS NOT NULL;

-- Un servicio por minuto sin tarifa cargada solo conserva el tipo.
UPDATE "Service"
SET "pricingType" = 'FIXED'
WHERE "pricingType" <> 'FIXED';

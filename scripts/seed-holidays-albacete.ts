import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PrismaClient } from "@prisma/client"

// Carga .env si DATABASE_URL no está ya definido (p. ej. al ejecutar con tsx).
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (!m) continue
      const val = (m[2] ?? "").trim().replace(/^["']|["']$/g, "")
      if (!(m[1] in process.env)) process.env[m[1]] = val
    }
  } catch {}
}

const prisma = new PrismaClient()

/**
 * Festivos oficiales de Albacete capital 2026, verificados cruzando dos
 * fuentes (calendarios-laborales.es y calendarioslaborales.com), 14 fechas.
 * scope es solo informativo, no afecta a la lógica de negocio.
 *
 * Para años futuros: los fijos de calendario civil (los marcados FIXED más
 * abajo) se repiten cada año en el mismo día/mes. Viernes/Jueves Santo,
 * Lunes de Pascua y Corpus Christi se mueven con la Semana Santa. Los 2
 * festivos locales (San Juan, Virgen de los Llanos) los fija cada año el
 * Ayuntamiento de Albacete, normalmente en el BOE/DOCM del otoño anterior —
 * hay que actualizar esta lista cuando se publique el calendario del año
 * siguiente, no asumir que se repiten sin más.
 */
const HOLIDAYS_ALBACETE_2026: { date: string; name: string; scope: "NATIONAL" | "REGIONAL" | "LOCAL" }[] = [
  { date: "2026-01-01", name: "Año Nuevo", scope: "NATIONAL" },
  { date: "2026-01-06", name: "Epifanía del Señor", scope: "NATIONAL" },
  { date: "2026-04-02", name: "Jueves Santo", scope: "REGIONAL" },
  { date: "2026-04-03", name: "Viernes Santo", scope: "NATIONAL" },
  { date: "2026-04-06", name: "Lunes de Pascua", scope: "REGIONAL" },
  { date: "2026-05-01", name: "Fiesta del Trabajo", scope: "NATIONAL" },
  { date: "2026-06-04", name: "Corpus Christi", scope: "REGIONAL" },
  { date: "2026-06-24", name: "San Juan", scope: "LOCAL" },
  { date: "2026-08-15", name: "Asunción de la Virgen", scope: "NATIONAL" },
  { date: "2026-09-08", name: "Virgen de los Llanos", scope: "LOCAL" },
  { date: "2026-10-12", name: "Fiesta Nacional de España", scope: "NATIONAL" },
  { date: "2026-11-02", name: "Todos los Santos (trasladado)", scope: "NATIONAL" },
  { date: "2026-12-08", name: "Inmaculada Concepción", scope: "NATIONAL" },
  { date: "2026-12-25", name: "Natividad del Señor", scope: "NATIONAL" },
]

async function main() {
  const clinic = await prisma.clinic.findFirst({ orderBy: { createdAt: "asc" } })
  if (!clinic) {
    throw new Error("No hay clínica configurada. Ejecuta `npm run db:seed` primero.")
  }

  let created = 0
  let skipped = 0
  for (const h of HOLIDAYS_ALBACETE_2026) {
    const existing = await prisma.holiday.findUnique({
      where: { clinicId_date: { clinicId: clinic.id, date: h.date } },
    })
    if (existing) {
      skipped++
      continue
    }
    await prisma.holiday.create({
      data: { clinicId: clinic.id, date: h.date, name: h.name, scope: h.scope },
    })
    created++
  }

  console.log(`✅ Festivos Albacete 2026: ${created} creado(s), ${skipped} ya existían.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PrismaClient } from "@prisma/client"
import { rellenarPrecioDeSesiones } from "../lib/voucher-backfill"

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
const fmtEur = (cents: number) => (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 }) + " €"

/**
 * Pone precio a las sesiones de bono que se gastaron antes de M2 y quedaron a
 * 0 EUR: precio que la sesión tiene dentro de su bono, con un 100 % de descuento.
 *
 *   npm run db:backfill-sesiones-bono            simulacro: cuenta y no escribe
 *   npm run db:backfill-sesiones-bono -- --apply escribe en la base de datos
 *
 * Antes de aplicarlo en la base real, probarlo en una COPIA (DATABASE_URL apunta
 * a la que se use) y revisar el simulacro. Se puede repetir sin problema: solo
 * toca lo que todavía no está relleno.
 */
async function main() {
  const aplicar = process.argv.includes("--apply")
  const r = await rellenarPrecioDeSesiones(prisma, { aplicar })

  console.log(aplicar ? "Aplicado." : "Simulacro: no se ha escrito nada. Añade --apply para aplicarlo.")
  console.log(`  Sesiones que se ${aplicar ? "han rellenado" : "rellenarían"}: ${r.rellenadas} (valen ${fmtEur(r.valorCents)} en total)`)
  console.log(`  Ya tenían precio de bono: ${r.yaValoradas}`)
  if (r.sinTarifa > 0) {
    console.log(`  Sin tarifa en su bono, se dejan como están: ${r.sinTarifa}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

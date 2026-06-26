import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PrismaClient } from "@prisma/client"

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

// Elimina cajas con saldo de apertura negativo (registros erróneos del bug ya corregido).
async function main() {
  const bad = await prisma.cashRegister.findMany({ where: { openingCashCents: { lt: 0 } } })
  for (const r of bad) {
    await prisma.cashRegister.delete({ where: { id: r.id } })
    console.log(`  Eliminada caja ${r.date} (apertura ${r.openingCashCents})`)
  }
  console.log(`\n✅ ${bad.length} caja(s) errónea(s) eliminada(s).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

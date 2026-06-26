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
 * Nuevo modelo: balanceCents = saldo a favor (crédito), siempre >= 0.
 * La deuda vive en Sale.status = DEBT, no en el balance.
 *
 * Recompone el saldo de cada cliente sumando solo los movimientos de crédito
 * (GIFT_CARD_IN, BALANCE_USED) e ignorando los de deuda (DEBT_CREATED, DEBT_PAID),
 * que dejaban el balance en negativo bajo el modelo antiguo.
 */
async function main() {
  const customers = await prisma.customer.findMany({ select: { id: true, firstName: true, lastName: true, balanceCents: true } })
  let changed = 0

  for (const c of customers) {
    const movements = await prisma.customerBalanceMovement.findMany({
      where: { customerId: c.id, type: { in: ["GIFT_CARD_IN", "BALANCE_USED"] } },
      select: { amountCents: true },
    })
    const credit = movements.reduce((s, m) => s + m.amountCents, 0)
    const next = Math.max(0, credit)

    if (next !== c.balanceCents) {
      await prisma.customer.update({ where: { id: c.id }, data: { balanceCents: next } })
      console.log(`  ${c.lastName ?? ""}, ${c.firstName}: ${c.balanceCents} -> ${next}`)
      changed++
    }
  }

  console.log(`\n✅ Saldos recompuestos. ${changed} cliente(s) actualizado(s) de ${customers.length}.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

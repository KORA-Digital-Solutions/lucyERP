/**
 * Datos de prueba SOLO para desarrollo local.
 *
 * Genera ventas y cajas cerradas de los últimos 15 días para poder ver con
 * datos reales el histórico de ventas (/sales) y el historial de caja
 * (/cash-register). NO toca prisma/seed.ts ni el día de hoy.
 *
 *   npx tsx scripts/seed-demo-sales.ts            → crea los datos
 *   npx tsx scripts/seed-demo-sales.ts --limpiar  → borra lo que creó
 *
 * Todo lo generado queda marcado con el prefijo "[demo]" (en Sale.notes y en
 * CashRegister.denominationNotes), que es lo que usa --limpiar para revertirlo.
 * Ninguno de esos dos campos se muestra en pantalla, así que el marcador es
 * invisible en la interfaz.
 */
import { PrismaClient } from "@prisma/client"

// El cliente lo inyecta quien llama: prisma/seed.ts reutiliza el suyo y la
// entrada por CLI crea uno propio.

const MARKER = "[demo]"
const DAYS = 15
const FLOAT_CENTS = 15000 // 150 € que se quedan en caja de un día para otro

/* ─── Aleatoriedad determinista (misma salida en cada ejecución) ──────────── */

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260813)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))

/* ─── Fechas ─────────────────────────────────────────────────────────────── */

// La caja se indexa por fecha UTC (ver openCashRegister), así que las ventas se
// colocan a mediodía para que la fecha local y la UTC coincidan siempre.
function dateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}
function atLocalTime(day: Date, hour: number, minute: number) {
  const d = new Date(day)
  d.setHours(hour, minute, 0, 0)
  return d
}

/* ─── Limpieza ───────────────────────────────────────────────────────────── */

async function limpiar(prisma: PrismaClient) {
  const sales = await prisma.sale.findMany({
    where: { notes: { startsWith: MARKER } },
    select: { id: true },
  })
  const saleIds = sales.map((s) => s.id)

  if (saleIds.length > 0) {
    // Devolver el saldo abonado por tarjetas regalo de prueba
    const movements = await prisma.customerBalanceMovement.findMany({
      where: { saleId: { in: saleIds } },
      select: { customerId: true, amountCents: true },
    })
    for (const m of movements) {
      await prisma.customer.update({
        where: { id: m.customerId },
        data: { balanceCents: { decrement: m.amountCents } },
      })
    }
    await prisma.customerBalanceMovement.deleteMany({ where: { saleId: { in: saleIds } } })

    // Devolver el stock descontado
    const stockMovs = await prisma.stockMovement.findMany({
      where: { saleId: { in: saleIds } },
      select: { productId: true, quantity: true },
    })
    for (const sm of stockMovs) {
      await prisma.product.update({
        where: { id: sm.productId },
        data: { stock: { increment: sm.quantity } },
      })
    }
    await prisma.stockMovement.deleteMany({ where: { saleId: { in: saleIds } } })

    // Las líneas caen en cascada con la venta
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } })
  }

  const cajas = await prisma.cashRegister.deleteMany({
    where: { denominationNotes: { startsWith: MARKER } },
  })

  console.log(`Borradas ${saleIds.length} ventas y ${cajas.count} cajas de prueba.`)
}

/* ─── Generación ─────────────────────────────────────────────────────────── */

async function generar(prisma: PrismaClient) {
  const clinic = await prisma.clinic.findFirst({ orderBy: { createdAt: "asc" } })
  if (!clinic) throw new Error("No hay ninguna clínica en la BD. Ejecuta antes npm run db:seed.")

  const [users, customers, services, products] = await Promise.all([
    prisma.user.findMany({ where: { clinicId: clinic.id, active: true }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: { clinicId: clinic.id, active: true }, select: { id: true } }),
    prisma.service.findMany({ where: { clinicId: clinic.id, active: true } }),
    prisma.product.findMany({ where: { clinicId: clinic.id, active: true } }),
  ])

  if (!users.length || !customers.length || !services.length) {
    throw new Error("Faltan usuarios, clientes o servicios. Ejecuta antes npm run db:seed.")
  }

  // Stock disponible en memoria para no dejar productos en negativo
  const stockLeft = new Map(products.map((p) => [p.id, p.stock]))

  const today = new Date()
  let carryOverCents = FLOAT_CENTS
  let creadas = 0
  let cajasCreadas = 0
  const resumen: string[] = []

  for (let back = DAYS; back >= 1; back--) {
    const day = new Date(today)
    day.setDate(today.getDate() - back)
    day.setHours(12, 0, 0, 0)
    if (day.getDay() === 0) continue // domingo cerrado

    const key = dateKey(day)
    const yaExiste = await prisma.cashRegister.findUnique({
      where: { clinicId_date: { clinicId: clinic.id, date: key } },
    })
    if (yaExiste) {
      resumen.push(`${key}: se salta (ya había caja)`)
      continue
    }

    const numVentas = day.getDay() === 6 ? between(4, 7) : between(3, 6) // sábados más movidos
    let cashCents = 0
    let cardCents = 0
    let ventasDia = 0

    for (let i = 0; i < numVentas; i++) {
      const createdAt = atLocalTime(day, between(9, 19), pick([0, 15, 30, 45]))
      const user = pick(users)
      const customer = pick(customers)

      // Una tarjeta regalo suelta de vez en cuando; el resto, ticket normal
      const esTarjetaRegalo = rnd() < 0.06
      const lines: {
        type: string; serviceId?: string; productId?: string; description: string
        quantity: number; unitPriceCents: number; discountPercent: number
        durationMinutes?: number | null; totalCents: number
      }[] = []

      if (esTarjetaRegalo) {
        const importe = pick([3000, 5000, 8000, 10000])
        lines.push({
          type: "GIFT_CARD", description: "Tarjeta regalo", quantity: 1,
          unitPriceCents: importe, discountPercent: 0, totalCents: importe,
        })
      } else {
        const numLineas = between(1, 3)
        for (let l = 0; l < numLineas; l++) {
          const usarProducto = products.length > 0 && rnd() < 0.3
          const descuento = rnd() < 0.2 ? pick([10, 15, 20]) : 0

          if (usarProducto) {
            const p = pick(products)
            const disponible = stockLeft.get(p.id) ?? 0
            if (disponible <= 0) continue
            stockLeft.set(p.id, disponible - 1)
            lines.push({
              type: "PRODUCT", productId: p.id, description: p.name, quantity: 1,
              unitPriceCents: p.priceCents, discountPercent: descuento,
              totalCents: Math.round(p.priceCents * (1 - descuento / 100)),
            })
          } else {
            const s = pick(services)
            const precio = s.pricingType === "PER_MINUTE" && s.pricePerMinuteCents
              ? s.pricePerMinuteCents * s.durationMinutes
              : s.priceCents
            lines.push({
              type: "SERVICE", serviceId: s.id, description: s.name, quantity: 1,
              unitPriceCents: precio, discountPercent: descuento,
              durationMinutes: s.pricingType === "PER_MINUTE" ? s.durationMinutes : null,
              totalCents: Math.round(precio * (1 - descuento / 100)),
            })
          }
        }
      }

      if (lines.length === 0) continue

      const subtotalCents = lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0)
      const totalCents = lines.reduce((a, l) => a + l.totalCents, 0)
      const discountCents = subtotalCents - totalCents

      // Mismo reparto que en el TPV: la mayoría en efectivo, algo en tarjeta y
      // alguna venta que se queda a deber (esa no entra en caja).
      const r = rnd()
      const paymentMethod = esTarjetaRegalo ? (r < 0.5 ? "CASH" : "CARD") : r < 0.5 ? "CASH" : r < 0.88 ? "CARD" : "DEBT"
      const status = paymentMethod === "DEBT" ? "DEBT" : "PAID"
      const paidCents = paymentMethod === "DEBT" ? 0 : totalCents

      const sale = await prisma.sale.create({
        data: {
          clinicId: clinic.id,
          customerId: customer.id,
          userId: user.id,
          saleType: esTarjetaRegalo ? "GIFT_CARD" : "SALE",
          status,
          paymentMethod,
          subtotalCents,
          discountCents,
          totalCents,
          paidCents,
          notes: MARKER,
          createdAt,
          updatedAt: createdAt,
          lines: { create: lines },
        },
      })

      // Movimientos de stock de las líneas de producto
      for (const l of lines.filter((x) => x.type === "PRODUCT")) {
        await prisma.stockMovement.create({
          data: { productId: l.productId!, userId: user.id, type: "SALE", quantity: l.quantity, saleId: sale.id, createdAt },
        })
        await prisma.product.update({ where: { id: l.productId! }, data: { stock: { decrement: l.quantity } } })
      }

      // Tarjeta regalo: abona saldo a otro cliente (el destinatario)
      if (esTarjetaRegalo) {
        const destinatario = pick(customers.filter((c) => c.id !== customer.id)) ?? customer
        await prisma.customerBalanceMovement.create({
          data: {
            clinicId: clinic.id, customerId: destinatario.id, userId: user.id,
            type: "GIFT_CARD_IN", amountCents: totalCents, saleId: sale.id,
            notes: "Tarjeta regalo", createdAt,
          },
        })
        await prisma.customer.update({ where: { id: destinatario.id }, data: { balanceCents: { increment: totalCents } } })
      }

      if (paymentMethod === "CASH") cashCents += totalCents
      if (paymentMethod === "CARD") cardCents += totalCents
      creadas++
      ventasDia++
    }

    // Caja del día, ya cerrada. Un par de días con descuadre para ver el aviso.
    const openingCashCents = carryOverCents
    const expectedCash = openingCashCents + cashCents
    const descuadre = rnd() < 0.15 ? pick([-500, -250, 250, 1000]) : 0
    const closingDeclaredCents = Math.max(0, expectedCash + descuadre)
    const closingKeptCents = FLOAT_CENTS
    await prisma.cashRegister.create({
      data: {
        clinicId: clinic.id,
        date: key,
        status: "CLOSED",
        openingCashCents,
        totalCardCents: cardCents,
        totalCashCents: cashCents,
        closingDeclaredCents,
        closingKeptCents,
        differenceCents: closingDeclaredCents - expectedCash,
        denominationNotes: `${MARKER} 2×50€, 4×20€, 3×10€`,
        closedByUserId: pick(users).id,
        closedAt: atLocalTime(day, 20, 15),
        createdAt: atLocalTime(day, 9, 0),
        updatedAt: atLocalTime(day, 20, 15),
      },
    })
    cajasCreadas++
    carryOverCents = closingKeptCents

    resumen.push(
      `${key}  ${String(ventasDia).padStart(2)} ventas   efectivo ${(cashCents / 100).toFixed(2).padStart(8)} €   tarjeta ${(cardCents / 100).toFixed(2).padStart(8)} €   descuadre ${(descuadre / 100).toFixed(2)} €`,
    )
  }

  console.log(resumen.join("\n"))
  console.log(`\nCreadas ${creadas} ventas y ${cajasCreadas} cajas cerradas.`)
}

/* ─── Entrada ────────────────────────────────────────────────────────────── */

/**
 * Siembra 15 días de ventas y cajas de demostración. Reejecutable: siempre
 * limpia antes lo suyo (identificado por el MARKER) y regenera con la misma
 * semilla, así que produce exactamente el mismo resultado cada vez.
 *
 * Es dato de demo, no de referencia: no debe ejecutarse contra producción.
 */
export async function seedDemoSales(prisma: PrismaClient, opts: { limpiarSolo?: boolean } = {}) {
  await limpiar(prisma) // siempre se limpia antes, así el script es reejecutable
  if (!opts.limpiarSolo) await generar(prisma)
}

// Entrada por CLI: `tsx scripts/seed-demo-sales.ts [--limpiar]`.
// No se ejecuta al importar.
if (require.main === module) {
  const prisma = new PrismaClient()
  seedDemoSales(prisma, { limpiarSolo: process.argv.includes("--limpiar") })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}

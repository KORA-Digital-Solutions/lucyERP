import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { getSession } from "@/lib/session"
import { getVoucherTemplatesForSale } from "@/lib/voucher-actions"
import { SalesClient } from "@/components/sales-client"

export const dynamic = "force-dynamic"

/**
 * Cuántas ventas se traen para el histórico.
 *
 * La pantalla filtra en el navegador —se teclea y responde al momento, sin ir
 * y volver al servidor por cada letra—, así que hace falta tener delante un
 * trozo de historia, no la historia entera. Con este tope entran holgadamente
 * más de un año de un centro como este; que haya más antiguas lo dice la
 * propia pantalla en vez de callárselo.
 */
const VENTAS_CARGADAS = 500

export default async function SalesPage() {
  const [clinic, session] = await Promise.all([getActiveClinic(), getSession()])
  const today = new Date().toISOString().slice(0, 10)

  const [sales, customers, services, products, workers, voucherTemplates, cashRegister, conPin] = await Promise.all([
    prisma.sale.findMany({
      where: { clinicId: clinic.id },
      include: {
        customer: true, user: true,
        lines: {
          include: {
            worker: { select: { name: true, lastName: true } },
            // La familia del servicio, para poder filtrar el histórico por
            // ella. El producto, la tarjeta y el bono no tienen familia
            // propia: se agrupan con la suya de siempre en la pantalla.
            service: { select: { family: { select: { name: true } } } },
            // De qué bono sale la sesión que se gasta. Sin esto, en el
            // listado una sesión es un servicio a 0 EUR y no se sabe por qué.
            voucherSession: { select: { voucher: { select: { name: true } } } },
          },
        },
        balanceMovements: { where: { type: "BALANCE_USED" }, select: { amountCents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: VENTAS_CARGADAS,
    }),
    prisma.customer.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.service.findMany({
      where: { clinicId: clinic.id, active: true },
      // La familia va al TPV: el buscador de servicios entra por familia, que
      // es como se piensa el catálogo cuando no te sabes el nombre exacto.
      include: { family: { select: { name: true, sortOrder: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: { name: "asc" },
    }),
    getVoucherTemplatesForSale(),
    prisma.cashRegister.findUnique({
      where: { clinicId_date: { clinicId: clinic.id, date: today } },
      select: { status: true },
    }),
    // Mientras no haya ni un PIN repartido, el TPV sigue funcionando con el
    // usuario de la sesión: si no, el mostrador se queda parado el día que se
    // despliega esto (ver requireOperator en lib/auth.ts).
    prisma.user.count({ where: { clinicId: clinic.id, active: true, NOT: { pinHash: null } } }),
  ])

  const cashOpen = cashRegister?.status === "OPEN"

  const serviceRows = services.map((s) => ({
    id: s.id,
    name: s.name,
    priceCents: s.priceCents,
    pricingType: s.pricingType,
    pricePerMinuteCents: s.pricePerMinuteCents,
    durationMinutes: s.durationMinutes,
    familyId: s.familyId,
    familyName: s.family.name,
    familySortOrder: s.family.sortOrder,
  }))

  return (
    <SalesClient
      sales={sales as any}
      customers={customers as any}
      services={serviceRows}
      products={products}
      workers={workers}
      voucherTemplates={voucherTemplates}
      currentUserId={session?.userId ?? null}
      cashOpen={cashOpen}
      pinRequired={conPin > 0}
      // Si la consulta ha llegado al tope, hay ventas más antiguas fuera.
      hayVentasSinCargar={sales.length === VENTAS_CARGADAS}
      soloLectura={session?.mode === "MANAGEMENT"}
    />
  )
}

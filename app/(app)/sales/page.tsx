import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { getSession } from "@/lib/session"
import { SalesClient } from "@/components/sales-client"

export const dynamic = "force-dynamic"

export default async function SalesPage() {
  const [clinic, session] = await Promise.all([getActiveClinic(), getSession()])
  const today = new Date().toISOString().slice(0, 10)

  const [sales, customers, services, products, workers, cashRegister, conPin] = await Promise.all([
    prisma.sale.findMany({
      where: { clinicId: clinic.id },
      include: {
        customer: true, user: true,
        lines: { include: { worker: { select: { name: true, lastName: true } } } },
        balanceMovements: { where: { type: "BALANCE_USED" }, select: { amountCents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
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
      currentUserId={session?.userId ?? null}
      cashOpen={cashOpen}
      pinRequired={conPin > 0}
    />
  )
}

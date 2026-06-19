import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { getSession } from "@/lib/session"
import { SalesClient } from "@/components/sales-client"

export const dynamic = "force-dynamic"

export default async function SalesPage() {
  const [clinic, session] = await Promise.all([getActiveClinic(), getSession()])
  const today = new Date().toISOString().slice(0, 10)

  const [sales, customers, services, products, workers, cashRegister] = await Promise.all([
    prisma.sale.findMany({
      where: { clinicId: clinic.id },
      include: { customer: true, user: true, lines: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.customer.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.service.findMany({
      where: { clinicId: clinic.id, active: true },
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
  ])

  const cashOpen = cashRegister?.status === "OPEN"

  return (
    <SalesClient
      sales={sales as any}
      customers={customers as any}
      services={services as any}
      products={products}
      workers={workers}
      currentUserId={session?.userId ?? null}
      cashOpen={cashOpen}
    />
  )
}

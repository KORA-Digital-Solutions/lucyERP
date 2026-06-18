import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { SalesClient } from "@/components/sales-client"

export const dynamic = "force-dynamic"

export default async function SalesPage() {
  const clinic = await getActiveClinic()

  const [sales, customers, services, products] = await Promise.all([
    prisma.sale.findMany({
      where: { clinicId: clinic.id },
      include: { customer: true, user: true, lines: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.customer.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.service.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <SalesClient
      sales={sales as any}
      customers={customers}
      services={services as any}
      products={products}
    />
  )
}

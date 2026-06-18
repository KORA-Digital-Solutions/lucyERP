import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { ServicesClient, type ServiceRow } from "@/components/services-client"

export const dynamic = "force-dynamic"

export default async function ServicesPage() {
  const clinic = await getActiveClinic()
  const services = await prisma.service.findMany({
    where: { clinicId: clinic.id },
    orderBy: { name: "asc" },
  })

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
    pricingType: s.pricingType,
    pricePerMinuteCents: s.pricePerMinuteCents,
    active: s.active,
  }))

  return <ServicesClient rows={rows} />
}

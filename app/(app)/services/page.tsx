import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { ServicesClient, type ServiceRow, type ServiceFamilyRow } from "@/components/services-client"

export const dynamic = "force-dynamic"

export default async function ServicesPage() {
  const clinic = await getActiveClinic()
  const [services, families] = await Promise.all([
    prisma.service.findMany({
      where: { clinicId: clinic.id },
      include: { family: true },
      orderBy: { name: "asc" },
    }),
    prisma.serviceFamily.findMany({
      where: { clinicId: clinic.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ])

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
    pricingType: s.pricingType,
    pricePerMinuteCents: s.pricePerMinuteCents,
    active: s.active,
    familyId: s.familyId,
    familyName: s.family.name,
  }))

  const familyRows: ServiceFamilyRow[] = families.map((f) => ({
    id: f.id,
    name: f.name,
    active: f.active,
  }))

  return <ServicesClient rows={rows} families={familyRows} />
}

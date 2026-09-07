import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { getVoucherTemplates } from "@/lib/voucher-actions"
import { VouchersClient, type VoucherServiceOption } from "@/components/vouchers-client"

export const dynamic = "force-dynamic"

export default async function VouchersPage() {
  const clinic = await getActiveClinic()
  const [rows, services] = await Promise.all([
    getVoucherTemplates(),
    // Solo los activos: un bono nuevo no puede montarse sobre un servicio que
    // el centro ya ha retirado. Los bonos que ya lo incluían siguen igual,
    // porque llevan su propia copia de la lista.
    prisma.service.findMany({
      where: { clinicId: clinic.id, active: true },
      select: { id: true, name: true, priceCents: true, family: { select: { name: true, sortOrder: true } } },
      orderBy: [{ family: { sortOrder: "asc" } }, { name: "asc" }],
    }),
  ])

  const serviceOptions: VoucherServiceOption[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    priceCents: s.priceCents,
    familyName: s.family.name,
  }))

  return <VouchersClient rows={rows} services={serviceOptions} />
}

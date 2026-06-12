import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { CabinsClient, type CabinRow } from "@/components/cabins-client"

export const dynamic = "force-dynamic"

export default async function CabinsPage() {
  const clinic = await getActiveClinic()
  const cabins = await prisma.cabin.findMany({
    where: { clinicId: clinic.id },
    orderBy: { sortOrder: "asc" },
  })

  const rows: CabinRow[] = cabins.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
    active: c.active,
  }))

  return <CabinsClient rows={rows} />
}

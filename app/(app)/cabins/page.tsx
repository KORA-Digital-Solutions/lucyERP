import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { CabinsClient, type CabinRow } from "@/components/cabins-client"

export const dynamic = "force-dynamic"

export default async function CabinsPage() {
  const clinic = await getActiveClinic()
  const [cabins, workers] = await Promise.all([
    prisma.cabin.findMany({ where: { clinicId: clinic.id }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { name: "asc" } }),
  ])

  const rows: CabinRow[] = cabins.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
    active: c.active,
    defaultWorkerId: c.defaultWorkerId,
  }))

  return <CabinsClient rows={rows} workers={workers.map((w) => ({ id: w.id, name: w.name }))} />
}

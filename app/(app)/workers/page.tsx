import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { WorkersClient, type WorkerRow } from "@/components/workers-client"

export const dynamic = "force-dynamic"

export default async function WorkersPage() {
  const clinic = await getActiveClinic()
  const workers = await prisma.user.findMany({
    where: { clinicId: clinic.id },
    orderBy: { name: "asc" },
  })

  const rows: WorkerRow[] = workers.map((w) => ({
    id: w.id,
    name: w.name,
    email: w.email,
    phone: w.phone,
    role: w.role,
    active: w.active,
    color: w.color ?? "#3C54A4",
  }))

  return <WorkersClient rows={rows} />
}

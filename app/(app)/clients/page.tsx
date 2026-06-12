import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { ClientsClient, type ClientRow } from "@/components/clients-client"

export const dynamic = "force-dynamic"

export default async function ClientsPage() {
  const clinic = await getActiveClinic()
  const customers = await prisma.customer.findMany({
    where: { clinicId: clinic.id },
    orderBy: { firstName: "asc" },
    include: {
      appointments: {
        where: { startAt: { gte: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
        orderBy: { startAt: "asc" },
        take: 1,
      },
    },
  })

  const rows: ClientRow[] = customers.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    whatsappOptIn: c.whatsappOptIn,
    nextAppointment: c.appointments[0]
      ? c.appointments[0].startAt.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : null,
  }))

  return <ClientsClient rows={rows} />
}

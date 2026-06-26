import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { ClientsClient, type ClientRow } from "@/components/clients-client"

export const dynamic = "force-dynamic"

export default async function ClientsPage() {
  const clinic = await getActiveClinic()
  const inactivityWarningDays = clinic.inactivityWarningDays ?? 180
  const customers = await prisma.customer.findMany({
    where: { clinicId: clinic.id },
    orderBy: { firstName: "asc" },
    include: {
      appointments: {
        where: { status: { in: ["DONE", "CONFIRMED", "PENDING"] } },
        orderBy: { startAt: "desc" },
        take: 1,
      },
      sales: {
        where: { status: "DEBT" },
        select: { totalCents: true, paidCents: true },
      },
    },
  })

  const now = new Date()

  const rows: ClientRow[] = customers.map((c) => {
    const lastAppt = c.appointments[0] ?? null
    const lastApptDate = lastAppt ? lastAppt.startAt : null
    const daysSince = lastApptDate
      ? Math.floor((now.getTime() - lastApptDate.getTime()) / 86_400_000)
      : null

    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      lastName2: c.lastName2,
      phone: c.phone,
      phone2: c.phone2,
      email: c.email,
      birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
      notes: c.notes,
      whatsappOptIn: c.whatsappOptIn,
      active: c.active ?? true,
      balanceCents: c.balanceCents,
      debtCents: c.sales.reduce((s, x) => s + (x.totalCents - x.paidCents), 0),
      lastAppointment: lastApptDate
        ? lastApptDate.toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
        : null,
      daysSinceLastAppt: daysSince,
    }
  })

  return <ClientsClient rows={rows} inactivityWarningDays={inactivityWarningDays} />
}

import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { dayRange, toDateInputValue, toTimeString, toTimeInputValue, formatLongDate } from "@/lib/format"
import { AgendaBoard, type AgendaAppointment } from "@/components/agenda-board"

export const dynamic = "force-dynamic"

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + (m || 0)
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  const date = dateParam || toDateInputValue(new Date())
  const clinic = await getActiveClinic()
  const { start, end } = dayRange(date)

  const [cabins, workers, services, customers, appointments] = await Promise.all([
    prisma.cabin.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { name: "asc" } }),
    prisma.service.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { name: "asc" } }),
    prisma.customer.findMany({ where: { clinicId: clinic.id }, orderBy: { firstName: "asc" } }),
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, startAt: { gte: start, lte: end } },
      include: { customer: true, service: true, worker: true },
      orderBy: { startAt: "asc" },
    }),
  ])

  const agendaAppointments: AgendaAppointment[] = appointments.map((a) => ({
    id: a.id,
    customerId: a.customerId,
    customerName: `${a.customer.firstName} ${a.customer.lastName ?? ""}`.trim(),
    serviceId: a.serviceId,
    serviceName: a.service.name,
    workerId: a.workerId,
    workerName: a.worker.name,
    workerColor: a.worker.color ?? "#3C54A4",
    cabinId: a.cabinId,
    startMinutes: a.startAt.getHours() * 60 + a.startAt.getMinutes(),
    durationMinutes: a.durationMinutes,
    startLabel: toTimeString(a.startAt),
    endLabel: toTimeString(a.endAt),
    status: a.status,
    reminderStatus: a.reminderStatus,
    notes: a.notes,
    date: toDateInputValue(a.startAt),
    time: toTimeInputValue(a.startAt),
  }))

  return (
    <AgendaBoard
      date={date}
      longDate={formatLongDate(date)}
      openingMinutes={timeToMinutes(clinic.openingTime)}
      closingMinutes={timeToMinutes(clinic.closingTime)}
      cabins={cabins.map((c) => ({ id: c.id, name: c.name }))}
      workers={workers.map((w) => ({ id: w.id, name: w.name }))}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        priceCents: s.priceCents,
      }))}
      customers={customers.map((c) => ({
        id: c.id,
        // Formato "primer apellido segundo apellido, nombre" (sin teléfono).
        label: c.lastName ? `${c.lastName}, ${c.firstName}` : c.firstName,
        whatsappOptIn: c.whatsappOptIn,
      }))}
      appointments={agendaAppointments}
    />
  )
}

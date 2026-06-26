import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { AppointmentsHistoryClient, type AppointmentRow } from "@/components/appointments-history-client"

export const dynamic = "force-dynamic"

interface SearchParams {
  status?: string
  from?: string
  to?: string
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { from, to, status } = await searchParams
  const clinic = await getActiveClinic()

  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const fromStr = from ?? defaultFrom.toISOString().slice(0, 10)
  const toStr = to ?? now.toISOString().slice(0, 10)
  const statusParam = status ?? "all"

  const fromDate = new Date(fromStr + "T00:00:00")
  const toDate = new Date(toStr + "T23:59:59")

  const statusFilter =
    statusParam !== "all" && ["PENDING", "CONFIRMED", "DONE", "CANCELLED"].includes(statusParam)
      ? { status: statusParam }
      : {}

  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: clinic.id,
      startAt: { gte: fromDate, lte: toDate },
      ...statusFilter,
    },
    orderBy: { startAt: "desc" },
    include: {
      customer: true,
      service: true,
      worker: true,
      cabin: true,
    },
  })

  const rows: AppointmentRow[] = appointments.map((a) => ({
    id: a.id,
    startAt: a.startAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    customerName:
      a.customer.lastName
        ? `${a.customer.lastName}${a.customer.lastName2 ? ` ${a.customer.lastName2}` : ""}, ${a.customer.firstName}`
        : a.customer.firstName,
    serviceName: a.service.name,
    workerName: a.worker.name,
    cabinName: a.cabin.name,
  }))

  return (
    <AppointmentsHistoryClient
      rows={rows}
      defaultFrom={fromStr}
      defaultTo={toStr}
      defaultStatus={statusParam}
    />
  )
}

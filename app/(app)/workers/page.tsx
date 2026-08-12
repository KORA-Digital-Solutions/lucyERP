import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { toDateInputValue } from "@/lib/format"
import { WorkersClient, type WorkerRow } from "@/components/workers-client"
import type { BalanceRow, LeaveRow } from "@/components/vacations-client"
import type { OverrideRow } from "@/components/schedules-client"

export const dynamic = "force-dynamic"

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; tab?: string }>
}) {
  const { year: yearParam, tab } = await searchParams
  const year = Number(yearParam) || new Date().getFullYear()
  const clinic = await getActiveClinic()
  const todayStr = toDateInputValue(new Date())

  const [workers, balances, leaves, clinicOverrides, workerOverrides] = await Promise.all([
    prisma.user.findMany({ where: { clinicId: clinic.id }, orderBy: { name: "asc" } }),
    prisma.workerLeaveBalance.findMany({ where: { clinicId: clinic.id, year } }),
    prisma.workerLeave.findMany({
      where: { clinicId: clinic.id, date: { startsWith: `${year}-` } },
      include: { worker: true },
      orderBy: { date: "asc" },
    }),
    prisma.clinicScheduleOverride.findMany({
      where: { clinicId: clinic.id, date: { gte: todayStr } },
      include: { slots: true },
      orderBy: { date: "asc" },
    }),
    prisma.workerScheduleOverride.findMany({
      where: { clinicId: clinic.id, date: { gte: todayStr } },
      include: { slots: true, worker: true },
      orderBy: { date: "asc" },
    }),
  ])

  const rows: WorkerRow[] = workers.map((w) => ({
    id: w.id,
    name: w.name,
    lastName: w.lastName,
    email: w.email,
    phone: w.phone,
    role: w.role,
    active: w.active,
    color: w.color ?? "#3C54A4",
    mustChangePassword: w.mustChangePassword,
  }))

  const activeWorkers = workers.filter((w) => w.active)
  const balanceRows: BalanceRow[] = activeWorkers.map((w) => {
    const balance = balances.find((b) => b.workerId === w.id)
    const workerLeaves = leaves.filter((l) => l.workerId === w.id)
    return {
      workerId: w.id,
      workerName: w.name,
      vacationTotal: balance?.vacationDaysTotal ?? 0,
      vacationUsed: workerLeaves.filter((l) => l.type === "VACATION").length,
      personalTotal: balance?.personalDaysTotal ?? 0,
      personalUsed: workerLeaves.filter((l) => l.type === "PERSONAL").length,
    }
  })
  const leaveRows: LeaveRow[] = leaves.map((l) => ({
    id: l.id,
    workerId: l.workerId,
    workerName: l.worker.name,
    date: l.date,
    type: l.type,
    notes: l.notes,
  }))

  const clinicOverrideRows: OverrideRow[] = clinicOverrides.map((o) => ({
    id: o.id,
    date: o.date,
    closed: o.closed,
    reason: o.reason,
    slots: o.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
    workerId: null,
    workerName: null,
  }))
  const workerOverrideRows: OverrideRow[] = workerOverrides.map((o) => ({
    id: o.id,
    date: o.date,
    closed: o.closed,
    reason: o.reason,
    slots: o.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
    workerId: o.workerId,
    workerName: o.worker.name,
  }))

  const domain = clinic.email?.split("@")[1] ?? "centroesteticalucia.com"
  const validTabs = ["workers", "vacations", "overrides"] as const
  return (
    <WorkersClient
      rows={rows}
      domain={domain}
      initialTab={validTabs.includes(tab as typeof validTabs[number]) ? (tab as typeof validTabs[number]) : "workers"}
      vacationYear={year}
      vacationWorkers={activeWorkers.map((w) => ({ id: w.id, name: w.name }))}
      vacationBalances={balanceRows}
      vacationLeaves={leaveRows}
      clinicOverrides={clinicOverrideRows}
      workerOverrides={workerOverrideRows}
    />
  )
}

import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { toDateInputValue } from "@/lib/format"
import { HorariosClient } from "@/components/horarios-client"
import type { WeeklyDay, OverrideRow, HolidayRow } from "@/components/schedules-client"
import type { BalanceRow, LeaveRow } from "@/components/vacations-client"

export const dynamic = "force-dynamic"

function groupByDay(rows: { dayOfWeek: number; startTime: string; endTime: string }[]): WeeklyDay[] {
  const days: WeeklyDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, slots: [] }))
  for (const r of rows) {
    days[r.dayOfWeek].slots.push({ startTime: r.startTime, endTime: r.endTime })
  }
  for (const d of days) d.slots.sort((a, b) => a.startTime.localeCompare(b.startTime))
  return days
}

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; tab?: string }>
}) {
  const { year: yearParam, tab } = await searchParams
  const year = Number(yearParam) || new Date().getFullYear()
  const clinic = await getActiveClinic()
  const todayStr = toDateInputValue(new Date())

  const [workers, clinicSlots, workerSlots, clinicOverrides, workerOverrides, balances, leaves, holidays] =
    await Promise.all([
      prisma.user.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { name: "asc" } }),
      prisma.clinicWeeklySlot.findMany({ where: { clinicId: clinic.id } }),
      prisma.workerWeeklySlot.findMany({ where: { clinicId: clinic.id } }),
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
      prisma.workerLeaveBalance.findMany({ where: { clinicId: clinic.id, year } }),
      prisma.workerLeave.findMany({
        where: { clinicId: clinic.id, date: { startsWith: `${year}-` } },
        include: { worker: true },
        orderBy: { date: "asc" },
      }),
      prisma.holiday.findMany({ where: { clinicId: clinic.id }, orderBy: { date: "asc" } }),
    ])

  const clinicWeekly = groupByDay(clinicSlots)
  const workerWeeklyByWorker: Record<string, WeeklyDay[]> = {}
  for (const w of workers) {
    workerWeeklyByWorker[w.id] = groupByDay(workerSlots.filter((s) => s.workerId === w.id))
  }

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

  const balanceRows: BalanceRow[] = workers.map((w) => {
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

  const holidayRows: HolidayRow[] = holidays.map((h) => ({
    id: h.id,
    date: h.date,
    name: h.name,
    scope: h.scope,
  }))

  const validTabs = ["schedule", "overrides", "vacations", "holidays"] as const
  return (
    <HorariosClient
      workers={workers.map((w) => ({ id: w.id, name: w.name, color: w.color ?? "#3C54A4" }))}
      clinicWeekly={clinicWeekly}
      workerWeeklyByWorker={workerWeeklyByWorker}
      clinicOverrides={clinicOverrideRows}
      workerOverrides={workerOverrideRows}
      vacationYear={year}
      vacationBalances={balanceRows}
      vacationLeaves={leaveRows}
      holidays={holidayRows}
      initialTab={validTabs.includes(tab as typeof validTabs[number]) ? (tab as typeof validTabs[number]) : "schedule"}
    />
  )
}

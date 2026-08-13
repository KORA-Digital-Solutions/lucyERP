import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { toDateInputValue } from "@/lib/format"
import { getClinicWeekCells, getWorkerWeekCells } from "@/lib/schedule"
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

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function addDays(s: string, days: number): string {
  const d = parseDateStr(s)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}
// Lunes de la semana que contiene `s` (dow: 0 domingo .. 6 sábado).
function mondayOf(s: string): string {
  const d = parseDateStr(s)
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return toDateStr(d)
}

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; week?: string }>
}) {
  const { year: yearParam, week: weekParam } = await searchParams
  const year = Number(yearParam) || new Date().getFullYear()
  const clinic = await getActiveClinic()
  const todayStr = toDateInputValue(new Date())
  const weekStart = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? mondayOf(weekParam) : mondayOf(todayStr)
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const [workers, clinicSlots, workerSlots, clinicOverrides, workerOverrides, balances, leaves, weekLeaves, holidays, clinicWeekCells] =
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
      // Independiente del año del disclosure de saldos: el panel de la
      // cuadrícula necesita saber si HAY vacaciones/asuntos propios en la
      // semana visible aunque caiga a caballo de dos años.
      prisma.workerLeave.findMany({
        where: { clinicId: clinic.id, date: { in: weekDates } },
        include: { worker: true },
      }),
      prisma.holiday.findMany({ where: { clinicId: clinic.id }, orderBy: { date: "asc" } }),
      getClinicWeekCells(clinic.id, weekDates),
    ])

  const workerWeekCellsEntries = await Promise.all(
    workers.map(async (w) => [w.id, await getWorkerWeekCells(clinic.id, w.id, weekDates)] as const),
  )
  const workerWeekCellsByWorker = Object.fromEntries(workerWeekCellsEntries)

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
  const weekLeaveRows: LeaveRow[] = weekLeaves.map((l) => ({
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

  return (
    <HorariosClient
      workers={workers.map((w) => ({ id: w.id, name: w.name, color: w.color ?? "#3C54A4" }))}
      clinicWeekly={clinicWeekly}
      workerWeeklyByWorker={workerWeeklyByWorker}
      weekDates={weekDates}
      weekStart={weekStart}
      clinicWeekCells={clinicWeekCells}
      workerWeekCellsByWorker={workerWeekCellsByWorker}
      clinicOverrides={clinicOverrideRows}
      workerOverrides={workerOverrideRows}
      weekLeaves={weekLeaveRows}
      vacationYear={year}
      vacationBalances={balanceRows}
      holidays={holidayRows}
    />
  )
}

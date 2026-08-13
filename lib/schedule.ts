import { prisma } from "@/lib/db"

// Motor de resolución de horario efectivo (centro + empleada) para una fecha
// concreta. No conoce nada de citas — eso lo sigue gestionando
// lib/availability.ts, que usa este módulo para saber si una franja cae
// dentro del horario en el que se puede trabajar.

export interface TimeRange {
  startTime: string // "HH:MM"
  endTime: string
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + (m || 0)
}

// dayOfWeek: 0=domingo .. 6=sábado (Date.getDay()).
export function dayOfWeekFromDateStr(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d).getDay()
}

/**
 * Horario efectivo del CENTRO para una fecha. Orden de prioridad:
 *   1. ClinicScheduleOverride explícito para esa fecha (manda siempre, tanto
 *      para abrir como para cerrar, incluido reabrir un festivo).
 *   2. Holiday sin override explícito → cerrado.
 *   3. ClinicWeeklySlot del día de la semana correspondiente.
 * Devuelve [] si el centro está cerrado ese día.
 */
export async function getEffectiveClinicHours(clinicId: string, date: string): Promise<TimeRange[]> {
  const override = await prisma.clinicScheduleOverride.findUnique({
    where: { clinicId_date: { clinicId, date } },
    include: { slots: true },
  })
  if (override) {
    return override.closed ? [] : override.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
  }

  const holiday = await prisma.holiday.findUnique({ where: { clinicId_date: { clinicId, date } } })
  if (holiday) return []

  const dayOfWeek = dayOfWeekFromDateStr(date)
  const weekly = await prisma.clinicWeeklySlot.findMany({ where: { clinicId, dayOfWeek } })
  return weekly.map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
}

/**
 * Horario efectivo de una EMPLEADA para una fecha. Orden de prioridad:
 *   1. WorkerLeave (vacaciones/asuntos propios) → cerrado, prioridad máxima.
 *   2. WorkerScheduleOverride explícito para esa fecha.
 *   3. WorkerWeeklySlot del día de la semana correspondiente.
 * OJO: esta resolución NUNCA consulta Holiday — un festivo solo afecta al
 * horario del centro. Si el admin reabre el centro un festivo, la empleada
 * recupera automáticamente su horario semanal base ese día, sin necesidad de
 * tocar nada a nivel individual.
 */
export async function getEffectiveWorkerHours(workerId: string, date: string): Promise<TimeRange[]> {
  const leaveRow = await prisma.workerLeave.findFirst({ where: { workerId, date } })
  if (leaveRow) return []

  const override = await prisma.workerScheduleOverride.findFirst({
    where: { workerId, date },
    include: { slots: true },
  })
  if (override) {
    return override.closed ? [] : override.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
  }

  const dayOfWeek = dayOfWeekFromDateStr(date)
  const weekly = await prisma.workerWeeklySlot.findMany({ where: { workerId, dayOfWeek } })
  return weekly.map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
}

// Intersección de dos conjuntos de franjas horarias (minutos desde medianoche).
function intersectRanges(a: TimeRange[], b: TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  for (const ra of a) {
    const aStart = timeToMinutes(ra.startTime)
    const aEnd = timeToMinutes(ra.endTime)
    for (const rb of b) {
      const bStart = timeToMinutes(rb.startTime)
      const bEnd = timeToMinutes(rb.endTime)
      const start = Math.max(aStart, bStart)
      const end = Math.min(aEnd, bEnd)
      if (start < end) {
        result.push({ startTime: minutesToTime(start), endTime: minutesToTime(end) })
      }
    }
  }
  return result
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// Huecos en los que una empleada concreta puede trabajar ese día: horario del
// centro ∩ horario de la empleada.
export async function getEffectiveWorkingHours(
  clinicId: string,
  workerId: string,
  date: string,
): Promise<TimeRange[]> {
  const [clinicHours, workerHours] = await Promise.all([
    getEffectiveClinicHours(clinicId, date),
    getEffectiveWorkerHours(workerId, date),
  ])
  return intersectRanges(clinicHours, workerHours)
}

// ¿Cae [startAt, endAt) dentro de alguna de las franjas efectivas?
export function isWithinRanges(ranges: TimeRange[], startAt: Date, endAt: Date): boolean {
  const startMin = startAt.getHours() * 60 + startAt.getMinutes()
  const endMin = endAt.getHours() * 60 + endAt.getMinutes()
  return ranges.some((r) => startMin >= timeToMinutes(r.startTime) && endMin <= timeToMinutes(r.endTime))
}

// ---------------------------------------------------------------------------
// Vista semanal (Horarios → Horario semanal): igual que arriba pero para un
// rango de fechas de golpe, añadiendo el MOTIVO del cierre (festivo/vacaciones/
// asuntos propios) que getEffectiveClinicHours/getEffectiveWorkerHours no
// devuelven, para poder etiquetar la celda en vez de dejarla en blanco.
// ---------------------------------------------------------------------------

export interface ClinicDayCell {
  date: string
  ranges: TimeRange[]
  closedReason: "HOLIDAY" | null
  holidayName: string | null
}

export interface WorkerDayCell {
  date: string
  ranges: TimeRange[]
  /** Tipo de ausencia (LeaveType) si el día está cerrado por una, o null. */
  closedReason: string | null
}

export async function getClinicWeekCells(clinicId: string, dates: string[]): Promise<ClinicDayCell[]> {
  const holidays = await prisma.holiday.findMany({ where: { clinicId, date: { in: dates } } })
  const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]))
  return Promise.all(
    dates.map(async (date) => {
      const ranges = await getEffectiveClinicHours(clinicId, date)
      const holidayName = holidayByDate.get(date) ?? null
      return {
        date,
        ranges,
        closedReason: ranges.length === 0 && holidayName ? ("HOLIDAY" as const) : null,
        holidayName,
      }
    }),
  )
}

// Nota: las franjas mostradas son la INTERSECCIÓN con el centro (no solo su
// horario individual) — si el centro está cerrado (festivo, excepción,
// domingo…) nadie puede trabajar ese día, así que ninguna empleada debe
// aparecer disponible aunque su horario semanal diga lo contrario.
export async function getWorkerWeekCells(clinicId: string, workerId: string, dates: string[]): Promise<WorkerDayCell[]> {
  const leaves = await prisma.workerLeave.findMany({ where: { workerId, date: { in: dates } } })
  const leaveByDate = new Map(leaves.map((l) => [l.date, l.type]))
  return Promise.all(
    dates.map(async (date) => {
      const ranges = await getEffectiveWorkingHours(clinicId, workerId, date)
      const leaveType = leaveByDate.get(date)
      return {
        date,
        ranges,
        closedReason: ranges.length === 0 && leaveType ? leaveType : null,
      }
    }),
  )
}

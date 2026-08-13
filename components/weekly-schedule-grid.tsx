"use client"

import { LEAVE_TYPE_META, type LeaveType } from "@/lib/enums"
import type { Scope, WorkerOption } from "@/components/schedules-client"
import type { ClinicDayCell, WorkerDayCell, TimeRange } from "@/lib/schedule"

// Gris neutro a propósito: toda la paleta de la app es azul, así que
// "cerrado/festivo" necesita un color que no se confunda con ningún azul de
// empleada ni con el azul del centro abierto.
const CLOSED_COLOR = "#78716C"
const CLINIC_OPEN_COLOR = "#3C54A4"

const DAY_LABELS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] // Date.getDay(): 0=domingo

function dayOfWeekFromDateStr(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d).getDay()
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + (m || 0)
}

interface RowBar {
  left: number
  width: number
  label: string
  color: string
  title: string
}

function rangesToBars(ranges: TimeRange[], displayStart: number, displayEnd: number, color: string): RowBar[] {
  const span = displayEnd - displayStart
  return ranges.map((r) => {
    const start = Math.min(Math.max(timeToMinutes(r.startTime), displayStart), displayEnd)
    const end = Math.min(Math.max(timeToMinutes(r.endTime), displayStart), displayEnd)
    return {
      left: ((start - displayStart) / span) * 100,
      width: Math.max(((end - start) / span) * 100, 2),
      label: `${r.startTime}–${r.endTime}`,
      color,
      title: `${r.startTime}–${r.endTime}`,
    }
  })
}

function GridRow({
  label,
  labelColor,
  dates,
  bars,
  onCellClick,
}: {
  label: string
  labelColor?: string
  dates: string[]
  bars: RowBar[][]
  onCellClick: (date: string) => void
}) {
  return (
    <div className="contents">
      <div className="flex items-center gap-2 border-t px-3 py-2 text-sm font-medium">
        {labelColor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: labelColor }} />}
        <span className="truncate">{label}</span>
      </div>
      {dates.map((date, i) => (
        <button
          key={date}
          type="button"
          onClick={() => onCellClick(date)}
          className="relative h-9 border-t border-l text-left hover:bg-accent/40"
        >
          {bars[i]?.map((bar, bi) => (
            <span
              key={bi}
              title={bar.title}
              className="absolute top-1.5 h-6 overflow-hidden whitespace-nowrap rounded text-[10px] font-medium leading-6 text-white"
              style={{ left: `${bar.left}%`, width: `${bar.width}%`, backgroundColor: bar.color, padding: "0 4px" }}
            >
              {bar.label}
            </span>
          ))}
        </button>
      ))}
    </div>
  )
}

export function WeeklyScheduleGrid({
  dates,
  clinicCells,
  workers,
  workerCellsByWorker,
  displayStartMinutes = 8 * 60,
  displayEndMinutes = 21 * 60,
  onCellClick,
}: {
  dates: string[]
  clinicCells: ClinicDayCell[]
  workers: (WorkerOption & { color?: string })[]
  workerCellsByWorker: Record<string, WorkerDayCell[]>
  displayStartMinutes?: number
  displayEndMinutes?: number
  onCellClick: (scope: Scope, date: string) => void
}) {
  const clinicBars: RowBar[][] = clinicCells.map((cell) => {
    if (cell.closedReason === "HOLIDAY") {
      return [{ left: 1, width: 98, label: cell.holidayName ?? "Festivo", color: CLOSED_COLOR, title: cell.holidayName ?? "Festivo" }]
    }
    if (cell.ranges.length === 0) {
      return [{ left: 1, width: 98, label: "Cerrado", color: CLOSED_COLOR, title: "Cerrado" }]
    }
    return rangesToBars(cell.ranges, displayStartMinutes, displayEndMinutes, CLINIC_OPEN_COLOR)
  })

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: `140px repeat(${dates.length}, minmax(90px, 1fr))` }}
      >
        <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Semana
        </div>
        {dates.map((date) => {
          const [, m, d] = date.split("-")
          return (
            <div key={date} className="border-b border-l px-2 py-2 text-center text-xs font-medium text-foreground">
              {DAY_LABELS_SHORT[dayOfWeekFromDateStr(date)]} {Number(d)}/{Number(m)}
            </div>
          )
        })}

        <GridRow label="Centro" dates={dates} bars={clinicBars} onCellClick={(date) => onCellClick({ type: "CLINIC" }, date)} />

        {workers.map((w) => {
          const cells = workerCellsByWorker[w.id] ?? []
          const bars: RowBar[][] = cells.map((cell) => {
            const leaveMeta = cell.closedReason ? LEAVE_TYPE_META[cell.closedReason as LeaveType] : undefined
            if (leaveMeta) {
              return [{ left: 1, width: 98, label: leaveMeta.label, color: leaveMeta.color, title: leaveMeta.label }]
            }
            return rangesToBars(cell.ranges, displayStartMinutes, displayEndMinutes, w.color ?? "#3C54A4")
          })
          return (
            <GridRow
              key={w.id}
              label={w.name}
              labelColor={w.color}
              dates={dates}
              bars={bars}
              onCellClick={(date) => onCellClick({ type: "WORKER", workerId: w.id, workerName: w.name }, date)}
            />
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
        {(Object.keys(LEAVE_TYPE_META) as LeaveType[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEAVE_TYPE_META[k].color }} />
            {LEAVE_TYPE_META[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLOSED_COLOR }} /> Cerrado / festivo
        </span>
      </div>
    </div>
  )
}

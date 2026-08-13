"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, Pencil, Eye, CalendarOff, Upload, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  saveClinicScheduleOverride,
  saveWorkerScheduleOverride,
  deleteClinicScheduleOverride,
  deleteWorkerScheduleOverride,
  saveHoliday,
  deleteHoliday,
  copyFixedHolidaysToYear,
  bulkImportHolidays,
  addWorkerLeaveRange,
  deleteWorkerLeave,
  type WeeklySlotInput,
} from "@/lib/actions"
import { WEEKDAY_LABELS, HOLIDAY_SCOPE_META, LEAVE_TYPE_META, type HolidayScope, type LeaveType } from "@/lib/enums"
import { cn } from "@/lib/utils"
import type { LeaveRow } from "@/components/vacations-client"

export interface WeeklyDay {
  dayOfWeek: number
  slots: WeeklySlotInput[]
}

export interface OverrideRow {
  id: string
  date: string
  closed: boolean
  reason: string | null
  slots: WeeklySlotInput[]
  workerId: string | null
  workerName: string | null
}

export interface HolidayRow {
  id: string
  date: string
  name: string
  scope: string
}

export interface WorkerOption {
  id: string
  name: string
}

// Lunes..Domingo para mostrar, aunque en BD dayOfWeek sigue Date.getDay() (0=domingo).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function emptySlot(): WeeklySlotInput {
  return { startTime: "09:00", endTime: "17:00" }
}

// Índices de franjas que se solapan entre sí dentro de la misma lista.
export function overlappingIndices(slots: WeeklySlotInput[]): Set<number> {
  const bad = new Set<number>()
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) continue
      if (a.startTime < b.endTime && b.startTime < a.endTime) {
        bad.add(i)
        bad.add(j)
      }
    }
  }
  return bad
}

/* --------------------------- editor de franjas --------------------------- */

export function SlotRows({
  slots,
  onChange,
}: {
  slots: WeeklySlotInput[]
  onChange: (slots: WeeklySlotInput[]) => void
}) {
  const bad = overlappingIndices(slots)

  function update(i: number, key: "startTime" | "endTime", value: string) {
    const next = slots.map((s, idx) => (idx === i ? { ...s, [key]: value } : s))
    onChange(next)
  }
  function remove(i: number) {
    onChange(slots.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...slots, emptySlot()])
  }

  return (
    <div className="space-y-1.5">
      {slots.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            type="time"
            value={s.startTime}
            onChange={(e) => update(i, "startTime", e.target.value)}
            className={cn("h-8 w-28", bad.has(i) && "border-destructive text-destructive")}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="time"
            value={s.endTime}
            onChange={(e) => update(i, "endTime", e.target.value)}
            className={cn("h-8 w-28", bad.has(i) && "border-destructive text-destructive")}
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {bad.size > 0 && (
        <p className="text-xs text-destructive">Estas franjas se solapan entre sí.</p>
      )}
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> Añadir franja
      </Button>
    </div>
  )
}

/* --------------------------- horario semanal ------------------------------ */

export function WeeklyScheduleEditor({
  initialDays,
  onSave,
  // Un día sin franjas significa algo distinto según el ámbito: el centro
  // cierra, pero una empleada simplemente libra (ese día no entra en su turno).
  emptyLabel = "Cerrado",
}: {
  initialDays: WeeklyDay[]
  onSave: (days: WeeklyDay[]) => Promise<{ ok: boolean; error?: string }>
  emptyLabel?: string
}) {
  const router = useRouter()
  const [days, setDays] = useState<WeeklyDay[]>(initialDays)
  const [loading, setLoading] = useState(false)
  const hasOverlap = days.some((d) => overlappingIndices(d.slots).size > 0)

  function setDaySlots(dayOfWeek: number, slots: WeeklySlotInput[]) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, slots } : d)))
  }

  async function handleSave() {
    setLoading(true)
    const res = await onSave(days)
    setLoading(false)
    if (res.ok) {
      toast.success("Horario guardado.")
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al guardar.")
    }
  }

  return (
    <div className="space-y-3">
      {DISPLAY_ORDER.map((dow) => {
        const day = days.find((d) => d.dayOfWeek === dow)!
        return (
          <div key={dow} className="grid grid-cols-[110px_1fr] items-start gap-3 border-b pb-3 last:border-b-0">
            <div className="pt-1 text-sm font-medium">{WEEKDAY_LABELS[dow]}</div>
            {/* Siempre vía SlotRows para que "Añadir franja" quede en el mismo
                sitio (debajo) tanto si el día tiene franjas como si está cerrado. */}
            <div className="space-y-1.5">
              {day.slots.length === 0 && <p className="pt-1 text-xs text-muted-foreground">{emptyLabel}</p>}
              <SlotRows slots={day.slots} onChange={(slots) => setDaySlots(dow, slots)} />
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-end gap-3 pt-2">
        {hasOverlap && (
          <p className="text-xs text-destructive">Corrige las franjas solapadas antes de guardar.</p>
        )}
        <Button onClick={handleSave} disabled={loading || hasOverlap}>
          {loading ? "Guardando…" : "Guardar horario"}
        </Button>
      </div>
    </div>
  )
}

/* --------------------------- ámbito: lista + detalle ----------------------- */

export type Scope = { type: "CLINIC" } | { type: "WORKER"; workerId: string; workerName: string }

export function scopeKey(scope: Scope): string {
  return scope.type === "CLINIC" ? "CLINIC" : scope.workerId
}

export function ScopeList({
  workers,
  selectedKey,
  onSelect,
}: {
  workers: (WorkerOption & { color?: string })[]
  selectedKey: string
  onSelect: (scope: Scope) => void
}) {
  return (
    <div className="w-40 shrink-0 space-y-4">
      <div className="space-y-0.5">
        <p className="px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Centro</p>
        <button
          type="button"
          onClick={() => onSelect({ type: "CLINIC" })}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
            selectedKey === "CLINIC" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-foreground/70" />
          General
        </button>
      </div>

      <div className="space-y-0.5">
        <p className="px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Empleadas</p>
        {workers.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelect({ type: "WORKER", workerId: w.id, workerName: w.name })}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
              selectedKey === w.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: w.color ?? "#3C54A4" }} />
            {w.name}
          </button>
        ))}
        {workers.length === 0 && (
          <p className="px-2.5 text-xs text-muted-foreground">Sin empleadas activas.</p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ excepciones -------------------------------- */

// dayOfWeek: 0=domingo .. 6=sábado (Date.getDay()). Duplicado a propósito de
// lib/schedule.ts: ese módulo importa Prisma y no es seguro traerlo a un
// componente cliente.
function dayOfWeekFromDateStr(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d).getDay()
}

// Lo que puede pasar un día concreto. Son excluyentes: para un ámbito y una
// fecha solo hay UN resultado, por eso el panel usa un único selector en vez
// de bloques independientes con guardados distintos.
type DayMode = "OPEN" | "CLOSED" | "HOLIDAY" | "WORK" | "OFF" | "ABSENCE"

const CLINIC_MODES: { value: DayMode; label: string }[] = [
  { value: "OPEN", label: "Abierto" },
  { value: "CLOSED", label: "Cerrado" },
  { value: "HOLIDAY", label: "Festivo" },
]
// Las ausencias (vacaciones, bajas…) NO se gestionan aquí: van en la pestaña
// "Ausencia" del propio panel, que cubre día suelto y rango. Este panel es
// solo para excepciones de horario.
const WORKER_MODES: { value: DayMode; label: string }[] = [
  { value: "WORK", label: "Trabaja" },
  { value: "OFF", label: "No trabaja" },
]

// Resuelve qué mostrar en el formulario para una fecha, por orden de
// prioridad real (el mismo que aplica lib/schedule.ts): vacaciones > excepción
// guardada > festivo > horario semanal base. Así el panel siempre abre
// reflejando lo que de verdad pasa ese día, en vez de un valor por defecto.
function resolveDateState(
  date: string,
  scope: Scope,
  rows: OverrideRow[],
  clinicWeekly: WeeklyDay[],
  workerWeekly: WeeklyDay[],
  holidays: HolidayRow[],
  leaves: LeaveRow[],
): { mode: DayMode; slots: WeeklySlotInput[]; reason: string; holidayName: string; leaveType: LeaveType } {
  const dow = dayOfWeekFromDateStr(date)
  const weekly = (scope.type === "CLINIC" ? clinicWeekly : workerWeekly).find((d) => d.dayOfWeek === dow)?.slots ?? []
  const existing = rows.find((r) => r.date === date)

  if (scope.type === "WORKER") {
    if (existing) {
      return {
        mode: existing.closed ? "OFF" : "WORK",
        slots: existing.closed ? weekly : existing.slots,
        reason: existing.reason ?? "",
        holidayName: "",
        leaveType: "VACATION",
      }
    }
    return { mode: weekly.length === 0 ? "OFF" : "WORK", slots: weekly, reason: "", holidayName: "", leaveType: "VACATION" }
  }

  const holiday = holidays.find((h) => h.date === date)
  if (existing) {
    // Una excepción explícita manda sobre el festivo (caso "reabrir un festivo").
    return {
      mode: existing.closed ? "CLOSED" : "OPEN",
      slots: existing.closed ? weekly : existing.slots,
      reason: existing.reason ?? "",
      holidayName: holiday?.name ?? "",
      leaveType: "VACATION",
    }
  }
  if (holiday) return { mode: "HOLIDAY", slots: weekly, reason: "", holidayName: holiday.name, leaveType: "VACATION" }
  return { mode: weekly.length === 0 ? "CLOSED" : "OPEN", slots: weekly, reason: "", holidayName: "", leaveType: "VACATION" }
}

// Panel de excepciones de horario de un día concreto. Un solo selector
// "¿Qué pasa este día?" y un único guardar. Las ausencias (vacaciones, bajas)
// NO se tocan aquí: si el día ya tiene una, el panel lo indica y remite a la
// pestaña "Ausencia", que es donde se crean y editan (día suelto o rango).
export function OverridesPanel({
  scope,
  clinicWeekly,
  workerWeekly,
  clinicOverrides,
  workerOverrides,
  holidays,
  leaves,
  initialDate,
  onClose,
  onManageLeave,
}: {
  scope: Scope
  clinicWeekly: WeeklyDay[]
  workerWeekly: WeeklyDay[]
  clinicOverrides: OverrideRow[]
  workerOverrides: OverrideRow[]
  holidays: HolidayRow[]
  leaves: LeaveRow[]
  initialDate?: string
  onClose?: () => void
  onManageLeave?: (leave: LeaveRow) => void
}) {
  const router = useRouter()

  const rows = (scope.type === "CLINIC" ? clinicOverrides : workerOverrides.filter((o) => o.workerId === scope.workerId))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  const resolve = (d: string) => resolveDateState(d, scope, rows, clinicWeekly, workerWeekly, holidays, leaves)
  const initialResolved = initialDate ? resolve(initialDate) : null

  const [date, setDate] = useState(initialDate ?? "")
  const [mode, setMode] = useState<DayMode>(initialResolved?.mode ?? (scope.type === "CLINIC" ? "CLOSED" : "WORK"))
  const [slots, setSlots] = useState<WeeklySlotInput[]>(initialResolved?.slots ?? [emptySlot()])
  const [reason, setReason] = useState(initialResolved?.reason ?? "")
  const [holidayName, setHolidayName] = useState(initialResolved?.holidayName ?? "")
  const [loading, setLoading] = useState(false)
  const [prefilled, setPrefilled] = useState(!!initialDate)

  const modes = scope.type === "CLINIC" ? CLINIC_MODES : WORKER_MODES
  const showSlots = mode === "OPEN" || mode === "WORK"
  const hasOverlap = showSlots && overlappingIndices(slots).size > 0

  const existingOverride = date ? rows.find((r) => r.date === date) : undefined
  const existingLeave =
    scope.type === "WORKER" && date ? leaves.find((l) => l.workerId === scope.workerId && l.date === date) : undefined
  const existingHoliday = scope.type === "CLINIC" && date ? holidays.find((h) => h.date === date) : undefined

  function handleDateChange(newDate: string) {
    setDate(newDate)
    setPrefilled(false)
    if (!newDate) return
    const r = resolve(newDate)
    setMode(r.mode)
    setSlots(r.slots.length > 0 ? r.slots : [emptySlot()])
    setReason(r.reason)
    setHolidayName(r.holidayName)
    setPrefilled(true)
  }

  async function handleSave() {
    if (!date) {
      toast.error("Elige una fecha.")
      return
    }
    if (hasOverlap) {
      toast.error("Corrige las franjas solapadas antes de guardar.")
      return
    }
    if (showSlots && slots.length === 0) {
      toast.error("Añade al menos una franja horaria.")
      return
    }
    if (mode === "HOLIDAY" && !holidayName.trim()) {
      toast.error("Indica el nombre del festivo.")
      return
    }

    setLoading(true)
    try {
      let res: { ok: boolean; error?: string }
      if (mode === "HOLIDAY") {
        // Una excepción del centro manda sobre el festivo, así que si la hay
        // se elimina para que el festivo sea realmente efectivo.
        if (existingOverride) {
          const del = await deleteClinicScheduleOverride(existingOverride.id)
          if (!del.ok) {
            toast.error(del.error ?? "Error al limpiar la excepción anterior.")
            return
          }
        }
        const fd = new FormData()
        fd.set("date", date)
        fd.set("name", holidayName.trim())
        fd.set("scope", "LOCAL")
        res = await saveHoliday(existingHoliday?.id ?? null, fd)
      } else if (scope.type === "CLINIC") {
        const closed = mode === "CLOSED"
        res = await saveClinicScheduleOverride(date, closed, closed ? [] : slots, reason || null)
      } else {
        const closed = mode === "OFF"
        res = await saveWorkerScheduleOverride(scope.workerId, date, closed, closed ? [] : slots, reason || null)
      }

      if (res.ok) {
        toast.success("Guardado.")
        if (onClose) onClose()
        router.refresh()
      } else {
        toast.error(res.error ?? "Error al guardar.")
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveHoliday() {
    if (!existingHoliday) return
    setLoading(true)
    const res = await deleteHoliday(existingHoliday.id)
    setLoading(false)
    if (res.ok) {
      toast.success("Festivo eliminado.")
      router.refresh()
    } else toast.error(res.error ?? "Error")
  }

  // Elimina la excepción de ese día: vuelve a mandar el horario base semanal
  // (o el festivo, si lo hay).
  async function handleDeleteOverride() {
    if (!existingOverride) return
    setLoading(true)
    const res = existingOverride.workerId
      ? await deleteWorkerScheduleOverride(existingOverride.id)
      : await deleteClinicScheduleOverride(existingOverride.id)
    setLoading(false)
    if (res.ok) {
      toast.success("Excepción eliminada.")
      onClose?.()
      router.refresh()
    } else toast.error(res.error ?? "Error")
  }

  return (
    <div className="min-w-0 flex-1 space-y-6">
      <Card className="overflow-hidden p-0">
        <div className={cn("flex items-start justify-between gap-3 px-6 py-5", scope.type === "CLINIC" ? "bg-accent" : "border-b")}>
          <div>
            <CardTitle className={cn(scope.type === "CLINIC" && "text-accent-foreground")}>
              {scope.type === "CLINIC" ? "Centro" : scope.workerName}
            </CardTitle>
            <CardDescription className={cn("mt-1", scope.type === "CLINIC" && "text-accent-foreground/70")}>
              Cambios de un día concreto. El horario base semanal no se toca.
            </CardDescription>
          </div>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("shrink-0", scope.type === "CLINIC" && "text-accent-foreground hover:bg-accent-foreground/10")}
              onClick={onClose}
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardContent className="space-y-4 py-6">
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} />
            {/* Con una ausencia ese día el aviso sobra: el bloque de abajo ya
                explica qué pasa y que aquí no se toca. */}
            {date && prefilled && !existingLeave && (
              <p className="text-xs text-muted-foreground">
                {existingOverride || existingHoliday
                  ? "Ya había algo guardado para este día — lo estás editando."
                  : `Según el horario base de los ${WEEKDAY_LABELS[dayOfWeekFromDateStr(date)].toLowerCase()}.`}
              </p>
            )}
          </div>

          {/* Con una ausencia ese día no hay nada que decidir aquí: la ausencia
              manda y el resto del formulario solo confundiría (mostraría el
              horario base como si la empleada trabajase). */}
          {existingLeave ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Este día es{" "}
                <span className="font-medium text-foreground">
                  {LEAVE_TYPE_META[existingLeave.type as LeaveType]?.label ?? existingLeave.type}
                </span>
                . Para cambiar su horario, quita antes la ausencia.
              </p>
              {onManageLeave && (
                <Button type="button" variant="outline" size="sm" onClick={() => onManageLeave(existingLeave)}>
                  Ver la ausencia
                </Button>
              )}
            </div>
          ) : (
            <>
          <div className="space-y-2">
            <Label>¿Qué pasa este día?</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {modes.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    mode === m.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {scope.type === "WORKER" && mode === "OFF" && (
              <p className="text-xs text-muted-foreground">
                Cambio de turno (p.ej. cambia qué día libra esa semana), sin tocar su saldo de vacaciones.
              </p>
            )}
            {scope.type === "CLINIC" && mode === "HOLIDAY" && (
              <p className="text-xs text-muted-foreground">Cierra el centro y a todas las empleadas ese día.</p>
            )}
          </div>

          {mode === "HOLIDAY" && (
            <div className="space-y-2">
              <Label>Nombre del festivo</Label>
              <Input
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="Ej. Navidad, fiesta local…"
              />
            </div>
          )}

          {showSlots && (
            <div className="space-y-2">
              <Label>Horario ese día</Label>
              <SlotRows slots={slots} onChange={setSlots} />
            </div>
          )}

          {mode !== "HOLIDAY" && (
            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. cierre anticipado, cita médica…"
              />
            </div>
          )}

          {scope.type === "CLINIC" && existingHoliday && mode !== "HOLIDAY" && (
            <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Este día es festivo ({existingHoliday.name}); al guardar se abre/cierra solo esta fecha y el festivo se
              mantiene en el calendario.{" "}
              <button type="button" onClick={handleRemoveHoliday} className="font-medium text-primary hover:underline">
                Quitar festivo
              </button>
            </p>
          )}

          {hasOverlap && <p className="text-xs text-destructive">Corrige las franjas solapadas antes de guardar.</p>}

          <div className="flex items-center justify-between gap-2">
            {existingOverride ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={loading}
                onClick={handleDeleteOverride}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={handleSave} disabled={loading || hasOverlap}>
              {loading ? "Guardando…" : "Guardar"}
            </Button>
          </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Filtro de rango de fechas, compartido por las tablas de excepciones y de
// ausencias para que se vean y se comporten igual.
export function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        className="h-8 w-36 text-xs"
        aria-label="Desde"
      />
      <span className="text-xs text-muted-foreground">–</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onTo(e.target.value)}
        className="h-8 w-36 text-xs"
        aria-label="Hasta"
      />
      {(from || to) && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Quitar filtro de fechas"
          onClick={() => { onFrom(""); onTo("") }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

// Listado de excepciones (centro + todas las empleadas juntas), con filtros
// por ámbito, periodo y rango de fechas. Va en su propia pestaña en vez de
// dentro del panel lateral, que queda demasiado estrecho para una tabla.
// Es solo consulta: editar y borrar viven en "Esta semana", que es el único
// sitio donde se gestionan horarios y ausencias. El ojo lleva allí.
export function OverridesHistoryTable({
  workers,
  clinicOverrides,
  workerOverrides,
  today,
  onView,
}: {
  workers: (WorkerOption & { color?: string })[]
  clinicOverrides: OverrideRow[]
  workerOverrides: OverrideRow[]
  today: string
  onView: (scope: Scope, date: string) => void
}) {
  const router = useRouter()
  // "all" = todos los ámbitos · "CLINIC" = centro · <workerId> = esa empleada.
  const [scopeFilter, setScopeFilter] = useState("all")
  const [periodFilter, setPeriodFilter] = useState<"upcoming" | "past" | "all">("upcoming")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  const all = [...clinicOverrides, ...workerOverrides]
  const rows = all
    .filter((r) => {
      if (scopeFilter === "all") return true
      if (scopeFilter === "CLINIC") return r.workerId === null
      return r.workerId === scopeFilter
    })
    .filter((r) => {
      if (periodFilter === "all") return true
      return periodFilter === "upcoming" ? r.date >= today : r.date < today
    })
    .filter((r) => (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate))
    // Próximas en orden ascendente (lo siguiente que llega, primero); pasadas
    // en descendente (lo más reciente, primero).
    .sort((a, b) => (periodFilter === "past" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Excepciones puntuales</p>
          <p className="text-xs text-muted-foreground">
            {rows.length} de {all.length} · consulta; para cambiarlas, ve a la semana
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Quién" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Centro y empleadas</SelectItem>
              <SelectItem value="CLINIC">Centro</SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Próximas</SelectItem>
              <SelectItem value="past">Pasadas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <DateRangeFilter from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Quién</TableHead>
            <TableHead>Horario</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">
              <span className="flex justify-end text-xs font-normal text-muted-foreground">
                <span className="flex w-16 items-center justify-center gap-1"><Eye className="h-3.5 w-3.5" /> Ver</span>
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.date}</TableCell>
              <TableCell>{r.workerId ? r.workerName : "Centro"}</TableCell>
              <TableCell>
                {r.closed ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    {r.workerId ? "No trabaja" : "Cerrado"}
                  </Badge>
                ) : (
                  r.slots.map((s) => `${s.startTime}–${s.endTime}`).join(", ")
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.reason ?? "—"}</TableCell>
              <TableCell className="text-right">
                <span className="flex justify-end">
                  <span className="flex w-16 justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Ver en Esta semana"
                      onClick={() =>
                        onView(
                          r.workerId ? { type: "WORKER", workerId: r.workerId, workerName: r.workerName! } : { type: "CLINIC" },
                          r.date,
                        )
                      }
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </span>
                </span>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {all.length === 0 ? "Sin excepciones guardadas." : "Ninguna excepción coincide con los filtros."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

/* -------------------------------- festivos ---------------------------------- */

const SCOPE_ALIASES: Record<string, HolidayScope> = {
  NACIONAL: "NATIONAL",
  NATIONAL: "NATIONAL",
  AUTONOMICO: "REGIONAL",
  REGIONAL: "REGIONAL",
  LOCAL: "LOCAL",
}

type ParsedHolidayLine =
  | { ok: true; raw: string; date: string; name: string; scope: HolidayScope }
  | { ok: false; raw: string; error: string }

// Formato de una línea, todo separado por comas: "DD/MM, Nombre" o
// "DD/MM, Nombre, Ámbito". El año se da una sola vez para todo el bloque
// pegado, no por línea.
function parseBulkHolidayLine(line: string, year: number): ParsedHolidayLine {
  const parts = line.split(",").map((p) => p.trim())
  if (parts.length < 2) {
    return { ok: false, raw: line, error: "Formato esperado: DD/MM, Nombre, Ámbito" }
  }
  const [dateStr, name, scopeRaw] = parts
  const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!dateMatch) return { ok: false, raw: line, error: "Fecha esperada como DD/MM." }
  const day = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  if (!name) return { ok: false, raw: line, error: "Falta el nombre del festivo." }

  let scope: HolidayScope = "LOCAL"
  if (scopeRaw) {
    const candidate = scopeRaw.toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    if (!SCOPE_ALIASES[candidate]) {
      return { ok: false, raw: line, error: `Ámbito no reconocido: "${scopeRaw}" (usa Local, Nacional o Autonómico).` }
    }
    scope = SCOPE_ALIASES[candidate]
  }

  const test = new Date(year, month - 1, day)
  if (test.getMonth() !== month - 1 || test.getDate() !== day) {
    return { ok: false, raw: line, error: "Fecha inválida." }
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return { ok: true, raw: line, date, name, scope }
}

function BulkImportDialog({
  open,
  onOpenChange,
  defaultYear,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultYear: number
}) {
  const router = useRouter()
  const [year, setYear] = useState(defaultYear)
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  const parsed = lines.map((l) => parseBulkHolidayLine(l, year))
  const validEntries = parsed.filter((p): p is Extract<ParsedHolidayLine, { ok: true }> => p.ok)
  const errorCount = parsed.length - validEntries.length

  async function handleImport() {
    if (validEntries.length === 0) return
    setLoading(true)
    const res = await bulkImportHolidays(validEntries.map(({ date, name, scope }) => ({ date, name, scope })))
    setLoading(false)
    if (res.ok) {
      const [created, updated] = (res.id ?? "0|0").split("|")
      toast.success(`${created} festivo(s) creados, ${updated} actualizados.`)
      setText("")
      onOpenChange(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al importar.")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar festivos</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-year">Año</Label>
            <Input
              id="bulk-year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || defaultYear)}
              className="w-28"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-text">
              Un festivo por línea: DD/MM, Nombre_Festivo, Ámbito (Local/Nacional/Autonómico)
            </Label>
            <Textarea
              id="bulk-text"
              rows={8}
              placeholder={"01/01, Año Nuevo, Nacional\n24/06, San Juan, Local\n08/09, Virgen de los Llanos, Local"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          {parsed.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
              {parsed.map((p, i) =>
                p.ok ? (
                  <div key={i}>
                    ✓ {p.date} — {p.name}{" "}
                    <span className="text-muted-foreground">({HOLIDAY_SCOPE_META[p.scope].label})</span>
                  </div>
                ) : (
                  <div key={i} className="text-destructive">
                    ✗ "{p.raw}" — {p.error}
                  </div>
                ),
              )}
            </div>
          )}
          {errorCount > 0 && (
            <p className="text-xs text-destructive">{errorCount} línea(s) con error se ignorarán al importar.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleImport} disabled={loading || validEntries.length === 0}>
            {loading ? "Importando…" : `Importar ${validEntries.length || ""} festivo(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const WEEKDAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"]

// Mini-calendario de un mes. Clic en un día festivo abre su edición; clic en
// cualquier otro día abre el alta con esa fecha ya puesta.
function MonthMiniCalendar({
  year,
  month,
  holidaysByDate,
  onEdit,
  onCreate,
}: {
  year: number
  month: number
  holidaysByDate: Map<string, HolidayRow>
  onEdit: (h: HolidayRow) => void
  onCreate: (date: string) => void
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // 0=lunes .. 6=domingo
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="rounded-lg border p-2">
      <p className="mb-1.5 text-center text-xs font-medium text-foreground">{MONTH_LABELS[month]}</p>
      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {WEEKDAY_INITIALS.map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const holiday = holidaysByDate.get(dateStr)
          return (
            <div key={i} className="flex justify-center">
              <button
                type="button"
                onClick={() => (holiday ? onEdit(holiday) : onCreate(dateStr))}
                title={holiday ? holiday.name : "Marcar como festivo"}
                className={cn(
                  "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[10px]",
                  holiday
                    ? "bg-primary font-medium text-primary-foreground hover:opacity-90"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {day}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function HolidaysTab({ holidays }: { holidays: HolidayRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<HolidayRow | null>(null)
  const [scope, setScope] = useState<HolidayScope>("LOCAL")
  const [loading, setLoading] = useState(false)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  // Fecha preseleccionada al crear desde el calendario (clic en un día).
  const [createDate, setCreateDate] = useState<string | null>(null)

  function openCreate(date: string | null) {
    setEditing(null)
    setScope("LOCAL")
    setCreateDate(date)
    setOpen(true)
  }

  const years = Array.from(
    new Set([...holidays.map((h) => Number(h.date.slice(0, 4))), currentYear, currentYear + 1]),
  ).sort((a, b) => a - b)
  const yearHolidays = holidays
    .filter((h) => h.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date))
  const holidaysByDate = new Map(yearHolidays.map((h) => [h.date, h]))

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("scope", scope)
    setLoading(true)
    const res = await saveHoliday(editing?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Festivo guardado.")
      setOpen(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  async function onDelete(id: string) {
    const res = await deleteHoliday(id)
    if (res.ok) {
      toast.success("Festivo eliminado.")
      router.refresh()
    } else toast.error(res.error ?? "Error")
  }

  async function onCopyNextYear() {
    const targetYear = year + 1
    const res = await copyFixedHolidaysToYear(targetYear)
    if (res.ok) {
      toast.success(`Festivos fijos de ${targetYear} copiados (${res.id ?? 0} nuevos). Revisa Semana Santa y locales.`)
      setYear(targetYear)
      router.refresh()
    } else toast.error(res.error ?? "Error")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Un festivo cierra el centro por defecto, salvo excepción puntual.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onCopyNextYear}>
            <CalendarOff className="mr-2 h-4 w-4" /> Copiar fijos a {year + 1}
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar festivos
          </Button>
          <Button onClick={() => openCreate(null)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo festivo
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="w-14 text-center text-sm font-medium">{year}</span>
        <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-sm text-muted-foreground">{yearHolidays.length} festivo(s)</span>
        {years.length > 2 && (
          <div className="ml-auto flex flex-wrap gap-1">
            {years.map((y) => (
              <Button
                key={y}
                variant={y === year ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setYear(y)}
              >
                {y}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthMiniCalendar
            key={m}
            year={year}
            month={m}
            holidaysByDate={holidaysByDate}
            onEdit={(h) => { setEditing(h); setCreateDate(null); setScope(h.scope as HolidayScope); setOpen(true) }}
            onCreate={openCreate}
          />
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar festivo" : "Nuevo festivo"}</DialogTitle>
          </DialogHeader>
          <form key={editing?.id ?? createDate ?? "new"} onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={editing?.date ?? createDate ?? `${year}-01-01`}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="space-y-2">
              <Label>Ámbito</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as HolidayScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(HOLIDAY_SCOPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="sm:justify-between">
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { onDelete(editing.id); setOpen(false) }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </Button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultYear={year} />
    </div>
  )
}


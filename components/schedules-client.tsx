"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, CalendarOff, Upload, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
  type WeeklySlotInput,
} from "@/lib/actions"
import { WEEKDAY_LABELS, HOLIDAY_SCOPE_META, type HolidayScope } from "@/lib/enums"
import { cn } from "@/lib/utils"

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
}: {
  initialDays: WeeklyDay[]
  onSave: (days: WeeklyDay[]) => Promise<{ ok: boolean; error?: string }>
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
            {day.slots.length === 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Cerrado</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDaySlots(dow, [emptySlot()])}
                >
                  <Plus className="mr-1 h-3 w-3" /> Añadir franja
                </Button>
              </div>
            ) : (
              <SlotRows slots={day.slots} onChange={(slots) => setDaySlots(dow, slots)} />
            )}
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

// Cerrar el día completo aquí es válido tanto para el centro como para una
// empleada: representa que ese día su turno cambia (p.ej. intercambia el día
// libre de la semana), no que esté ausente. Una ausencia real (vacaciones o
// asuntos propios, con saldo) se gestiona siempre desde Vacaciones — nunca
// desde aquí, para no descontar saldo por algo que no lo es.
export function OverridesPanel({
  scope,
  clinicWeekly,
  workerWeekly,
  clinicOverrides,
  workerOverrides,
  onGoToVacations,
}: {
  scope: Scope
  clinicWeekly: WeeklyDay[]
  workerWeekly: WeeklyDay[]
  clinicOverrides: OverrideRow[]
  workerOverrides: OverrideRow[]
  onGoToVacations: () => void
}) {
  const router = useRouter()
  const [date, setDate] = useState("")
  const [closed, setClosed] = useState(scope.type === "CLINIC")
  const [slots, setSlots] = useState<WeeklySlotInput[]>(scope.type === "CLINIC" ? [] : [emptySlot()])
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const hasOverlap = !closed && overlappingIndices(slots).size > 0

  const rows = (scope.type === "CLINIC" ? clinicOverrides : workerOverrides.filter((o) => o.workerId === scope.workerId))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  // Al elegir una fecha, carga lo que ya hay ese día: la excepción existente
  // si ya se había guardado una (para editarla en vez de pisarla a ciegas), o
  // si no, el horario semanal normal de ese día de la semana (para partir de
  // lo real y solo tocar lo que cambia, no de una franja genérica).
  function handleDateChange(newDate: string) {
    setDate(newDate)
    setPrefilled(false)
    if (!newDate) return
    const existing = rows.find((r) => r.date === newDate)
    if (existing) {
      setClosed(existing.closed)
      setSlots(existing.closed ? [] : existing.slots)
      setReason(existing.reason ?? "")
      setPrefilled(true)
      return
    }
    const dow = dayOfWeekFromDateStr(newDate)
    const weekly = (scope.type === "CLINIC" ? clinicWeekly : workerWeekly).find((d) => d.dayOfWeek === dow)?.slots ?? []
    setClosed(weekly.length === 0)
    setSlots(weekly)
    setReason("")
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
    if (!closed && slots.length === 0) {
      toast.error("Añade al menos una franja horaria.")
      return
    }
    setLoading(true)
    const res =
      scope.type === "CLINIC"
        ? await saveClinicScheduleOverride(date, closed, closed ? [] : slots, reason || null)
        : await saveWorkerScheduleOverride(scope.workerId, date, closed, closed ? [] : slots, reason || null)
    setLoading(false)
    if (res.ok) {
      toast.success("Excepción guardada.")
      setDate("")
      setClosed(scope.type === "CLINIC")
      setSlots(scope.type === "CLINIC" ? [] : [emptySlot()])
      setReason("")
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al guardar.")
    }
  }

  async function handleDelete(row: OverrideRow) {
    const res = row.workerId ? await deleteWorkerScheduleOverride(row.id) : await deleteClinicScheduleOverride(row.id)
    if (res.ok) {
      toast.success("Excepción eliminada.")
      router.refresh()
    } else toast.error(res.error ?? "Error")
  }

  return (
    <div className="min-w-0 flex-1 space-y-6">
      <Card className="overflow-hidden p-0">
        <div className={cn("px-6 py-5", scope.type === "CLINIC" ? "bg-accent" : "border-b")}>
          <CardTitle className={cn(scope.type === "CLINIC" && "text-accent-foreground")}>
            Nueva excepción · {scope.type === "CLINIC" ? "Centro" : scope.workerName}
          </CardTitle>
          <CardDescription className={cn("mt-1", scope.type === "CLINIC" && "text-accent-foreground/70")}>
            {scope.type === "CLINIC"
              ? "Sobrescribe el horario del centro un día concreto, sin alterar el horario semanal por defecto."
              : "Cambia las franjas de esta empleada un día concreto, sin alterar su horario semanal por defecto."}
          </CardDescription>
        </div>
        <CardContent className="space-y-4 py-6">
          <div className="max-w-xs space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} />
            {date && prefilled && (
              <p className="text-xs text-muted-foreground">
                {rows.some((r) => r.date === date)
                  ? "Ya había una excepción guardada para este día — la estás editando."
                  : `Horario habitual de los ${WEEKDAY_LABELS[dayOfWeekFromDateStr(date)].toLowerCase()}. Edítalo para crear la excepción.`}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>{scope.type === "CLINIC" ? "Centro cerrado ese día" : "No trabaja ese día"}</Label>
              <p className="text-xs text-muted-foreground">
                {scope.type === "CLINIC"
                  ? "Cierre completo (festivo, evento, etc)."
                  : "Cambio de turno (p.ej. cambia qué día libra esa semana), no una ausencia."}
              </p>
            </div>
            <Switch checked={closed} onCheckedChange={(v) => { setClosed(v); if (v) setSlots([]) }} />
          </div>

          {scope.type === "WORKER" && (
            <p className="text-xs text-muted-foreground">
              ¿Es una ausencia real (vacaciones o asuntos propios)? Eso descuenta saldo, así que usa{" "}
              <button type="button" onClick={onGoToVacations} className="font-medium text-primary hover:underline">
                Vacaciones
              </button>{" "}
              en vez de esto.
            </p>
          )}

          {!closed && (
            <div className="space-y-2">
              <Label>Horario ese día</Label>
              {slots.length === 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setSlots([emptySlot()])}>
                  <Plus className="mr-1 h-3 w-3" /> Añadir franja
                </Button>
              ) : (
                <SlotRows slots={slots} onChange={setSlots} />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. cierre anticipado, cita médica…" />
          </div>

          <div className="flex items-center justify-end gap-3">
            {hasOverlap && (
              <p className="text-xs text-destructive">Corrige las franjas solapadas antes de guardar.</p>
            )}
            <Button onClick={handleSave} disabled={loading || hasOverlap}>
              {loading ? "Guardando…" : "Guardar excepción"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Eliminar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.date}</TableCell>
                <TableCell>
                  {r.closed ? (
                    <Badge variant="outline" className="text-muted-foreground">Cerrado</Badge>
                  ) : (
                    r.slots.map((s) => `${s.startTime}–${s.endTime}`).join(", ")
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.reason ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Sin excepciones próximas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
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

export function HolidaysTab({ holidays }: { holidays: HolidayRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<HolidayRow | null>(null)
  const [scope, setScope] = useState<HolidayScope>("LOCAL")
  const [loading, setLoading] = useState(false)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const years = Array.from(
    new Set([...holidays.map((h) => Number(h.date.slice(0, 4))), currentYear, currentYear + 1]),
  ).sort((a, b) => a - b)
  const yearHolidays = holidays
    .filter((h) => h.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date))

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
          <Button onClick={() => { setEditing(null); setScope("LOCAL"); setOpen(true) }}>
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

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Ámbito</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {yearHolidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.date}</TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{HOLIDAY_SCOPE_META[h.scope as HolidayScope]?.label ?? h.scope}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditing(h); setScope(h.scope as HolidayScope); setOpen(true) }}
                    >
                      Editar
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {yearHolidays.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Sin festivos cargados en {year}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar festivo" : "Nuevo festivo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha</Label>
              <Input id="date" name="date" type="date" defaultValue={editing?.date ?? `${year}-01-01`} required />
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultYear={year} />
    </div>
  )
}


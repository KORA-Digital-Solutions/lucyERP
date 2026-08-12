"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, CalendarOff, Upload, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  saveClinicWeeklySchedule,
  saveWorkerWeeklySchedule,
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

function WeeklyScheduleEditor({
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

/* ------------------------------ excepciones -------------------------------- */

export function OverridesTab({
  workers,
  clinicOverrides,
  workerOverrides,
}: {
  workers: WorkerOption[]
  clinicOverrides: OverrideRow[]
  workerOverrides: OverrideRow[]
}) {
  const router = useRouter()
  const [scope, setScope] = useState<"CLINIC" | "WORKER">("CLINIC")
  const [workerId, setWorkerId] = useState<string>(workers[0]?.id ?? "")
  const [date, setDate] = useState("")
  const [closed, setClosed] = useState(true)
  const [slots, setSlots] = useState<WeeklySlotInput[]>([])
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const hasOverlap = !closed && overlappingIndices(slots).size > 0

  const all = [...clinicOverrides, ...workerOverrides].sort((a, b) => a.date.localeCompare(b.date))

  async function handleSave() {
    if (!date) {
      toast.error("Elige una fecha.")
      return
    }
    if (hasOverlap) {
      toast.error("Corrige las franjas solapadas antes de guardar.")
      return
    }
    setLoading(true)
    const res =
      scope === "CLINIC"
        ? await saveClinicScheduleOverride(date, closed, closed ? [] : slots, reason || null)
        : await saveWorkerScheduleOverride(workerId, date, closed, closed ? [] : slots, reason || null)
    setLoading(false)
    if (res.ok) {
      toast.success("Excepción guardada.")
      setDate("")
      setSlots([])
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nueva excepción puntual</CardTitle>
          <CardDescription>
            Sobrescribe el horario base de un día concreto, sin alterar el horario semanal por defecto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Ámbito</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "CLINIC" | "WORKER")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLINIC">Centro</SelectItem>
                  <SelectItem value="WORKER">Empleada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "WORKER" && (
              <div className="space-y-2">
                <Label>Empleada</Label>
                <Select value={workerId} onValueChange={setWorkerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>No trabaja / cerrado ese día</Label>
              <p className="text-xs text-muted-foreground">
                {scope === "CLINIC" ? "El centro cierra completamente." : "La empleada no genera huecos ese día."}
              </p>
            </div>
            <Switch checked={closed} onCheckedChange={(v) => { setClosed(v); if (v) setSlots([]) }} />
          </div>

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
              <TableHead>Ámbito</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Eliminar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {all.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.workerId ? r.workerName : "Centro"}</TableCell>
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
            {all.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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

/* ------------------------------ horario semanal (secciones) ------------------- */

export function ClinicWeeklyTab({ clinicWeekly }: { clinicWeekly: WeeklyDay[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario semanal del centro</CardTitle>
        <CardDescription>Apertura/cierre por día. Admite horario partido (varias franjas por día).</CardDescription>
      </CardHeader>
      <CardContent>
        <WeeklyScheduleEditor initialDays={clinicWeekly} onSave={saveClinicWeeklySchedule} />
      </CardContent>
    </Card>
  )
}

export function WorkerWeeklyTab({
  workers,
  workerWeeklyByWorker,
}: {
  workers: WorkerOption[]
  workerWeeklyByWorker: Record<string, WeeklyDay[]>
}) {
  const [selectedWorkerId, setSelectedWorkerId] = useState(workers[0]?.id ?? "")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario semanal por empleada</CardTitle>
        <CardDescription>Días y franjas en las que trabaja cada empleada según su contrato.</CardDescription>
        <div className="pt-2">
          <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Seleccionar empleada" />
            </SelectTrigger>
            <SelectContent>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {selectedWorkerId ? (
          <WeeklyScheduleEditor
            key={selectedWorkerId}
            initialDays={workerWeeklyByWorker[selectedWorkerId] ?? []}
            onSave={(days) => saveWorkerWeeklySchedule(selectedWorkerId, days)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No hay empleadas activas.</p>
        )}
      </CardContent>
    </Card>
  )
}

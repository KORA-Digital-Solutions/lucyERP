"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Eye, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveLeaveBalance, addWorkerLeaveRange, deleteWorkerLeave } from "@/lib/actions"
import { LEAVE_TYPE_META, type LeaveType } from "@/lib/enums"
import { DateRangeFilter, ConfirmDeleteDialog, startOfWeek } from "@/components/schedules-client"

export interface BalanceRow {
  workerId: string
  workerName: string
  vacationTotal: number
  vacationUsed: number
  personalTotal: number
  personalUsed: number
}

export interface LeaveRow {
  id: string
  workerId: string
  workerName: string
  date: string
  type: string
  notes: string | null
}

interface WorkerOption {
  id: string
  name: string
  color?: string
}

function BalanceDialog({
  open,
  onOpenChange,
  row,
  year,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  row: BalanceRow | null
  year: number
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!row) return
    const fd = new FormData(e.currentTarget)
    const vacationDaysTotal = Number(fd.get("vacationDaysTotal") || 0)
    const personalDaysTotal = Number(fd.get("personalDaysTotal") || 0)
    setLoading(true)
    const res = await saveLeaveBalance(row.workerId, year, vacationDaysTotal, personalDaysTotal)
    setLoading(false)
    if (res.ok) {
      toast.success("Saldo actualizado.")
      onOpenChange(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Saldo anual {year} — {row?.workerName}</DialogTitle>
        </DialogHeader>
        {row && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vacationDaysTotal">Días de vacaciones</Label>
                <Input id="vacationDaysTotal" name="vacationDaysTotal" type="number" min={0} step={0.5} defaultValue={row.vacationTotal} />
                <p className="text-xs text-muted-foreground">Usados: {row.vacationUsed}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="personalDaysTotal">Días de asuntos propios</Label>
                <Input id="personalDaysTotal" name="personalDaysTotal" type="number" min={0} step={0.5} defaultValue={row.personalTotal} />
                <p className="text-xs text-muted-foreground">Usados: {row.personalUsed}</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Resumen de saldos anuales en tarjetas, debajo de la cuadrícula semanal.
// Solo cuentan los tipos con cupo (vacaciones y asuntos propios): las bajas no
// consumen días, así que no tienen barra de saldo.
export function BalanceCards({
  year,
  balances,
  workers,
}: {
  year: number
  balances: BalanceRow[]
  workers: WorkerOption[]
}) {
  const [dialogRow, setDialogRow] = useState<BalanceRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const colorByWorker = new Map(workers.map((w) => [w.id, w.color]))

  if (balances.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saldos {year}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {balances.map((r) => {
          const pct = r.vacationTotal > 0 ? Math.min(Math.round((r.vacationUsed / r.vacationTotal) * 100), 100) : 0
          return (
            <div key={r.workerId} className="rounded-xl bg-muted/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorByWorker.get(r.workerId) ?? "#3C54A4" }}
                />
                <span className="text-sm font-medium">{r.workerName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7"
                  title="Editar saldo anual"
                  onClick={() => { setDialogRow(r); setDialogOpen(true) }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Vacaciones</p>
              <p className="text-2xl font-medium leading-tight">
                {r.vacationUsed} <span className="text-sm font-normal text-muted-foreground">/ {r.vacationTotal}</span>
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: LEAVE_TYPE_META.VACATION.color }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Asuntos propios <span className="font-medium text-foreground">{r.personalUsed} / {r.personalTotal}</span>
              </p>
            </div>
          )
        })}
      </div>
      <BalanceDialog open={dialogOpen} onOpenChange={setDialogOpen} row={dialogRow} year={year} />
    </div>
  )
}

// Una ausencia continua: varios WorkerLeave del mismo tipo en días seguidos.
// Se guarda la lista de ids para poder borrar/editar el bloque entero.
export interface LeaveGroup {
  workerId: string
  workerName: string
  type: string
  startDate: string
  endDate: string
  notes: string | null
  ids: string[]
  days: number
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

// ¿`b` es el siguiente día laborable después de `a`? Sirve para no partir un
// rango de vacaciones solo porque en medio cayó un fin de semana o un festivo
// (que addWorkerLeaveRange no llega a crear como día de ausencia).
function isNextWorkingDay(a: string, b: string, holidays: Set<string>): boolean {
  const cur = parseDate(a)
  for (let i = 0; i < 10; i++) {
    cur.setDate(cur.getDate() + 1)
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
    if (iso === b) return true
    const dow = cur.getDay()
    // Un día laborable y no festivo sin ausencia sí corta el rango.
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) return false
  }
  return false
}

export function groupLeaves(leaves: LeaveRow[], holidayDates: string[] = []): LeaveGroup[] {
  const holidays = new Set(holidayDates)
  const sorted = [...leaves].sort(
    (a, b) => a.workerId.localeCompare(b.workerId) || a.type.localeCompare(b.type) || a.date.localeCompare(b.date),
  )
  const groups: LeaveGroup[] = []
  for (const l of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.workerId === l.workerId && last.type === l.type && isNextWorkingDay(last.endDate, l.date, holidays)) {
      last.endDate = l.date
      last.ids.push(l.id)
      last.days++
      continue
    }
    groups.push({
      workerId: l.workerId,
      workerName: l.workerName,
      type: l.type,
      startDate: l.date,
      endDate: l.date,
      notes: l.notes,
      ids: [l.id],
      days: 1,
    })
  }
  return groups
}

// Formulario de ausencias (un día o un rango) pensado para el panel lateral,
// misma ranura que el detalle de un día de la cuadrícula. Con `editing` sirve
// también para modificar una ausencia ya creada: borra los días anteriores y
// vuelve a crearlos con los datos nuevos.
export function LeaveRangeForm({
  workers,
  defaultWorkerId,
  defaultDate,
  editing,
  onClose,
}: {
  workers: WorkerOption[]
  defaultWorkerId?: string
  defaultDate?: string
  editing?: LeaveGroup
  onClose?: () => void
}) {
  const router = useRouter()
  const [workerId, setWorkerId] = useState(editing?.workerId ?? defaultWorkerId ?? workers[0]?.id ?? "")
  const [startDate, setStartDate] = useState(editing?.startDate ?? defaultDate ?? "")
  const [endDate, setEndDate] = useState(editing && editing.endDate !== editing.startDate ? editing.endDate : "")
  const [type, setType] = useState<LeaveType>((editing?.type as LeaveType) ?? "VACATION")
  const [notes, setNotes] = useState(editing?.notes ?? "")
  const [loading, setLoading] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const meta = LEAVE_TYPE_META[type]

  async function handleSubmit() {
    if (!workerId || !startDate) {
      toast.error("Elige empleada y fecha.")
      return
    }
    setLoading(true)
    // Al editar hay que liberar antes los días antiguos: addWorkerLeaveRange
    // rechaza fechas que ya tienen una ausencia asignada.
    if (editing) {
      const dels = await Promise.all(editing.ids.map((id) => deleteWorkerLeave(id)))
      const failed = dels.find((d) => !d.ok)
      if (failed) {
        setLoading(false)
        toast.error(failed.error ?? "No se pudo actualizar la ausencia.")
        return
      }
    }
    const res = await addWorkerLeaveRange(workerId, startDate, endDate || startDate, type, notes || null)
    setLoading(false)
    if (res.ok) {
      const parts = [`${res.assignedCount} día(s) asignado(s)`]
      if (res.skippedWeekendCount) parts.push(`${res.skippedWeekendCount} de fin de semana omitido(s)`)
      if (res.skippedHolidayCount) parts.push(`${res.skippedHolidayCount} festivo(s) omitido(s)`)
      toast.success(parts.join(", ") + ".")
      if (onClose) onClose()
      else {
        setStartDate("")
        setEndDate("")
        setNotes("")
      }
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  async function handleDelete() {
    if (!editing) return
    setLoading(true)
    const dels = await Promise.all(editing.ids.map((id) => deleteWorkerLeave(id)))
    setLoading(false)
    const failed = dels.find((d) => !d.ok)
    if (failed) {
      toast.error(failed.error ?? "Error al eliminar.")
      return
    }
    toast.success("Ausencia eliminada.")
    onClose?.()
    router.refresh()
  }

  // Sin tarjeta ni cabecera propias: vive dentro del panel lateral de
  // Horarios, que ya pone título, subtítulo y cerrar (igual que Clientes).
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Empleada</Label>
        <Select value={workerId} onValueChange={setWorkerId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar" />
          </SelectTrigger>
          <SelectContent>
            {workers.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tipo de ausencia</Label>
        <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LEAVE_TYPE_META) as LeaveType[]).map((k) => (
              <SelectItem key={k} value={k}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LEAVE_TYPE_META[k].color }} />
                  {LEAVE_TYPE_META[k].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {meta.quota ? "Descuenta del saldo anual." : "No descuenta saldo anual."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Desde</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Hasta</Label>
          <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Deja "Hasta" vacío para un solo día. Los fines de semana y festivos del rango se omiten.
      </p>

      <div className="space-y-2">
        <Label>Notas (opcional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        {editing ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={loading}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Guardando…" : editing ? "Guardar" : "Asignar"}
        </Button>
      </div>

      {editing && (
        <ConfirmDeleteDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title="¿Eliminar la ausencia?"
          description={
            <>
              Se eliminarán los {editing.days} día(s) de{" "}
              <strong>{LEAVE_TYPE_META[editing.type as LeaveType]?.label ?? editing.type}</strong> de{" "}
              <strong>{editing.workerName}</strong>
              {editing.startDate === editing.endDate
                ? ` del ${editing.startDate}`
                : ` del ${editing.startDate} al ${editing.endDate}`}
              {LEAVE_TYPE_META[editing.type as LeaveType]?.quota ? ", y volverán a su saldo anual" : ""}. Esta acción no
              se puede deshacer.
            </>
          }
          confirmLabel="Eliminar ausencia"
          onConfirm={() => {
            setConfirmingDelete(false)
            handleDelete()
          }}
        />
      )}
    </div>
  )
}

// Listado de ausencias agrupadas por rango, con filtros. Es solo consulta:
// crear, editar y eliminar viven en "Esta semana", que es el único sitio
// donde se gestiona el día a día. El ojo lleva allí, a la semana en la que
// empieza la ausencia y con el panel ya abierto sobre ella.
export function AbsencesTable({
  workers,
  leaves,
  holidayDates,
  today,
  onView,
}: {
  workers: WorkerOption[]
  leaves: LeaveRow[]
  holidayDates: string[]
  today: string
  onView: (group: LeaveGroup) => void
}) {
  const [workerFilter, setWorkerFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [periodFilter, setPeriodFilter] = useState<"upcoming" | "past" | "all">("upcoming")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const weekStart = startOfWeek(today)

  const all = groupLeaves(leaves, holidayDates)
  const rows = all
    .filter((g) => workerFilter === "all" || g.workerId === workerFilter)
    .filter((g) => typeFilter === "all" || g.type === typeFilter)
    .filter((g) => {
      if (periodFilter === "all") return true
      // Se corta por el lunes de esta semana, no por hoy, para que lo que se
      // acaba de asignar desde "Esta semana" siempre salga listado aquí.
      return periodFilter === "upcoming" ? g.endDate >= weekStart : g.endDate < weekStart
    })
    // Cualquier solape con el rango filtrado cuenta, no solo las contenidas
    // enteras: una ausencia de 3 semanas debe salir al filtrar una de ellas.
    .filter((g) => (!fromDate || g.endDate >= fromDate) && (!toDate || g.startDate <= toDate))
    .sort((a, b) => (periodFilter === "past" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)))

  const hidden = all.length - rows.length
  function clearFilters() {
    setWorkerFilter("all")
    setTypeFilter("all")
    setPeriodFilter("all")
    setFromDate("")
    setToDate("")
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Ausencias</p>
          <p className="text-xs text-muted-foreground">
            {rows.length} de {all.length} · consulta; para cambiarlas, ve a la semana
          </p>
          {/* Que se filtre nunca puede ser silencioso: si no, una ausencia
              recién asignada "desaparece" y parece que no se ha guardado. */}
          {hidden > 0 && (
            <button type="button" onClick={clearFilters} className="text-xs text-primary hover:underline">
              {hidden === 1 ? "1 oculta por los filtros" : `${hidden} ocultas por los filtros`} — verlas todas
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Empleada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empleadas</SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {(Object.keys(LEAVE_TYPE_META) as LeaveType[]).map((k) => (
                <SelectItem key={k} value={k}>{LEAVE_TYPE_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Esta semana y próximas</SelectItem>
              <SelectItem value="past">Anteriores</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <DateRangeFilter from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empleada</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Desde</TableHead>
            <TableHead>Hasta</TableHead>
            <TableHead>Días</TableHead>
            <TableHead>Notas</TableHead>
            <TableHead className="text-right">
              <span className="flex justify-end text-xs font-normal text-muted-foreground">
                <span className="flex w-16 items-center justify-center gap-1"><Eye className="h-3.5 w-3.5" /> Ver</span>
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((g) => {
            const meta = LEAVE_TYPE_META[g.type as LeaveType]
            return (
              <TableRow key={g.ids[0]}>
                <TableCell className="font-medium">{g.workerName}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta?.color ?? "#888" }} />
                    {meta?.label ?? g.type}
                  </span>
                </TableCell>
                <TableCell>{g.startDate}</TableCell>
                <TableCell>{g.endDate}</TableCell>
                <TableCell>{g.days}</TableCell>
                <TableCell className="text-muted-foreground">{g.notes ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <span className="flex justify-end">
                    <span className="flex w-16 justify-center">
                      <Button variant="ghost" size="icon" title="Ver en Esta semana" onClick={() => onView(g)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                {all.length === 0 ? "Sin ausencias registradas." : "Ninguna ausencia coincide con los filtros."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

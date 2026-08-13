"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Plus, Pencil, Plane, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveLeaveBalance, addWorkerLeaveRange, deleteWorkerLeave } from "@/lib/actions"
import { LEAVE_TYPE_META, type LeaveType } from "@/lib/enums"
import { cn } from "@/lib/utils"

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
}

/* ------------------------------ vista semanal ----------------------------- */

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

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
function mondayOf(s: string): string {
  const d = parseDateStr(s)
  const dow = d.getDay() // 0 domingo .. 6 sábado
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return toDateStr(d)
}
function formatDayMonth(s: string): string {
  const [, m, d] = s.split("-")
  return `${d}/${m}`
}

const LEAVE_STYLE: Record<string, { bg: string; icon: typeof Plane }> = {
  VACATION: { bg: "#3FBF8F", icon: Plane },
  PERSONAL: { bg: "#F5A524", icon: Clock },
}

function LeaveWeekGrid({ workers, leaves }: { workers: WorkerOption[]; leaves: LeaveRow[] }) {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => mondayOf(toDateStr(new Date())))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  async function handleDeleteSegment(ids: string[]) {
    await Promise.all(ids.map((id) => deleteWorkerLeave(id)))
    toast.success(`${ids.length} día(s) eliminado(s).`)
    router.refresh()
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b p-3">
        <div>
          <h3 className="text-sm font-semibold">Vista semanal</h3>
          <p className="text-xs text-muted-foreground">Clic en un bloque para eliminarlo.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-1 text-xs font-medium text-muted-foreground">
            {formatDayMonth(days[0])} – {formatDayMonth(days[6])}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}>
          <div className="border-b border-r bg-muted/20 p-2 text-xs font-medium text-muted-foreground">Empleada</div>
          {days.map((d, i) => (
            <div
              key={d}
              className={cn(
                "border-b p-2 text-center text-xs",
                i >= 5 ? "bg-muted/40 text-muted-foreground" : "bg-muted/20 text-muted-foreground",
              )}
            >
              <div className="font-medium">{DAY_LABELS[i]}</div>
              <div>{Number(d.slice(8, 10))}</div>
            </div>
          ))}

          {workers.map((w) => {
            const rowLeaves = days.map((d) => leaves.find((l) => l.workerId === w.id && l.date === d) ?? null)
            const segments: { startIdx: number; span: number; type: string; ids: string[] }[] = []
            let i = 0
            while (i < 7) {
              const l = rowLeaves[i]
              if (!l) {
                i++
                continue
              }
              let span = 1
              const ids = [l.id]
              while (i + span < 7 && rowLeaves[i + span]?.type === l.type) {
                ids.push(rowLeaves[i + span]!.id)
                span++
              }
              segments.push({ startIdx: i, span, type: l.type, ids })
              i += span
            }
            return (
              <div key={w.id} className="contents">
                <div className="flex items-center border-r border-b p-2 text-sm font-medium">{w.name}</div>
                <div className="relative col-span-7 border-b" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {days.map((_, i2) => (
                    <div key={i2} className={cn("h-11 border-r last:border-r-0", i2 >= 5 && "bg-muted/40")} />
                  ))}
                  {segments.map((seg, si) => {
                    const meta = LEAVE_STYLE[seg.type] ?? LEAVE_STYLE.PERSONAL
                    const Icon = meta.icon
                    return (
                      <button
                        key={si}
                        type="button"
                        title={`${LEAVE_TYPE_META[seg.type as LeaveType]?.label ?? seg.type} · clic para eliminar`}
                        onClick={() => handleDeleteSegment(seg.ids)}
                        className="absolute top-1 flex h-9 items-center justify-center rounded-lg text-white shadow-sm transition hover:opacity-90"
                        style={{
                          left: `calc(${(seg.startIdx / 7) * 100}% + 4px)`,
                          width: `calc(${(seg.span / 7) * 100}% - 8px)`,
                          backgroundColor: meta.bg,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {workers.length === 0 && (
            <div className="col-span-8 py-8 text-center text-sm text-muted-foreground">No hay empleadas activas.</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 border-t p-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEAVE_STYLE.VACATION.bg }} /> Vacaciones
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEAVE_STYLE.PERSONAL.bg }} /> Asuntos propios
        </span>
      </div>
    </Card>
  )
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saldo anual {year} — {row?.workerName}</DialogTitle>
        </DialogHeader>
        {row && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vacationDaysTotal">Días de vacaciones</Label>
                <Input
                  id="vacationDaysTotal"
                  name="vacationDaysTotal"
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={row.vacationTotal}
                />
                <p className="text-xs text-muted-foreground">Usados: {row.vacationUsed}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="personalDaysTotal">Días de asuntos propios</Label>
                <Input
                  id="personalDaysTotal"
                  name="personalDaysTotal"
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={row.personalTotal}
                />
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

export function VacationsSection({
  year,
  workers,
  balances,
  leaves,
}: {
  year: number
  workers: WorkerOption[]
  balances: BalanceRow[]
  leaves: LeaveRow[]
}) {
  const router = useRouter()
  const [balanceDialogRow, setBalanceDialogRow] = useState<BalanceRow | null>(null)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)

  const [leaveWorkerId, setLeaveWorkerId] = useState(workers[0]?.id ?? "")
  const [leaveStartDate, setLeaveStartDate] = useState("")
  const [leaveEndDate, setLeaveEndDate] = useState("")
  const [leaveType, setLeaveType] = useState<LeaveType>("VACATION")
  const [leaveNotes, setLeaveNotes] = useState("")
  const [loading, setLoading] = useState(false)

  function goToYear(y: number) {
    router.push(`/horarios?tab=vacations&year=${y}`)
  }

  async function handleAddLeave() {
    if (!leaveWorkerId || !leaveStartDate) {
      toast.error("Elige empleada y fecha.")
      return
    }
    setLoading(true)
    const res = await addWorkerLeaveRange(
      leaveWorkerId,
      leaveStartDate,
      leaveEndDate || leaveStartDate,
      leaveType,
      leaveNotes || null,
    )
    setLoading(false)
    if (res.ok) {
      const parts = [`${res.assignedCount} día(s) asignado(s)`]
      if (res.skippedWeekendCount) parts.push(`${res.skippedWeekendCount} de fin de semana omitido(s)`)
      if (res.skippedHolidayCount) parts.push(`${res.skippedHolidayCount} festivo(s) omitido(s)`)
      toast.success(parts.join(", ") + ".")
      setLeaveStartDate("")
      setLeaveEndDate("")
      setLeaveNotes("")
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Saldos anuales y días libres asignados por empleada.</p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => goToYear(year - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-16 text-center text-sm font-medium">{year}</span>
          <Button variant="outline" size="icon" onClick={() => goToYear(year + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleada</TableHead>
              <TableHead>Vacaciones</TableHead>
              <TableHead>Asuntos propios</TableHead>
              <TableHead className="text-right">Editar saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.map((r) => (
              <TableRow key={r.workerId}>
                <TableCell className="font-medium">{r.workerName}</TableCell>
                <TableCell>
                  <Badge variant={r.vacationUsed >= r.vacationTotal && r.vacationTotal > 0 ? "outline" : "secondary"}>
                    {r.vacationUsed} / {r.vacationTotal}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={r.personalUsed >= r.personalTotal && r.personalTotal > 0 ? "outline" : "secondary"}>
                    {r.personalUsed} / {r.personalTotal}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setBalanceDialogRow(r); setBalanceDialogOpen(true) }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {balances.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No hay empleadas activas.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignar días libres</CardTitle>
          <CardDescription>
            Descuenta del saldo correspondiente y bloquea la agenda esos días. Los fines de semana y festivos
            dentro del rango se omiten automáticamente (no cuentan como día usado).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="space-y-2">
              <Label>Empleada</Label>
              <Select value={leaveWorkerId} onValueChange={setLeaveWorkerId}>
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
              <Label>Desde</Label>
              <Input type="date" value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={leaveEndDate}
                min={leaveStartDate || undefined}
                placeholder={leaveStartDate}
                onChange={(e) => setLeaveEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Vacío = solo el día "Desde".</p>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Input value={leaveNotes} onChange={(e) => setLeaveNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={handleAddLeave} disabled={loading}>
              <Plus className="mr-2 h-4 w-4" /> {loading ? "Guardando…" : "Asignar día(s) libre(s)"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <LeaveWeekGrid workers={workers} leaves={leaves} />

      <BalanceDialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen} row={balanceDialogRow} year={year} />
    </div>
  )
}

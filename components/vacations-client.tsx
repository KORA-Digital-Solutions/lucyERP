"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveLeaveBalance, addWorkerLeaveRange } from "@/lib/actions"
import { LEAVE_TYPE_META, type LeaveType } from "@/lib/enums"

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
}: {
  year: number
  workers: WorkerOption[]
  balances: BalanceRow[]
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
    router.push(`/horarios?year=${y}`)
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

      <BalanceDialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen} row={balanceDialogRow} year={year} />
    </div>
  )
}

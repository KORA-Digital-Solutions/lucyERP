"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Search, ClipboardList, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { normalizeSearch } from "@/lib/format"
import { deleteAppointment } from "@/lib/actions"

export interface AppointmentRow {
  id: string
  startAt: string
  durationMinutes: number
  status: string
  customerName: string
  serviceName: string
  workerName: string
  cabinName: string
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:   "Pendiente",
  CONFIRMED: "Confirmada",
  DONE:      "Realizada",
  NO_SHOW:   "No asistió",
  CANCELLED: "Cancelada",
}

// Mismos colores que STATUS_META en lib/enums.ts
const STATUS_BADGE_CLS: Record<string, string> = {
  PENDING:   "bg-[#FEF3E2] border-[#F59E0B] text-[#92400E]",
  CONFIRMED: "bg-[#E6F4EA] border-[#34A853] text-[#1E6B34]",
  DONE:      "bg-[#E5E9F7] border-[#3C54A4] text-[#274775]",
  NO_SHOW:   "bg-[#FCE8E6] border-[#EA4335] text-[#B31412]",
  CANCELLED: "bg-[#F1F2F4] border-[#9AA0A6] text-[#5F6368]",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
}

function toDateParam(iso: string) {
  return iso.slice(0, 10)
}

interface Props {
  rows: AppointmentRow[]
  defaultFrom: string
  defaultTo: string
  defaultStatus: string
}

export function AppointmentsHistoryClient({ rows, defaultFrom, defaultTo, defaultStatus }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [search, setSearch] = useState("")
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [status, setStatus] = useState(defaultStatus)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; customerName: string } | null>(null)

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteAppointment(deleteTarget.id)
    setDeleteTarget(null)
    router.refresh()
  }

  function pushParams(overrides: Partial<{ from: string; to: string; status: string }>) {
    const next = { from, to, status, ...overrides }
    const params = new URLSearchParams()
    params.set("from", next.from)
    params.set("to", next.to)
    if (next.status !== "all") params.set("status", next.status)
    startTransition(() => router.push(`/appointments?${params.toString()}`))
  }

  function handleFrom(v: string) {
    setFrom(v)
    if (v) pushParams({ from: v })
  }

  function handleTo(v: string) {
    setTo(v)
    if (v) pushParams({ to: v })
  }

  function handleStatus(v: string) {
    setStatus(v)
    pushParams({ status: v })
  }

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    if (!q) return rows
    return rows.filter((r) => {
      const haystack = normalizeSearch(r.customerName)
      const tokens = q.split(/\s+/).filter(Boolean)
      const words = haystack.split(/\s+/).filter(Boolean)
      return tokens.every((t) => words.some((w) => w.startsWith(t)))
    })
  }, [rows, search])

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Historial de citas</h1>
            <p className="text-muted-foreground text-sm">
              {rows.length} cita{rows.length !== 1 ? "s" : ""} en el período seleccionado
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-6 py-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Desde</span>
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => handleFrom(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Hasta</span>
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => handleTo(e.target.value)}
          />
        </div>

        <Select value={status} onValueChange={handleStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDING">Pendiente</SelectItem>
            <SelectItem value="CONFIRMED">Confirmada</SelectItem>
            <SelectItem value="DONE">Realizada</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Trabajador</TableHead>
                <TableHead>Cabina</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/agenda?date=${toDateParam(r.startAt)}`)}
                >
                  <TableCell className="capitalize text-muted-foreground">
                    {formatDate(r.startAt)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatTime(r.startAt)}
                  </TableCell>
                  <TableCell className="font-medium">{r.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.serviceName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.workerName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.cabinName}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.durationMinutes} min
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", STATUS_BADGE_CLS[r.status] ?? "bg-muted text-muted-foreground")}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: r.id, customerName: r.customerName })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No hay citas en el período seleccionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta cita?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará la cita de {deleteTarget?.customerName}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

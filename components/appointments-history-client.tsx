"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Search, ClipboardList } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { normalizeSearch } from "@/lib/format"

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
  DONE: "Realizada",
  CONFIRMED: "Confirmada",
  PENDING: "Pendiente",
  CANCELLED: "Cancelada",
}

const STATUS_BADGE_CLS: Record<string, string> = {
  DONE:      "bg-[#E6F4EA] text-[#1E6B34] border-[#A8D5B5]",
  CONFIRMED: "bg-[#E3F0FB] text-[#1565A3] border-[#90CAF9]",
  PENDING:   "bg-[#FFF3E0] text-[#E65100] border-[#FFCC80]",
  CANCELLED: "bg-[#F5F5F5] text-[#757575] border-[#E0E0E0]",
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
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No hay citas en el período seleccionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

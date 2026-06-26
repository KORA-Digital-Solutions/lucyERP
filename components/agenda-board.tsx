"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Plus, Filter, MessageCircle, CheckCircle2, XCircle, Clock, Send, Trash2, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
import { STATUS_META, type AppointmentStatus } from "@/lib/enums"
import { MiniCalendar } from "@/components/mini-calendar"
import {
  AppointmentPanel,
  type CustomerOption,
  type ServiceOption,
  type Option,
  type ExistingAppointment,
} from "@/components/appointment-panel"
import { setAppointmentStatus, deleteAppointment, sendReminder } from "@/lib/actions"

export interface AgendaAppointment {
  id: string
  customerId: string
  customerName: string
  serviceId: string
  serviceName: string
  workerId: string
  workerName: string
  workerColor: string
  cabinId: string
  startMinutes: number
  durationMinutes: number
  startLabel: string
  endLabel: string
  status: string
  reminderStatus: string
  notes: string | null
  date: string
  time: string
}

interface Props {
  date: string
  longDate: string
  openingMinutes: number
  closingMinutes: number
  cabins: Option[]
  workers: Option[]
  services: ServiceOption[]
  customers: CustomerOption[]
  appointments: AgendaAppointment[]
}

const HOUR_PX = 64

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + (m || 0)
}

interface SlotDraft {
  cabinId: string
  date: string
  time: string
  duration: number
}

export function AgendaBoard({
  date,
  longDate,
  openingMinutes,
  closingMinutes,
  cabins,
  workers,
  services,
  customers,
  appointments,
}: Props) {
  const router = useRouter()
  const [workerFilter, setWorkerFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<ExistingAppointment | null>(null)
  const [presetCabin, setPresetCabin] = useState<string | undefined>(undefined)
  const [presetTime, setPresetTime] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState<SlotDraft | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; customerName: string } | null>(null)

  async function quickStatusChange(apptId: string, newStatus: string) {
    await setAppointmentStatus(apptId, newStatus)
    router.refresh()
  }

  async function quickSendReminder(apptId: string) {
    await sendReminder(apptId)
    router.refresh()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteAppointment(deleteTarget.id)
    setDeleteTarget(null)
    router.refresh()
  }

  // Fin de semana del día seleccionado (vista diaria).
  const isWeekend = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number)
    const dow = new Date(y, m - 1, d).getDay() // 0 dom, 6 sáb
    return dow === 0 || dow === 6
  }, [date])

  const hours = useMemo(() => {
    const start = Math.floor(openingMinutes / 60)
    const end = Math.ceil(closingMinutes / 60)
    return Array.from({ length: Math.max(end - start, 1) }, (_, i) => start + i)
  }, [openingMinutes, closingMinutes])

  const totalHeight = hours.length * HOUR_PX

  const visible = useMemo(
    () =>
      appointments.filter(
        (a) =>
          (workerFilter === "all" || a.workerId === workerFilter) &&
          (statusFilter === "all" || a.status === statusFilter),
      ),
    [appointments, workerFilter, statusFilter],
  )

  function goToDate(offset: number) {
    const [y, m, d] = date.split("-").map(Number)
    const nd = new Date(y, m - 1, d + offset)
    const iso = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`
    router.push(`/agenda?date=${iso}`)
  }
  function goToday() {
    const t = new Date()
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
    router.push(`/agenda?date=${iso}`)
  }

  function openNew(cabinId?: string, hour?: number) {
    setEditing(null)
    setPresetCabin(cabinId)
    const t = hour !== undefined ? `${String(hour).padStart(2, "0")}:00` : "10:00"
    setPresetTime(hour !== undefined ? t : undefined)
    setDraft({ cabinId: cabinId ?? cabins[0]?.id ?? "", date, time: t, duration: 60 })
    setPanelOpen(true)
  }
  function openEdit(a: AgendaAppointment) {
    setDraft(null)
    setEditing({
      id: a.id,
      customerId: a.customerId,
      serviceId: a.serviceId,
      workerId: a.workerId,
      cabinId: a.cabinId,
      date: a.date,
      time: a.time,
      durationMinutes: a.durationMinutes,
      status: a.status,
      reminderStatus: a.reminderStatus,
      notes: a.notes,
    })
    setPanelOpen(true)
  }
  function closePanel() {
    setPanelOpen(false)
    setDraft(null)
    setEditing(null)
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
            <div className="flex items-center rounded-lg border bg-card">
              <Button variant="ghost" size="sm" onClick={() => goToDate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToday}>
                Hoy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => goToDate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <MiniCalendar
              date={date}
              longDate={longDate + (isWeekend ? " · fin de semana" : "")}
              onSelect={(iso) => router.push(`/agenda?date=${iso}`)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger className="w-44">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Trabajador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los trabajadores</SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {(Object.keys(STATUS_META) as AppointmentStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => openNew()}>
            <Plus className="mr-2 h-4 w-4" /> Nueva cita
          </Button>
        </div>
      </div>

      {/* Cuerpo: calendario + panel lateral */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          {cabins.length === 0 ? (
            <EmptyState />
          ) : (
            <Card className={cn("overflow-hidden p-0", isWeekend && "bg-[#E5E9F7]/40")}>
              <div className="flex">
                {/* Columna de horas */}
                <div className="w-16 shrink-0 border-r">
                  <div className="h-12 border-b" />
                  {hours.map((h) => (
                    <div key={h} className="border-b px-2 py-1 text-xs text-muted-foreground" style={{ height: HOUR_PX }}>
                      {String(h).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {/* Columnas por cabina */}
                <div className="flex flex-1 overflow-x-auto">
                  {cabins.map((cabin) => {
                    const cabinAppts = visible.filter((a) => a.cabinId === cabin.id)
                    return (
                      <div key={cabin.id} className="min-w-[200px] flex-1 border-r last:border-r-0">
                        <div className="flex h-12 items-center justify-center border-b bg-accent/60 px-2 text-sm font-semibold text-accent-foreground gap-1.5">
                          {cabin.name}
                          {cabin.active === false && (
                            <span className="text-xs font-normal text-muted-foreground">(Inactiva)</span>
                          )}
                        </div>
                        <div className={cn("relative", isWeekend && "bg-[#AFB9D9]/15")} style={{ height: totalHeight }}>
                          {hours.map((h) => (
                            <div
                              key={h}
                              className="cursor-pointer border-b hover:bg-accent/30"
                              style={{ height: HOUR_PX }}
                              onClick={() => cabin.active !== false && openNew(cabin.id, h)}
                            />
                          ))}

                          {/* Hueco que se está reservando (nueva cita) */}
                          {panelOpen && !editing && draft && draft.cabinId === cabin.id && draft.date === date && (
                            <div
                              className="pointer-events-none absolute left-1 right-1 z-0 flex flex-col justify-start rounded-md border-2 border-dashed border-primary bg-primary/10"
                              style={{
                                top: ((timeToMin(draft.time) - openingMinutes) / 60) * HOUR_PX,
                                height: Math.max((Math.max(draft.duration, 0) / 60) * HOUR_PX, 24),
                              }}
                            >
                              <span className="px-1.5 py-0.5 text-[11px] font-medium text-primary">
                                Nuevo · {draft.time}
                              </span>
                            </div>
                          )}

                          {cabinAppts.map((a) => {
                            const top = ((a.startMinutes - openingMinutes) / 60) * HOUR_PX
                            const height = Math.max((a.durationMinutes / 60) * HOUR_PX, 28)
                            const meta = STATUS_META[a.status as AppointmentStatus] ?? STATUS_META.PENDING
                            const reminded = ["SENT", "DELIVERED", "READ"].includes(a.reminderStatus)
                            const isCancelled = a.status === "CANCELLED"
                            return (
                              <ContextMenu key={a.id}>
                                <ContextMenuTrigger asChild>
                                  <button
                                    onClick={() => openEdit(a)}
                                    className={cn(
                                      "absolute left-1 right-1 z-10 overflow-hidden rounded-md border-l-4 p-1.5 text-left shadow-sm transition hover:shadow-md",
                                      meta.className,
                                      panelOpen && editing && editing.id !== a.id && "opacity-50",
                                      panelOpen && editing?.id === a.id &&
                                        "z-20 opacity-100 ring-2 ring-primary ring-offset-2 ring-offset-card shadow-lg",
                                    )}
                                    style={{ top, height, borderLeftColor: a.workerColor }}
                                  >
                                    <div className="flex items-baseline justify-between gap-1">
                                      <p className="truncate text-xs font-semibold">
                                        [{a.workerName}] {a.serviceName}
                                      </p>
                                      <p className="shrink-0 text-[11px] opacity-80">
                                        {a.startLabel}–{a.endLabel} · {a.durationMinutes} min
                                      </p>
                                    </div>
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="truncate text-xs">{a.customerName}</p>
                                      <div className="flex shrink-0 items-center gap-1 text-[11px]">
                                        <span className={cn("inline-block h-2 w-2 rounded-full", meta.dot)} />
                                        {meta.label}
                                        {reminded && <MessageCircle className="h-3 w-3 text-[#1E6B34]" />}
                                      </div>
                                    </div>
                                  </button>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="w-52">
                                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground truncate">
                                    {a.customerName}
                                  </div>
                                  <ContextMenuSeparator />
                                  {a.status !== "CONFIRMED" && !isCancelled && a.status !== "DONE" && (
                                    <ContextMenuItem onClick={() => quickStatusChange(a.id, "CONFIRMED")}>
                                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" /> Confirmar
                                    </ContextMenuItem>
                                  )}
                                  {a.status !== "PENDING" && !isCancelled && a.status !== "DONE" && a.status !== "NO_SHOW" && (
                                    <ContextMenuItem onClick={() => quickStatusChange(a.id, "PENDING")}>
                                      <Clock className="mr-2 h-4 w-4 text-yellow-600" /> Marcar pendiente
                                    </ContextMenuItem>
                                  )}
                                  {a.status !== "DONE" && !isCancelled && (
                                    <ContextMenuItem onClick={() => quickStatusChange(a.id, "DONE")}>
                                      <CheckCircle2 className="mr-2 h-4 w-4 text-blue-600" /> Marcar realizada
                                    </ContextMenuItem>
                                  )}
                                  {a.status !== "NO_SHOW" && !isCancelled && (
                                    <ContextMenuItem onClick={() => quickStatusChange(a.id, "NO_SHOW")}>
                                      <UserX className="mr-2 h-4 w-4 text-orange-500" /> No asistió
                                    </ContextMenuItem>
                                  )}
                                  {!isCancelled && (
                                    <ContextMenuItem onClick={() => quickStatusChange(a.id, "CANCELLED")}>
                                      <XCircle className="mr-2 h-4 w-4 text-red-500" /> Cancelar cita
                                    </ContextMenuItem>
                                  )}
                                  <ContextMenuSeparator />
                                  <ContextMenuItem onClick={() => quickSendReminder(a.id)}>
                                    <Send className="mr-2 h-4 w-4" /> Enviar recordatorio
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() => setDeleteTarget({ id: a.id, customerName: a.customerName })}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Borrar cita
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Backdrop solo en móvil */}
        {panelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={closePanel}
            aria-hidden="true"
          />
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar esta cita?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
                Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {panelOpen && (
          <AppointmentPanel
            key={editing?.id ?? "new"}
            customers={customers}
            services={services}
            workers={workers}
            cabins={cabins}
            appointment={editing}
            defaultDate={date}
            defaultCabinId={presetCabin}
            defaultTime={presetTime}
            openingMinutes={openingMinutes}
            closingMinutes={closingMinutes}
            onClose={closePanel}
            onDraftChange={setDraft}
          />
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
      <p className="text-lg font-medium">No hay cabinas activas</p>
      <p className="text-sm">Crea una cabina en la sección Cabinas para empezar a agendar.</p>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Plus, Filter, MessageCircle, CheckCircle2, XCircle, Clock, Send, UserX, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { SlotRows, overlappingIndices, emptySlot } from "@/components/schedules-client"
import {
  setAppointmentStatus,
  sendReminder,
  saveClinicScheduleOverride,
  saveWorkerScheduleOverride,
  type WeeklySlotInput,
} from "@/lib/actions"

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

interface WorkingRange {
  startTime: string
  endTime: string
}

interface WorkerWithColor extends Option {
  color: string
}

interface Props {
  date: string
  longDate: string
  openingMinutes: number
  closingMinutes: number
  clinicClosed: boolean
  closedReason?: string
  clinicRanges: WorkingRange[]
  workerHours: Record<string, WorkingRange[]>
  workerLeaveType: Record<string, string>
  isAdmin: boolean
  cabins: Option[]
  workers: WorkerWithColor[]
  services: ServiceOption[]
  customers: CustomerOption[]
  appointments: AgendaAppointment[]
}

const LEAVE_LABELS: Record<string, string> = { VACATION: "Vacaciones", PERSONAL: "Asuntos propios" }

function formatRanges(ranges: WorkingRange[]): string {
  return ranges.map((r) => `${r.startTime}–${r.endTime}`).join(", ")
}

const HOUR_PX = 80

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

type OverrideScope = { type: "CLINIC" } | { type: "WORKER"; workerId: string; workerName: string }

interface DayOverrideDialogState {
  scope: OverrideScope
  currentRanges: WorkingRange[]
}

// Excepción puntual del día que se está viendo en la agenda, editable desde
// la propia leyenda (centro o una empleada concreta) sin ir a Configuración.
function DayOverrideDialog({
  state,
  date,
  onClose,
}: {
  state: DayOverrideDialogState | null
  date: string
  onClose: () => void
}) {
  const router = useRouter()
  const [closed, setClosed] = useState(true)
  const [slots, setSlots] = useState<WeeklySlotInput[]>([])
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!state) return
    setClosed(state.currentRanges.length === 0)
    setSlots(state.currentRanges.length > 0 ? state.currentRanges : [])
    setReason("")
  }, [state])

  const hasOverlap = !closed && overlappingIndices(slots).size > 0
  const label = state?.scope.type === "WORKER" ? state.scope.workerName : "el centro"

  async function handleSave() {
    if (!state) return
    if (hasOverlap) {
      toast.error("Corrige las franjas solapadas antes de guardar.")
      return
    }
    setLoading(true)
    const res =
      state.scope.type === "CLINIC"
        ? await saveClinicScheduleOverride(date, closed, closed ? [] : slots, reason || null)
        : await saveWorkerScheduleOverride(state.scope.workerId, date, closed, closed ? [] : slots, reason || null)
    setLoading(false)
    if (res.ok) {
      toast.success("Horario del día actualizado.")
      onClose()
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excepción de horario · {date}</DialogTitle>
        </DialogHeader>
        {state && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ajuste solo para este día en <strong>{label}</strong>. El horario semanal por defecto no cambia.
            </p>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>No trabaja / cerrado ese día</Label>
                <p className="text-xs text-muted-foreground">
                  {state.scope.type === "CLINIC" ? "El centro cierra completamente." : "No genera huecos ese día."}
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

            {hasOverlap && (
              <p className="text-xs text-destructive">Corrige las franjas solapadas antes de guardar.</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSave} disabled={loading || hasOverlap}>
                {loading ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AgendaBoard({
  date,
  longDate,
  openingMinutes,
  closingMinutes,
  clinicClosed,
  closedReason,
  clinicRanges,
  workerHours,
  workerLeaveType,
  isAdmin,
  cabins,
  workers,
  services,
  customers,
  appointments,
}: Props) {
  const router = useRouter()
  const [workerFilter, setWorkerFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [overrideDialogState, setOverrideDialogState] = useState<DayOverrideDialogState | null>(null)
  // Filtro visual (todos los roles): oculta sáb/dom en navegación y minicalendario. Por defecto oculto.
  const [hideWeekends, setHideWeekends] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem("agenda:hideWeekends")
    if (stored !== null) setHideWeekends(stored === "true")
  }, [])
  function toggleHideWeekends(v: boolean) {
    setHideWeekends(v)
    localStorage.setItem("agenda:hideWeekends", String(v))
  }
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<ExistingAppointment | null>(null)
  const [presetCabin, setPresetCabin] = useState<string | undefined>(undefined)
  const [presetTime, setPresetTime] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState<SlotDraft | null>(null)
  async function quickStatusChange(apptId: string, newStatus: string) {
    await setAppointmentStatus(apptId, newStatus)
    router.refresh()
  }

  async function quickSendReminder(apptId: string) {
    await sendReminder(apptId)
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
    let nd = new Date(y, m - 1, d + offset)
    if (hideWeekends) {
      const step = offset >= 0 ? 1 : -1
      while (nd.getDay() === 0 || nd.getDay() === 6) {
        nd = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate() + step)
      }
    }
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
              disableWeekends={hideWeekends}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <Label htmlFor="hide-weekends" className="text-xs font-normal text-muted-foreground">
              Ocultar fines de semana
            </Label>
            <Switch id="hide-weekends" checked={hideWeekends} onCheckedChange={toggleHideWeekends} />
          </div>

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

      {/* Resumen del día: horario del centro + de cada empleada (vacaciones incluidas).
          Admin: clic en cualquier chip para ajustar el horario de ese día. */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-6 py-2 text-xs">
        {isAdmin ? (
          <button
            type="button"
            title="Ajustar horario del centro para hoy"
            onClick={() => setOverrideDialogState({ scope: { type: "CLINIC" }, currentRanges: clinicRanges })}
            className="flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-card hover:underline"
          >
            <Pencil className="h-3 w-3 opacity-50" />
            Centro: {clinicClosed ? (closedReason ?? "Cerrado") : formatRanges(clinicRanges)}
          </button>
        ) : (
          <span className="font-medium text-muted-foreground">
            Centro: {clinicClosed ? (closedReason ?? "Cerrado") : formatRanges(clinicRanges)}
          </span>
        )}
        <span className="text-muted-foreground/50">·</span>
        {workers.map((w) => {
          const leaveType = workerLeaveType[w.id]
          const ranges = workerHours[w.id] ?? []
          const statusLabel = leaveType ? LEAVE_LABELS[leaveType] ?? leaveType : ranges.length === 0 ? "Cerrado" : formatRanges(ranges)
          const Chip = isAdmin ? "button" : "span"
          return (
            <Chip
              key={w.id}
              type={isAdmin ? "button" : undefined}
              title={isAdmin ? `Ajustar horario de ${w.name} para hoy` : undefined}
              onClick={isAdmin ? () => setOverrideDialogState({ scope: { type: "WORKER", workerId: w.id, workerName: w.name }, currentRanges: ranges }) : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5",
                isAdmin && "hover:bg-accent/60",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: w.color }} />
              <span className="font-medium">{w.name}</span>
              <span className={leaveType ? "text-[#B31412]" : "text-muted-foreground"}>{statusLabel}</span>
            </Chip>
          )
        })}
      </div>

      {/* Cuerpo: calendario + panel lateral */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          {cabins.length === 0 ? (
            <EmptyState />
          ) : clinicClosed ? (
            <ClosedState reason={closedReason} />
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

                {/* Columnas por cabina: recurso compartido, no atado a una empleada
                    concreta (el horario de cada empleada se ve en el resumen de arriba). */}
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

                          {/* Hueco que se está reservando (nueva cita o modificando) */}
                          {panelOpen && draft && draft.cabinId === cabin.id && draft.date === date && (
                            <div
                              className="pointer-events-none absolute left-1 right-1 z-0 flex flex-col justify-start rounded-md border-2 border-dashed border-primary bg-primary/10"
                              style={{
                                top: ((timeToMin(draft.time) - openingMinutes) / 60) * HOUR_PX,
                                height: Math.max((Math.max(draft.duration, 0) / 60) * HOUR_PX - 1, 16),
                              }}
                            >
                              <span className="px-1.5 py-0.5 text-[11px] font-medium text-primary">
                                {editing ? `Modificando · ${draft.time}` : `Nuevo · ${draft.time}`}
                              </span>
                            </div>
                          )}

                          {cabinAppts.map((a) => {
                            const top = ((a.startMinutes - openingMinutes) / 60) * HOUR_PX
                            // Altura exactamente proporcional (-1px de separación) para que
                            // citas consecutivas no se solapen visualmente.
                            const height = Math.max((a.durationMinutes / 60) * HOUR_PX - 1, 16)
                            const meta = STATUS_META[a.status as AppointmentStatus] ?? STATUS_META.PENDING
                            const reminded = ["SENT", "DELIVERED", "READ"].includes(a.reminderStatus)
                            const isCancelled = a.status === "CANCELLED"
                            // Citas de 30 min o menos no tienen alto para 2 filas: layout compacto + tooltip.
                            const isCompact = a.durationMinutes <= 30
                            return (
                              <ContextMenu key={a.id}>
                                <ContextMenuTrigger asChild>
                                  <button
                                    onClick={() => openEdit(a)}
                                    className={cn(
                                      "absolute left-1 right-1 z-10 flex flex-col overflow-hidden rounded-md border-l-4 text-left shadow-sm transition hover:shadow-md",
                                      isCompact ? "justify-center px-1.5 py-0.5" : "p-1.5",
                                      meta.className,
                                      panelOpen && editing && editing.id !== a.id && "opacity-50",
                                      panelOpen && editing?.id === a.id &&
                                        "z-20 opacity-100 ring-2 ring-primary ring-offset-2 ring-offset-card shadow-lg",
                                    )}
                                    style={{ top, height, borderLeftColor: a.workerColor }}
                                  >
                                    {isCompact ? (
                                      <div className="flex items-center justify-between gap-1">
                                        <p className="truncate text-xs">
                                          <span className="font-semibold">[{a.workerName}] {a.serviceName}</span> · {a.customerName}
                                        </p>
                                        <div className="flex shrink-0 items-center gap-1 text-[11px]">
                                          <span className="opacity-80">{a.startLabel}–{a.endLabel}</span>
                                          <span className={cn("inline-block h-2 w-2 rounded-full", meta.dot)} />
                                          {reminded && <MessageCircle className="h-3 w-3 text-[#1E6B34]" />}
                                        </div>
                                      </div>
                                    ) : (
                                      <>
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
                                      </>
                                    )}
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
                                      <UserX className="mr-2 h-4 w-4 text-red-500" /> No asistió
                                    </ContextMenuItem>
                                  )}
                                  {!isCancelled && (
                                    <ContextMenuItem onClick={() => quickStatusChange(a.id, "CANCELLED")}>
                                      <XCircle className="mr-2 h-4 w-4 text-muted-foreground" /> Cancelar cita
                                    </ContextMenuItem>
                                  )}
                                  <ContextMenuSeparator />
                                  <ContextMenuItem onClick={() => quickSendReminder(a.id)}>
                                    <Send className="mr-2 h-4 w-4" /> Enviar recordatorio
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

      <DayOverrideDialog
        state={overrideDialogState}
        date={date}
        onClose={() => setOverrideDialogState(null)}
      />
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

function ClosedState({ reason }: { reason?: string }) {
  return (
    <Card className="flex h-64 flex-col items-center justify-center gap-1 bg-[#E5E9F7]/40 text-center text-muted-foreground">
      <p className="text-lg font-medium">Centro cerrado</p>
      <p className="text-sm">{reason ?? "No hay horario configurado para este día."}</p>
    </Card>
  )
}

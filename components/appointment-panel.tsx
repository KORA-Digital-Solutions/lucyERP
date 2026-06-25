"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Search, X, Send, Trash2, XCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
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
import {
  createAppointment,
  updateAppointment,
  setAppointmentStatus,
  deleteAppointment,
  sendReminder,
  checkAvailability,
} from "@/lib/actions"
import { STATUS_META, REMINDER_META, type AppointmentStatus } from "@/lib/enums"
import { formatDuration, normalizeSearch } from "@/lib/format"

export interface Option {
  id: string
  name: string
  defaultWorkerId?: string | null
}
export interface ServiceOption extends Option {
  durationMinutes: number
  priceCents: number
}
export interface CustomerOption {
  id: string
  /** "primer apellido segundo apellido, nombre" */
  label: string
  whatsappOptIn: boolean
}
export interface ExistingAppointment {
  id: string
  customerId: string
  serviceId: string
  workerId: string
  cabinId: string
  date: string
  time: string
  durationMinutes: number
  status: string
  reminderStatus: string
  notes: string | null
}

interface Props {
  customers: CustomerOption[]
  services: ServiceOption[]
  workers: Option[]
  cabins: Option[]
  appointment?: ExistingAppointment | null
  defaultDate: string
  defaultCabinId?: string
  defaultTime?: string
  openingMinutes?: number
  closingMinutes?: number
  onClose: () => void
  onDraftChange?: (draft: { cabinId: string; date: string; time: string; duration: number } | null) => void
  className?: string
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + (m || 0)
}
function minToTime(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, min))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function AppointmentPanel({
  customers,
  services,
  workers,
  cabins,
  appointment,
  defaultDate,
  defaultCabinId,
  defaultTime,
  openingMinutes = 8 * 60,
  closingMinutes = 21 * 60,
  onClose,
  onDraftChange,
  className,
}: Props) {
  const router = useRouter()
  const isEdit = Boolean(appointment)
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const initTime = appointment ? appointment.time : (defaultTime ?? "10:00")
  const initDuration = appointment ? appointment.durationMinutes : 60
  const initCabinId = appointment ? appointment.cabinId : (defaultCabinId ?? cabins[0]?.id ?? "")

  function defaultWorkerForCabin(cId: string) {
    return cabins.find((c) => c.id === cId)?.defaultWorkerId ?? null
  }

  const initWorkerId = appointment?.workerId
    ?? defaultWorkerForCabin(initCabinId)
    ?? workers[0]?.id
    ?? ""

  const [customerId, setCustomerId] = useState(appointment?.customerId ?? "")
  const [serviceId, setServiceId] = useState(appointment?.serviceId ?? "")
  const [workerId, setWorkerId] = useState(initWorkerId)
  const [cabinId, setCabinId] = useState(initCabinId)

  function handleCabinChange(newCabinId: string) {
    setCabinId(newCabinId)
    if (!isEdit) {
      const def = defaultWorkerForCabin(newCabinId)
      if (def) setWorkerId(def)
    }
  }
  const [date, setDate] = useState(appointment?.date ?? defaultDate)
  const [time, setTime] = useState(initTime)
  const [duration, setDuration] = useState(initDuration)
  const [endTime, setEndTime] = useState(minToTime(timeToMin(initTime) + initDuration))
  const [status, setStatus] = useState(appointment?.status ?? "PENDING")
  const [notes, setNotes] = useState(appointment?.notes ?? "")
  const [customDuration, setCustomDuration] = useState(Boolean(appointment))
  const [cabinConflict, setCabinConflict] = useState<string | null>(null)
  const [workerConflict, setWorkerConflict] = useState<string | null>(null)

  // Buscador de servicio
  const [serviceQuery, setServiceQuery] = useState(
    appointment ? (services.find((s) => s.id === appointment.serviceId)?.name ?? "") : ""
  )
  const [showServiceResults, setShowServiceResults] = useState(false)
  const serviceRef = useRef<HTMLDivElement>(null)

  // Buscador de cliente
  const [query, setQuery] = useState(
    appointment ? (customers.find((c) => c.id === appointment.customerId)?.label ?? "") : ""
  )
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Inicialización al montar / cambiar de cita
  useEffect(() => {
    if (appointment) {
      setCustomerId(appointment.customerId)
      setServiceId(appointment.serviceId)
      setWorkerId(appointment.workerId)
      setCabinId(appointment.cabinId)
      setDate(appointment.date)
      setTime(appointment.time)
      setDuration(appointment.durationMinutes)
      setEndTime(minToTime(timeToMin(appointment.time) + appointment.durationMinutes))
      setStatus(appointment.status)
      setNotes(appointment.notes ?? "")
      setCustomDuration(true)
      setQuery(customers.find((c) => c.id === appointment.customerId)?.label ?? "")
      setServiceQuery(services.find((s) => s.id === appointment.serviceId)?.name ?? "")
    } else {
      const t = defaultTime ?? "10:00"
      const newCabinId = defaultCabinId ?? cabins[0]?.id ?? ""
      setCustomerId("")
      setServiceId("")
      setServiceQuery("")
      setWorkerId(defaultWorkerForCabin(newCabinId) ?? workers[0]?.id ?? "")
      setCabinId(newCabinId)
      setDate(defaultDate)
      setTime(t)
      setDuration(60)
      setEndTime(minToTime(timeToMin(t) + 60))
      setStatus("PENDING")
      setNotes("")
      setCustomDuration(false)
      setQuery("")
    }
  }, [appointment, defaultDate, defaultCabinId, defaultTime, workers, cabins, customers])

  // Cierra resultados al hacer clic fuera
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false)
      if (serviceRef.current && !serviceRef.current.contains(e.target as Node)) setShowServiceResults(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  // Emite el "borrador" del hueco para previsualizarlo en la agenda (solo al crear).
  useEffect(() => {
    if (appointment) {
      onDraftChange?.(null)
      return
    }
    onDraftChange?.({ cabinId, date, time, duration })
  }, [appointment, cabinId, date, time, duration, onDraftChange])

  // Comprobación de disponibilidad en tiempo real (debounce 400ms)
  useEffect(() => {
    if (!cabinId || !workerId || !date || !time || duration <= 0) {
      setCabinConflict(null)
      setWorkerConflict(null)
      return
    }
    const timer = setTimeout(async () => {
      const result = await checkAvailability(cabinId, workerId, date, time, duration, appointment?.id)
      setCabinConflict(result.cabinConflict)
      setWorkerConflict(result.workerConflict)
    }, 400)
    return () => clearTimeout(timer)
  }, [cabinId, workerId, date, time, duration, appointment?.id])

  const results = useMemo(() => {
    const q = normalizeSearch(query)
    if (!q) return []
    return customers.filter((c) => normalizeSearch(c.label).includes(q)).slice(0, 8)
  }, [query, customers])

  const serviceResults = useMemo(() => {
    const q = normalizeSearch(serviceQuery)
    if (!q) return services.slice(0, 8)
    return services.filter((s) => normalizeSearch(s.name).includes(q)).slice(0, 8)
  }, [serviceQuery, services])

  function selectService(s: ServiceOption) {
    setServiceId(s.id)
    setServiceQuery(s.name)
    setShowServiceResults(false)
    if (!customDuration) {
      setDuration(s.durationMinutes)
      setEndTime(minToTime(timeToMin(time) + s.durationMinutes))
    }
  }
  function clearService() {
    setServiceId("")
    setServiceQuery("")
    setShowServiceResults(false)
  }

  const endError = timeToMin(endTime) <= timeToMin(time)

  // --- Sincronización duración <-> hora fin ---
  function onChangeStart(t: string) {
    setTime(t)
    setEndTime(minToTime(timeToMin(t) + duration))
  }
  function onChangeDuration(value: number) {
    setCustomDuration(true)
    const d = Number.isFinite(value) ? value : 0
    setDuration(d)
    setEndTime(minToTime(timeToMin(time) + Math.max(d, 0)))
  }
  function onChangeEnd(value: string) {
    setEndTime(value)
    const d = timeToMin(value) - timeToMin(time)
    if (d > 0) {
      setCustomDuration(true)
      setDuration(d)
    }
  }
  function onSelectService(id: string) {
    setServiceId(id)
    const svc = services.find((s) => s.id === id)
    if (svc && !customDuration) {
      setDuration(svc.durationMinutes)
      setEndTime(minToTime(timeToMin(time) + svc.durationMinutes))
    }
  }

  function selectCustomer(c: CustomerOption) {
    setCustomerId(c.id)
    setQuery(c.label)
    setShowResults(false)
  }
  function clearCustomer() {
    setCustomerId("")
    setQuery("")
    setShowResults(false)
  }

  const selectedCustomer = customers.find((c) => c.id === customerId)

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set("customerId", customerId)
    fd.set("serviceId", serviceId)
    fd.set("workerId", workerId)
    fd.set("cabinId", cabinId)
    fd.set("date", date)
    fd.set("time", time)
    fd.set("durationMinutes", String(duration))
    fd.set("status", status)
    fd.set("notes", notes)
    return fd
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId || !serviceId || !workerId || !cabinId) {
      toast.error("Completa cliente, servicio, trabajador y cabina.")
      return
    }
    if (endError || duration <= 0) {
      toast.error("La hora de fin debe ser posterior a la de inicio.")
      return
    }
    setLoading(true)
    const res = appointment
      ? await updateAppointment(appointment.id, buildFormData())
      : await createAppointment(buildFormData())
    setLoading(false)
    if (res.ok) {
      toast.success(isEdit ? "Cita actualizada." : "Cita creada.")
      onClose()
      router.refresh()
    } else {
      toast.error(res.error ?? "No se pudo guardar la cita.")
    }
  }

  async function runAction(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setLoading(true)
    const res = await fn()
    setLoading(false)
    if (res.ok) {
      toast.success(okMsg)
      onClose()
      router.refresh()
    } else {
      toast.error(res.error ?? "Acción fallida.")
    }
  }

  return (
    <aside
      className={cn(
        "flex w-full flex-col border-l bg-card shadow-xl",
        "fixed inset-y-0 right-0 z-50 max-w-md",
        "lg:static lg:z-auto lg:w-[400px] lg:max-w-none lg:shadow-none",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-lg font-semibold">{isEdit ? "Editar cita" : "Nueva cita"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* Cliente — buscador */}
        <div className="space-y-2" ref={searchRef}>
          <Label>Cliente</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-9"
              placeholder="Buscar: apellidos, nombre…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowResults(true)
                if (customerId) setCustomerId("")
              }}
              onFocus={() => setShowResults(true)}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={clearCustomer}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {showResults && results.length > 0 && !customerId && (
              <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showResults && query.trim() && results.length === 0 && !customerId && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
                Sin resultados
              </div>
            )}
          </div>
          {selectedCustomer && !selectedCustomer.whatsappOptIn && (
            <p className="text-xs text-[#B31412]">
              Este cliente no ha autorizado recordatorios por WhatsApp.
            </p>
          )}
        </div>

        {/* Servicio — buscador */}
        <div className="space-y-2" ref={serviceRef}>
          <Label>Servicio</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-9"
              placeholder="Buscar servicio…"
              value={serviceQuery}
              onChange={(e) => {
                setServiceQuery(e.target.value)
                setShowServiceResults(true)
                if (serviceId) setServiceId("")
              }}
              onFocus={() => setShowServiceResults(true)}
              autoComplete="off"
            />
            {serviceQuery && (
              <button
                type="button"
                onClick={clearService}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {showServiceResults && (
              <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
                {serviceResults.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectService(s)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span>{s.name}</span>
                      <span className="text-xs text-muted-foreground">{formatDuration(s.durationMinutes)}</span>
                    </button>
                  </li>
                ))}
                {serviceResults.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Fecha + inicio */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Hora inicio</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => e.target.value && onChangeStart(e.target.value)}
            />
          </div>
        </div>

        {/* Duración + hora fin sincronizadas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Duración (min)</Label>
            <Input
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => onChangeDuration(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Hora fin</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => e.target.value && onChangeEnd(e.target.value)}
              className={endError ? "border-[#EA4335] focus-visible:ring-[#EA4335]" : ""}
            />
          </div>
        </div>
        {endError ? (
          <p className="text-xs text-[#B31412]">La hora de fin debe ser posterior a la de inicio.</p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {time}–{endTime} · {formatDuration(Math.max(duration, 0))}
          </p>
        )}

        {/* Trabajador + cabina */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Trabajador</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger className={workerConflict ? "border-destructive" : ""}>
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
            {workerConflict && (
              <p className="text-xs text-destructive">{workerConflict}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Cabina</Label>
            <Select value={cabinId} onValueChange={handleCabinChange}>
              <SelectTrigger className={cabinConflict ? "border-destructive" : ""}>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {cabins.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cabinConflict && (
              <p className="text-xs text-destructive">{cabinConflict}</p>
            )}
          </div>
        </div>

        {isEdit && (
          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_META) as AppointmentStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Notas</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="resize-none"
            placeholder="Notas internas (no sanitarias)…"
          />
        </div>

        {isEdit && appointment && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className={REMINDER_META[appointment.reminderStatus]?.className}>
              WhatsApp: {REMINDER_META[appointment.reminderStatus]?.label ?? appointment.reminderStatus}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={loading}
                onClick={() => runAction(() => sendReminder(appointment.id), "Recordatorio enviado.")}>
                <Send className="mr-1 h-3.5 w-3.5" /> Recordatorio
              </Button>
              {appointment.status !== "CANCELLED" && (
                <Button type="button" size="sm" variant="outline" disabled={loading}
                  onClick={() => runAction(() => setAppointmentStatus(appointment.id, "CANCELLED"), "Cita cancelada.")}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar cita
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" className="text-[#B31412]" disabled={loading}
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Borrar
              </Button>
              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Borrar esta cita?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => runAction(() => deleteAppointment(appointment.id), "Cita borrada.")}
                    >
                      Borrar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </form>

      <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={loading}>
          {loading ? "Guardando…" : isEdit ? "Guardar" : "Crear cita"}
        </Button>
      </div>
    </aside>
  )
}

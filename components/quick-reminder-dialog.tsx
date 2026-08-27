"use client"

import { useEffect, useState } from "react"
import { Bell, Pin, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { createCustomerReminder, getCustomerReminders } from "@/lib/actions"
import { isReminderOverdue, REMINDER_ACCENT, REMINDER_TONE } from "@/lib/reminders"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Pendiente = { id: string; title: string; dueDate: Date | string | null }

/**
 * Apuntar un recordatorio sin salir del cobro: es justo cuando se te ocurre
 * ("vuelve en tres meses"), y salirse a Clientes significaría perder el
 * ticket a medias. La ficha que se abre desde el TPV es de consulta, así que
 * crear entra por aquí.
 *
 * Arriba van los pendientes que el cliente ya tiene: desde el TPV no se ve su
 * ficha mientras se apunta, y sin esa lista es fácil escribir dos veces lo
 * mismo.
 */
export function QuickReminderDialog({ open, onOpenChange, customerId, customerName, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  customerName: string
  /** El TPV recarga sus avisos: uno permanente o inminente empieza a avisar ya. */
  onCreated?: () => void
}) {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null)
  const [title, setTitle] = useState("")
  const [permanent, setPermanent] = useState(false)
  const [dueDate, setDueDate] = useState("")
  const [alertDays, setAlertDays] = useState("7")
  const [saving, setSaving] = useState(false)

  // Al abrir se empieza de cero y se traen los pendientes que ya tiene.
  useEffect(() => {
    if (!open) return
    let vigente = true
    setTitle(""); setPermanent(false); setDueDate(""); setAlertDays("7")
    setPendientes(null)
    getCustomerReminders(customerId)
      .then((rs) => {
        if (!vigente) return
        setPendientes(rs.filter((r) => !r.completedAt))
      })
      .catch(() => { if (vigente) setPendientes([]) })
    return () => { vigente = false }
  }, [open, customerId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error("Escribe el recordatorio.")
      return
    }
    if (!permanent && !dueDate) {
      toast.error("Indica la fecha, o márcalo como permanente.")
      return
    }
    const fd = new FormData()
    fd.set("title", title.trim())
    fd.set("dueDate", permanent ? "" : dueDate)
    fd.set("alertDaysBefore", alertDays)
    setSaving(true)
    const res = await createCustomerReminder(customerId, fd)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error ?? "Error al crear el recordatorio.")
      return
    }
    toast.success("Recordatorio creado.")
    onCreated?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: "30rem" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className={cn("h-5 w-5 shrink-0", REMINDER_ACCENT)} />
            Nuevo recordatorio
          </DialogTitle>
          <DialogDescription>{customerName}</DialogDescription>
        </DialogHeader>

        {pendientes !== null && pendientes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ya tiene {pendientes.length === 1 ? "un recordatorio" : `${pendientes.length} recordatorios`}
            </p>
            <div className="max-h-32 space-y-1.5 overflow-y-auto">
              {pendientes.map((r) => {
                const permanente = r.dueDate === null
                const vencido = !permanente && isReminderOverdue(new Date(r.dueDate!), new Date())
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                      REMINDER_TONE[permanente ? "permanent" : vencido ? "overdue" : "due"].card,
                    )}
                  >
                    {permanente
                      ? <Pin className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", REMINDER_TONE.permanent.accent)} />
                      : <Bell className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", REMINDER_TONE[vencido ? "overdue" : "due"].accent)} />}
                    <div className="min-w-0">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-muted-foreground">
                        {permanente
                          ? "Aviso permanente"
                          : `${vencido ? "Venció el" : "Vence el"} ${new Date(r.dueDate!).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpv-reminder-title">Nota / recordatorio</Label>
            <Textarea
              id="tpv-reminder-title"
              placeholder="Ej. Se hizo un láser, cita de seguimiento en 6 meses"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              autoFocus
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5">
            <Switch
              id="tpv-reminder-permanent"
              className="mt-0.5"
              checked={permanent}
              onCheckedChange={setPermanent}
            />
            <div className="space-y-0.5">
              <Label htmlFor="tpv-reminder-permanent" className="font-normal">Permanente</Label>
              <p className="text-xs text-muted-foreground">
                Sin fecha. Salta siempre que se atienda a este cliente, hasta que se complete o se borre.
              </p>
            </div>
          </div>

          {!permanent && (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="tpv-reminder-due">Fecha del recordatorio</Label>
                <Input
                  id="tpv-reminder-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="w-40 space-y-1.5">
                <Label htmlFor="tpv-reminder-days">Avisar con (días)</Label>
                <Input
                  id="tpv-reminder-days"
                  type="number"
                  min={0}
                  value={alertDays}
                  onChange={(e) => setAlertDays(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              <Plus className="h-4 w-4" /> {saving ? "Guardando…" : "Añadir recordatorio"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

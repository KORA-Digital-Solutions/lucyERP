"use client"

/**
 * Los datos de una empleada, en un solo formulario para los dos sitios donde
 * se piden: el diálogo de "Nuevo usuario" de la lista y la pestaña "Datos" de
 * su ficha. Antes solo existía dentro del diálogo, así que para cambiar un
 * teléfono había que abrir un modal a dos columnas encima de la tabla.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveWorker } from "@/lib/actions"
import { PinNuevoDialog } from "@/components/pin-nuevo-dialog"
import type { WorkerRow } from "@/components/workers-client"

/** nombre.apellidos@dominio-del-centro, que es como se dan de alta aquí. */
function buildEmail(name: string, lastName: string, domain: string) {
  const slug = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".")
  const parts = [slug(name), slug(lastName)].filter(Boolean)
  return parts.length ? `${parts.join(".")}@${domain}` : ""
}

export function WorkerForm({
  worker,
  domain,
  onDone,
  onCancel,
  submitLabel = "Guardar",
}: {
  /** null = alta nueva. */
  worker: WorkerRow | null
  domain: string
  onDone: () => void
  /** Sin él no se pinta el botón de cancelar: en la ficha no hay de dónde salir. */
  onCancel?: () => void
  submitLabel?: string
}) {
  const router = useRouter()
  const [role, setRole] = useState(worker?.role ?? "WORKER")
  const [name, setName] = useState(worker?.name ?? "")
  const [lastName, setLastName] = useState(worker?.lastName ?? "")
  // Quien ya tiene email es que se lo pusieron a mano o se lo generamos en su
  // día: a partir de ahí el nombre deja de reescribirlo solo.
  const [emailManual, setEmailManual] = useState(!!worker?.email)
  const [email, setEmail] = useState(
    worker?.email ?? buildEmail(worker?.name ?? "", worker?.lastName ?? "", domain),
  )
  const [loading, setLoading] = useState(false)
  // Volver a marcar "Activo" a quien tenía PIN le genera uno nuevo, y hay que
  // enseñarlo: se ve una sola vez. Ver pinAlCambiarDeActividad en lib/actions.
  const [pinNuevo, setPinNuevo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("role", role)
    setLoading(true)
    const res = await saveWorker(worker?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Usuario guardado.")
      router.refresh()
      // Con PIN nuevo el formulario se queda: cerrarlo se llevaría por delante
      // los dígitos antes de que a nadie le dé tiempo a apuntarlos.
      if (res.pin) setPinNuevo(res.pin)
      else onDone()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name" name="name" value={name} required
            onChange={(e) => {
              setName(e.target.value)
              if (!emailManual) setEmail(buildEmail(e.target.value, lastName, domain))
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Apellidos</Label>
          <Input
            id="lastName" name="lastName" value={lastName} required
            onChange={(e) => {
              setLastName(e.target.value)
              if (!emailManual) setEmail(buildEmail(name, e.target.value, domain))
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">{role === "ADMIN" ? "Email de acceso" : "Email (opcional)"}</Label>
          {/* Solo la gestión del centro se abre con email y contraseña. Una
              trabajadora entra por el mostrador con su PIN, así que su email
              es un dato de contacto y nada más. */}
          <Input
            id="email" name="email" type="email" value={email} required={role === "ADMIN"}
            onChange={(e) => { setEmail(e.target.value); setEmailManual(true) }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={worker?.phone ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rol</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WORKER">Trabajador</SelectItem>
              <SelectItem value="ADMIN">Administrador</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {role === "ADMIN"
              ? "Entra a la gestión del centro con su email y contraseña."
              : "Entra al mostrador con su PIN. No abre la gestión del centro."}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">Color en agenda</Label>
          <Input id="color" name="color" type="color" defaultValue={worker?.color ?? "#3C54A4"} className="h-10 p-1" />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label htmlFor="active">Activo</Label>
          <p className="text-xs text-muted-foreground">
            Al desactivarla deja de salir en la agenda y no puede entrar.
          </p>
        </div>
        <Switch id="active" name="active" defaultChecked={worker?.active ?? true} />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        )}
        <Button type="submit" disabled={loading}>{loading ? "Guardando…" : submitLabel}</Button>
      </div>

      <PinNuevoDialog
        pin={pinNuevo}
        nombre={name}
        onClose={() => { setPinNuevo(null); onDone() }}
      />
    </form>
  )
}

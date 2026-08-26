"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { createCustomerQuick, type QuickCustomer } from "@/lib/actions"
import { customerLabel, isValidPhone } from "@/lib/format"

export type { QuickCustomer }

/* ─── Prefill desde el texto escrito en el buscador ───────────────────────── */

function digitsOf(s: string) {
  return s.replace(/\D/g, "")
}

// Dos teléfonos son "el mismo" si coinciden sus últimos 9 dígitos: así
// "600111222" y "+34 600 111 222" se detectan como duplicado.
function phoneKey(phone: string) {
  return digitsOf(phone).slice(-9)
}

type Prefill = { firstName: string; lastName: string; lastName2: string; phone: string }

export function prefillFromQuery(query: string): Prefill {
  const q = query.trim()
  const empty: Prefill = { firstName: "", lastName: "", lastName2: "", phone: "" }
  if (!q) return empty
  // Si lo escrito son casi todo dígitos, es un teléfono.
  if (digitsOf(q).length >= 6 && digitsOf(q).length >= q.replace(/[\s+]/g, "").length) {
    return { ...empty, phone: q }
  }
  const [firstName = "", lastName = "", ...rest] = q.split(/\s+/)
  return { firstName, lastName, lastName2: rest.join(" "), phone: "" }
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */

type ExistingCustomer = { id: string; firstName: string; lastName: string | null; lastName2: string | null; phone: string; balanceCents: number }

export function QuickCustomerDialog({
  open, query, customers, onOpenChange, onCreated, onSelectExisting,
}: {
  open: boolean
  /** Texto escrito en el buscador; se usa para rellenar el formulario. */
  query: string
  /** Clientes ya cargados, para avisar de posibles duplicados. */
  customers: ExistingCustomer[]
  onOpenChange: (open: boolean) => void
  onCreated: (customer: QuickCustomer) => void
  /** Seleccionar un cliente existente en vez de crear un duplicado. */
  onSelectExisting?: (customer: ExistingCustomer) => void
}) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [lastName2, setLastName2] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [whatsappOptIn, setWhatsappOptIn] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al abrir, rellenar con lo que el usuario ya había escrito en el buscador.
  useEffect(() => {
    if (!open) return
    const p = prefillFromQuery(query)
    setFirstName(p.firstName)
    setLastName(p.lastName)
    setLastName2(p.lastName2)
    setPhone(p.phone)
    setEmail("")
    setWhatsappOptIn(true)
    setError(null)
    setLoading(false)
  }, [open, query])

  // Aviso (no bloqueante) si ya hay un cliente con ese teléfono.
  const duplicate = useMemo(() => {
    const key = phoneKey(phone)
    if (key.length < 9) return null
    return customers.find((c) => phoneKey(c.phone) === key) ?? null
  }, [phone, customers])

  const phoneValid = phone.trim() !== "" && isValidPhone(phone)
  const canSubmit = firstName.trim() !== "" && lastName.trim() !== "" && phoneValid && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) { setError("El nombre es obligatorio."); return }
    if (!lastName.trim()) { setError("El primer apellido es obligatorio."); return }
    if (!isValidPhone(phone)) { setError("Teléfono no válido. Ejemplo: 600 111 222."); return }

    const fd = new FormData()
    fd.set("firstName", firstName.trim())
    fd.set("lastName", lastName.trim())
    fd.set("lastName2", lastName2.trim())
    fd.set("phone", phone.trim())
    fd.set("email", email.trim())
    fd.set("whatsappOptIn", whatsappOptIn ? "true" : "false")
    fd.set("active", "true")

    setLoading(true)
    setError(null)
    const res = await createCustomerQuick(fd)
    setLoading(false)

    if (!res.ok || !res.customer) {
      setError(res.error ?? "Error al crear el cliente.")
      return
    }
    toast.success("Cliente creado.")
    onCreated(res.customer)
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <Dialog open onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent style={{ maxWidth: "30rem" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Nuevo cliente
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qc-firstName">Nombre</Label>
            <Input
              id="qc-firstName" autoFocus value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setError(null) }}
              placeholder="María"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qc-lastName">Primer apellido</Label>
              <Input id="qc-lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qc-lastName2">
                Segundo apellido <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input id="qc-lastName2" value={lastName2} onChange={(e) => setLastName2(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qc-phone">Teléfono</Label>
              <Input
                id="qc-phone" inputMode="tel" value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(null) }}
                placeholder="600 111 222"
                className={phone !== "" && !phoneValid ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qc-email">
                Email <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input id="qc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          {phone !== "" && !phoneValid && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Teléfono no válido. Ejemplo: 600 111 222.
            </p>
          )}

          {duplicate && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2.5 space-y-2">
              <p className="text-xs text-orange-800 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Ya existe un cliente con este teléfono:{" "}
                <span className="font-medium">
                  {customerLabel(duplicate)}
                </span>
              </p>
              {onSelectExisting && (
                <Button
                  type="button" variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => { onSelectExisting(duplicate); onOpenChange(false) }}
                >
                  Usar ese cliente
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <Label htmlFor="qc-whatsapp">Recordatorios por WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Consentimiento del cliente</p>
            </div>
            <Switch id="qc-whatsapp" checked={whatsappOptIn} onCheckedChange={setWhatsappOptIn} />
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Podrás completar la ficha (fecha de nacimiento, observaciones…) más tarde desde Clientes.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!canSubmit}>
              {loading ? "Creando…" : "Crear y seleccionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Search, Pencil, Trash2, Check, X, UserCheck, UserX,
  AlertTriangle, FileText, Wallet, ArrowUpCircle, ArrowDownCircle,
  ShoppingCart, Gift, ArrowLeft, Bell, CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  saveCustomer, deleteCustomer, getClientProfile,
  getCustomerReminders, createCustomerReminder, completeCustomerReminder,
} from "@/lib/actions"
import {
  DEFAULT_PHONE_PREFIX, formatFileNumber, formatNationalPhone, formatPhone,
  isValidPhone, joinPhone, normalizeSearch, onlyDigits, splitPhone,
} from "@/lib/format"
import {
  STATUS_META, CUSTOMER_SEX_META, REFERRAL_SOURCE_META,
  type AppointmentStatus, type CustomerSex, type ReferralSource,
} from "@/lib/enums"
import {
  useTableSort, SortableTableHead, byText, byNumber, byDate, byBoolean,
  type SortRule,
} from "@/components/sortable-table-head"

export interface ClientRow {
  id: string
  fileNumber: number
  firstName: string
  lastName: string
  lastName2: string | null
  sex: string | null
  profession: string | null
  phone: string
  phoneLabel: string | null
  phone2: string | null
  phone2Label: string | null
  email: string | null
  address: string | null
  referralSource: string | null
  allergies: string | null
  birthDate: string | null
  notes: string | null
  createdAt: string
  whatsappOptIn: boolean
  active: boolean
  balanceCents: number
  debtCents: number
  lastAppointment: string | null
  daysSinceLastAppt: number | null
}

type ActivityStatus = "active" | "inactive"

function getActivityStatus(row: ClientRow): ActivityStatus {
  return row.active ? "active" : "inactive"
}

const CLIENT_SORTERS = {
  expediente: byNumber<ClientRow>((r) => r.fileNumber),
  nombre: byText<ClientRow>((r) => `${r.lastName ?? ""} ${r.lastName2 ?? ""} ${r.firstName}`),
  telefono: byText<ClientRow>((r) => r.phone),
  nacimiento: byDate<ClientRow>((r) => r.birthDate),
  whatsapp: byBoolean<ClientRow>((r) => r.whatsappOptIn),
  // lastAppointment es un texto ya localizado ("12 ago 2026"), que como cadena
  // ordenaría por nombre de mes. Se usa daysSinceLastAppt, que sí es numérico:
  // más días = cita más antigua, así que asc deja las más antiguas primero.
  ultimaCita: (a: ClientRow, b: ClientRow) => {
    const va = a.daysSinceLastAppt
    const vb = b.daysSinceLastAppt
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return vb - va
  },
  saldo: byNumber<ClientRow>((r) => r.balanceCents),
  deuda: byNumber<ClientRow>((r) => r.debtCents),
  estado: byBoolean<ClientRow>((r) => r.active),
}

type ClientSortKey = keyof typeof CLIENT_SORTERS

// El listado arranca ordenado por apellidos y nombre, que es como se busca a
// un cliente de viva voz. El comparador "nombre" ya monta la clave
// "apellido1 apellido2 nombre" y compara con localeCompare en español, así que
// no le estorban ni los acentos ni las mayúsculas.
const CLIENT_SORT_INICIAL: SortRule<ClientSortKey>[] = [{ key: "nombre", dir: "asc" }]

function hasInactivityWarning(row: ClientRow, threshold: number): boolean {
  return row.daysSinceLastAppt !== null && row.daysSinceLastAppt > threshold
}

const ACTIVITY_BADGE: Record<ActivityStatus, { label: string; className: string; icon: React.ReactNode }> = {
  active:   { label: "Activo",   className: "bg-[#E6F4EA] text-[#1E6B34] border-[#A8D5B5]", icon: <UserCheck className="h-3 w-3" /> },
  inactive: { label: "Inactivo", className: "bg-[#F5F5F5] text-[#757575] border-[#E0E0E0]", icon: <UserX className="h-3 w-3" /> },
}

function fmtEur(cents: number) {
  return (Math.abs(cents) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

const MOV_META: Record<string, { label: string; sign: string; cls: string }> = {
  GIFT_CARD_IN:  { label: "Tarjeta regalo",   sign: "+", cls: "text-purple-700" },
  BALANCE_USED:  { label: "Saldo usado",       sign: "−", cls: "text-blue-700" },
  DEBT_CREATED:  { label: "Deuda generada",    sign: "−", cls: "text-red-600" },
  DEBT_PAID:     { label: "Deuda pagada",      sign: "+", cls: "text-green-700" },
}

/* ─── Pestaña "Datos de Cliente" ──────────────────────────────────────────
   Muestra TODOS los campos de la ficha, también los vacíos: si un campo solo
   aparece cuando tiene valor, no hay manera de saber que existe ni de
   rellenarlo. Se consulta en modo lectura y se desbloquea con "Editar".

   El objetivo del diseño es que la ficha entera entre en pantalla sin scroll:
   la etiqueta va a la izquierda y el valor a la derecha en la misma línea
   (la mitad de alto que apilarlos), y las secciones se reparten en dos
   columnas de tarjetas en vez de encadenarse hacia abajo. */

// Radix Select no admite un item con valor "", así que los desplegables
// opcionales usan este centinela para "sin especificar".
const NO_VALUE = "__none__"

const LABEL_HINT = "De quién es el teléfono: personal, trabajo, madre…"
const LABEL_BLOCKED = "Escribe antes un teléfono válido"

function DataCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

// Fila compacta: etiqueta a la izquierda, valor (o control de edición) a la
// derecha. `min-h-8` mantiene el alto estable aunque el campo esté vacío.
function DataRow({
  label, edit, display, children,
}: {
  label: string
  edit: boolean
  display?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="grid min-h-8 grid-cols-[8.5rem_1fr] items-center gap-3">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {edit && children ? (
        children
      ) : (
        <div className="min-w-0 break-words text-sm">
          {display ? display : <span className="text-muted-foreground/50">—</span>}
        </div>
      )}
    </div>
  )
}

// Los campos largos (alergias, observaciones) no caben en una línea, así que
// van con la etiqueta encima y el texto debajo a todo el ancho.
function DataBlock({
  label, edit, display, children,
}: {
  label: string
  edit: boolean
  display?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1 pt-1">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {edit && children ? (
        children
      ) : (
        <div className="min-h-6 whitespace-pre-wrap break-words text-sm">
          {display ? display : <span className="text-muted-foreground/50">—</span>}
        </div>
      )}
    </div>
  )
}

type PhoneFields = { prefix: string; national: string }

// Reparte un teléfono guardado entre los dos campos del formulario, con el
// número ya agrupado ("600 44 45 55") para que editar se parezca a leer.
// Sin teléfono guardado los dos campos van vacíos: un "+34" suelto en un
// teléfono que no existe parece un dato y no lo es.
function phoneFields(stored: string | null | undefined): PhoneFields {
  if (!stored) return { prefix: "", national: "" }
  const { prefix, national } = splitPhone(stored)
  return { prefix, national: formatNationalPhone(prefix, national) }
}

const EMPTY_PHONE: PhoneFields = { prefix: "", national: "" }

// Al escribir el número aparece solo el prefijo por defecto, y al borrarlo
// entero desaparece con él: prefijo y número van siempre de la mano.
function withNational(prev: PhoneFields, national: string): PhoneFields {
  if (!national.trim()) return { prefix: "", national }
  return { prefix: prev.prefix || DEFAULT_PHONE_PREFIX, national }
}

function ClientDataTab({
  row, isAdmin, onDelete,
}: {
  row: ClientRow
  isAdmin: boolean
  onDelete: () => void
}) {
  const router = useRouter()
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sex, setSex] = useState(row.sex ?? "")
  const [referral, setReferral] = useState(row.referralSource ?? "")
  const [phone, setPhone] = useState(() => phoneFields(row.phone))
  const [phone2, setPhone2] = useState(() => phoneFields(row.phone2))

  function startEdit() {
    setSex(row.sex ?? "")
    setReferral(row.referralSource ?? "")
    setPhone(phoneFields(row.phone))
    setPhone2(phoneFields(row.phone2))
    setEdit(true)
  }

  // Una etiqueta ("madre", "trabajo") no dice nada sin un teléfono al que
  // referirse, así que el campo se bloquea hasta que el número es válido.
  const phoneJoined = joinPhone(phone.prefix, phone.national)
  const phone2Joined = joinPhone(phone2.prefix, phone2.national)
  const phoneOk = isValidPhone(phoneJoined)
  const phone2Ok = phone2.national.trim() !== "" && isValidPhone(phone2Joined)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (!String(fd.get("firstName") ?? "").trim()) {
      toast.error("El nombre es obligatorio.")
      return
    }
    if (!String(fd.get("lastName") ?? "").trim()) {
      toast.error("El primer apellido es obligatorio.")
      return
    }
    if (!phoneOk) {
      toast.error("Teléfono no válido. Ejemplo: 600 111 222.")
      return
    }
    if (phone2.national.trim() !== "" && !phone2Ok) {
      toast.error("El segundo teléfono no es válido.")
      return
    }
    // Prefijo y número viajan juntos en el campo `phone`, que es como se
    // guarda; los inputs de la ficha están fuera del FormData a propósito.
    fd.set("phone", phoneJoined)
    fd.set("phone2", phone2Joined)
    fd.set("sex", sex)
    fd.set("referralSource", referral)
    setSaving(true)
    const res = await saveCustomer(row.id, fd)
    setSaving(false)
    if (res.ok) {
      toast.success("Ficha actualizada.")
      setEdit(false)
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al guardar.")
    }
  }

  const age = row.birthDate
    ? Math.floor((Date.now() - new Date(row.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null
  const sexLabel = row.sex ? CUSTOMER_SEX_META[row.sex as CustomerSex]?.label ?? row.sex : ""
  const referralLabel = row.referralSource
    ? REFERRAL_SOURCE_META[row.referralSource as ReferralSource]?.label ?? row.referralSource
    : ""

  // En lectura la etiqueta del teléfono va pegada al número como distintivo,
  // que ocupa menos que darle una fila propia. Al editar sí tiene su fila,
  // para que se vea de qué va el campo y quepan los ejemplos.
  function phoneDisplay(value: string | null, label: string | null) {
    if (!value) return ""
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums">{formatPhone(value)}</span>
        {label && (
          <Badge variant="outline" className="py-0 text-xs font-normal text-muted-foreground">{label}</Badge>
        )}
      </span>
    )
  }

  return (
    // La `key` remonta el formulario al entrar y salir de edición, así los
    // campos no controlados vuelven a los valores guardados al cancelar.
    <form key={edit ? "edit" : "read"} onSubmit={onSubmit} className="max-w-[1400px] space-y-3 pb-4">

      <div className="flex items-center justify-end gap-3">
        {edit && (
          <p className="mr-auto text-xs text-muted-foreground">
            Los cambios no se guardan hasta que pulses Guardar.
          </p>
        )}
        {edit ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setEdit(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </>
        ) : (
          <>
            {isAdmin && (
              <Button
                type="button" variant="ghost" size="sm"
                className="mr-auto gap-1.5 text-[#B31412] hover:bg-[#FCE8E6] hover:text-[#B31412]"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Borrar cliente
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          </>
        )}
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2">

        {/* ── Columna izquierda ── */}
        <div className="space-y-3">
          <DataCard title="Datos personales">
            <DataRow label="Primer apellido" edit={edit} display={row.lastName}>
              <Input name="lastName" className="h-8" defaultValue={row.lastName} required />
            </DataRow>
            <DataRow label="Segundo apellido" edit={edit} display={row.lastName2}>
              <Input name="lastName2" className="h-8" defaultValue={row.lastName2 ?? ""} />
            </DataRow>
            <DataRow label="Nombre" edit={edit} display={row.firstName}>
              <Input name="firstName" className="h-8" defaultValue={row.firstName} required />
            </DataRow>
            <DataRow label="Sexo" edit={edit} display={sexLabel}>
              <Select value={sex || NO_VALUE} onValueChange={(v) => setSex(v === NO_VALUE ? "" : v)}>
                <SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VALUE}>Sin especificar</SelectItem>
                  <SelectItem value="FEMALE">Mujer</SelectItem>
                  <SelectItem value="MALE">Hombre</SelectItem>
                </SelectContent>
              </Select>
            </DataRow>
            <DataRow
              label="Fecha de nacimiento"
              edit={edit}
              display={row.birthDate ? (
                <span>
                  {new Date(row.birthDate).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
                  {age !== null && <span className="ml-1.5 text-muted-foreground">({age} años)</span>}
                </span>
              ) : ""}
            >
              <Input name="birthDate" type="date" className="h-8" defaultValue={row.birthDate ?? ""} />
            </DataRow>
            <DataRow label="Profesión" edit={edit} display={row.profession}>
              <Input name="profession" className="h-8" defaultValue={row.profession ?? ""} />
            </DataRow>

            <DataBlock
              label="Alergias"
              edit={edit}
              display={row.allergies ? <span className="text-[#B31412]">{row.allergies}</span> : ""}
            >
              <Textarea name="allergies" rows={2} className="resize-none" placeholder="Alergias e intolerancias conocidas" defaultValue={row.allergies ?? ""} />
            </DataBlock>
            <DataBlock label="Observaciones" edit={edit} display={row.notes}>
              <Textarea name="notes" rows={3} className="resize-none" defaultValue={row.notes ?? ""} />
            </DataBlock>
          </DataCard>
        </div>

        {/* ── Columna derecha ── */}
        <div className="space-y-3">
          <DataCard title="Contacto">
            <DataRow label="Teléfono" edit={edit} display={phoneDisplay(row.phone, row.phoneLabel)}>
              <div className="flex gap-2">
                <Input
                  aria-label="Prefijo" className="h-8 w-16 shrink-0 tabular-nums"
                  placeholder={DEFAULT_PHONE_PREFIX}
                  value={phone.prefix} onChange={(e) => setPhone({ ...phone, prefix: e.target.value })}
                />
                <Input
                  aria-label="Teléfono"
                  className={cn("h-8 min-w-0 flex-1", phone.national !== "" && !phoneOk && "border-destructive focus-visible:ring-destructive")}
                  placeholder="600 111 222"
                  value={phone.national} onChange={(e) => setPhone(withNational(phone, e.target.value))} required
                />
                <span className="shrink-0" title={phoneOk ? LABEL_HINT : LABEL_BLOCKED}>
                  <Input
                    name="phoneLabel" className="h-8 w-28 shrink-0 disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground"
                    placeholder="Etiqueta"
                    disabled={!phoneOk}
                    defaultValue={row.phoneLabel ?? ""}
                  />
                </span>
              </div>
            </DataRow>
            <DataRow label="Teléfono 2" edit={edit} display={phoneDisplay(row.phone2, row.phone2Label)}>
              <div className="flex gap-2">
                <Input
                  aria-label="Prefijo del teléfono 2" className="h-8 w-16 shrink-0 tabular-nums"
                  placeholder={DEFAULT_PHONE_PREFIX}
                  value={phone2.prefix} onChange={(e) => setPhone2({ ...phone2, prefix: e.target.value })}
                />
                <Input
                  aria-label="Teléfono 2"
                  className={cn("h-8 min-w-0 flex-1", phone2.national !== "" && !phone2Ok && "border-destructive focus-visible:ring-destructive")}
                  placeholder="611 222 333"
                  value={phone2.national} onChange={(e) => setPhone2(withNational(phone2, e.target.value))}
                />
                <span className="shrink-0" title={phone2Ok ? LABEL_HINT : LABEL_BLOCKED}>
                  <Input
                    name="phone2Label" className="h-8 w-28 shrink-0 disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground"
                    placeholder="Etiqueta"
                    disabled={!phone2Ok}
                    defaultValue={row.phone2Label ?? ""}
                  />
                </span>
              </div>
            </DataRow>
            <DataRow label="Email" edit={edit} display={row.email}>
              <Input name="email" type="email" className="h-8" defaultValue={row.email ?? ""} />
            </DataRow>
            <DataRow label="Dirección" edit={edit} display={row.address}>
              <Input name="address" className="h-8" placeholder="Calle Mayor 24, 3ºB, Albacete (02001)" defaultValue={row.address ?? ""} />
            </DataRow>
            <DataRow label="Nos ha conocido" edit={edit} display={referralLabel}>
              <Select value={referral || NO_VALUE} onValueChange={(v) => setReferral(v === NO_VALUE ? "" : v)}>
                <SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VALUE}>Sin especificar</SelectItem>
                  {(Object.keys(REFERRAL_SOURCE_META) as ReferralSource[]).map((k) => (
                    <SelectItem key={k} value={k}>{REFERRAL_SOURCE_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataRow>
          </DataCard>

          <DataCard title="Expediente">
            <DataRow
              label="Nº de expediente"
              edit={false}
              display={<span className="font-semibold tabular-nums">{formatFileNumber(row.fileNumber)}</span>}
            />
            <DataRow
              label="Fecha de alta"
              edit={false}
              display={new Date(row.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
            />
          </DataCard>

          <DataCard title="Configuración">
            <DataRow
              label="Recordatorios WhatsApp"
              edit={edit}
              display={row.whatsappOptIn
                ? <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" /> Sí</Badge>
                : <Badge variant="outline" className="gap-1 text-muted-foreground"><X className="h-3 w-3" /> No</Badge>}
            >
              <Switch name="whatsappOptIn" defaultChecked={row.whatsappOptIn} />
            </DataRow>
            <DataRow
              label="Cliente activo"
              edit={edit}
              display={
                <Badge variant="outline" className={cn("gap-1", ACTIVITY_BADGE[getActivityStatus(row)].className)}>
                  {ACTIVITY_BADGE[getActivityStatus(row)].icon} {ACTIVITY_BADGE[getActivityStatus(row)].label}
                </Badge>
              }
            >
              <Switch name="active" defaultChecked={row.active} />
            </DataRow>
          </DataCard>
        </div>

      </div>
    </form>
  )
}

/* ─── Profile fullscreen view ────────────────────────────────────────────── */

type ProfileData = Awaited<ReturnType<typeof getClientProfile>>
type ReminderData = Awaited<ReturnType<typeof getCustomerReminders>>

type ProfileTab = "datos" | "citas" | "recordatorios" | "finanzas"


function ClientProfileView({
  row, isAdmin, onBack, onDelete,
}: {
  row: ClientRow
  isAdmin: boolean
  onBack: () => void
  onDelete: () => void
}) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ProfileTab>("datos")
  const [reminders, setReminders] = useState<ReminderData>([])
  const [remindersLoading, setRemindersLoading] = useState(true)
  const [newTitle, setNewTitle] = useState("")
  const [newDueDate, setNewDueDate] = useState("")
  const [newAlertDays, setNewAlertDays] = useState("7")
  const [savingReminder, setSavingReminder] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)

  useEffect(() => {
    getClientProfile(row.id).then((d) => { setData(d); setLoading(false) })
  }, [row.id])

  function reloadReminders() {
    setRemindersLoading(true)
    getCustomerReminders(row.id).then((rs) => { setReminders(rs); setRemindersLoading(false) })
  }

  useEffect(() => { reloadReminders() }, [row.id])

  async function addReminder(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim() || !newDueDate) {
      toast.error("Escribe el recordatorio y la fecha.")
      return
    }
    const fd = new FormData()
    fd.set("title", newTitle.trim())
    fd.set("dueDate", newDueDate)
    fd.set("alertDaysBefore", newAlertDays)
    setSavingReminder(true)
    const res = await createCustomerReminder(row.id, fd)
    setSavingReminder(false)
    if (res.ok) {
      toast.success("Recordatorio creado.")
      setNewTitle(""); setNewDueDate(""); setNewAlertDays("7")
      reloadReminders()
    } else {
      toast.error(res.error ?? "Error al crear el recordatorio.")
    }
  }

  async function markComplete(id: string) {
    setCompletingId(id)
    const res = await completeCustomerReminder(id)
    setCompletingId(null)
    if (res.ok) {
      toast.success("Recordatorio completado.")
      reloadReminders()
    } else {
      toast.error(res.error ?? "Error al completar el recordatorio.")
    }
  }

  const movements = data?.movements ?? []
  const sales = data?.recentSales ?? []
  const appointments = data?.appointments ?? []
  const balance = data?.customer?.balanceCents ?? row.balanceCents
  const age = row.birthDate
    ? Math.floor((Date.now() - new Date(row.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null
  const fullLastName = [row.lastName, row.lastName2].filter(Boolean).join(" ")
  const pendingReminders = reminders.filter((r) => !r.completedAt)
  const completedReminders = reminders.filter((r) => r.completedAt)

  const TABS: { key: ProfileTab; label: string }[] = [
    { key: "datos",         label: "Datos de Cliente" },
    { key: "citas",         label: `Citas${appointments.length ? ` (${appointments.length})` : ""}` },
    { key: "recordatorios", label: `Recordatorios${pendingReminders.length ? ` (${pendingReminders.length})` : ""}` },
    { key: "finanzas",      label: "Finanzas" },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b bg-background shrink-0">
        <div className="flex items-start gap-4 px-6 pt-3 pb-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
              Ficha Cliente · Expediente {formatFileNumber(row.fileNumber)}
            </p>
            <h1 className="text-xl font-semibold leading-tight">
              {fullLastName ? `${fullLastName}, ${row.firstName}` : row.firstName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{formatPhone(row.phone)}</span>
              {row.email && <span>{row.email}</span>}
              {age !== null && <span>{age} años</span>}
              {row.whatsappOptIn
                ? <Badge variant="secondary" className="gap-1 text-xs py-0"><Check className="h-3 w-3" /> WhatsApp</Badge>
                : <Badge variant="outline" className="gap-1 text-xs py-0 text-muted-foreground"><X className="h-3 w-3" /> Sin WhatsApp</Badge>
              }
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-0 px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && tab !== "datos" ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Cargando…</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Datos de Cliente ── */}
          {tab === "datos" && (
            <ClientDataTab row={row} isAdmin={isAdmin} onDelete={onDelete} />
          )}

          {/* ── Citas ── */}
          {tab === "citas" && (
            <div className="max-w-2xl space-y-2 text-sm">
              {appointments.length === 0 ? (
                <p className="text-muted-foreground">Sin citas registradas.</p>
              ) : appointments.map((a) => {
                const date = new Date(a.startAt).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
                const time = new Date(a.startAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                return (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-muted-foreground min-w-[140px] capitalize">
                        {date} · {time}
                      </div>
                      <div>
                        <p className="font-medium">{a.service.name}</p>
                        <p className="text-xs text-muted-foreground">{a.worker.name} · {a.cabin.name} · {a.durationMinutes} min</p>
                      </div>
                    </div>
                    <span className={cn("text-xs font-medium", STATUS_META[a.status as AppointmentStatus]?.text ?? "")}>
                      {STATUS_META[a.status as AppointmentStatus]?.label ?? a.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Recordatorios ── */}
          {tab === "recordatorios" && (
            <div className="max-w-xl space-y-6 text-sm">
              <form onSubmit={addReminder} className="rounded-xl border p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nuevo recordatorio</p>
                <div className="space-y-1.5">
                  <Label htmlFor="reminder-title">Nota / recordatorio</Label>
                  <Textarea
                    id="reminder-title"
                    placeholder="Ej. Se hizo un láser, cita de seguimiento en 6 meses"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="reminder-due">Fecha del recordatorio</Label>
                    <Input
                      id="reminder-due"
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                    />
                  </div>
                  <div className="w-40 space-y-1.5">
                    <Label htmlFor="reminder-days">Avisar con (días)</Label>
                    <Input
                      id="reminder-days"
                      type="number"
                      min={0}
                      value={newAlertDays}
                      onChange={(e) => setNewAlertDays(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={savingReminder} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Añadir recordatorio
                </Button>
              </form>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pendientes</p>
                {remindersLoading ? (
                  <p className="text-xs text-muted-foreground">Cargando…</p>
                ) : pendingReminders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin recordatorios pendientes.</p>
                ) : pendingReminders.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <Bell className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                      <div className="min-w-0">
                        <p className="font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Vence el {new Date(r.dueDate).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
                          {" · "}avisa {r.alertDaysBefore} días antes
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="sm" className="shrink-0 gap-1"
                      disabled={completingId === r.id}
                      onClick={() => markComplete(r.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Completar
                    </Button>
                  </div>
                ))}
              </div>

              {completedReminders.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completados</p>
                  {completedReminders.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 rounded-xl border px-4 py-3 opacity-60">
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                      <div className="min-w-0">
                        <p className="font-medium line-through">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Vencía el {new Date(r.dueDate).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
                        </p>
                        {r.completedAt && (
                          <p className="text-xs text-muted-foreground">
                            Completado{r.completedByUser ? ` por ${r.completedByUser.name}${r.completedByUser.lastName ? ` ${r.completedByUser.lastName}` : ""}` : ""}
                            {" el "}
                            {new Date(r.completedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
                            {" a las "}
                            {new Date(r.completedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Finanzas ── */}
          {tab === "finanzas" && (
            <div className="max-w-4xl grid grid-cols-2 gap-6 text-sm">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Movimientos de saldo</p>
                {movements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin movimientos.</p>
                ) : movements.map((m) => {
                  const meta = MOV_META[m.type] ?? { label: m.type, sign: "", cls: "" }
                  const date = new Date(m.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <span className={cn("font-medium", meta.cls)}>{meta.label}</span>
                        <span className="text-muted-foreground ml-2">{date}</span>
                        {m.notes && <span className="text-muted-foreground ml-1">· {m.notes}</span>}
                      </div>
                      <span className={cn("font-semibold tabular-nums ml-3 shrink-0", meta.cls)}>
                        {meta.sign}{fmtEur(Math.abs(m.amountCents))}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Últimas ventas</p>
                {sales.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin ventas registradas.</p>
                ) : sales.map((s) => {
                  const date = new Date(s.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                  const statusCls = s.status === "PAID" ? "text-green-700" : "text-red-600"
                  const statusLabel = s.status === "PAID" ? "Pagado" : "Debido"
                  return (
                    <div key={s.id} className="rounded-xl border p-3 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">{date} · {s.user.name}</span>
                        <span className={cn("text-xs font-medium", statusCls)}>{statusLabel}</span>
                      </div>
                      <div className="space-y-0.5">
                        {s.lines.map((l, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="truncate text-muted-foreground">{l.description}</span>
                            <span className="tabular-nums ml-2 shrink-0">{fmtEur(l.totalCents)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between border-t pt-1 font-medium text-xs">
                        <span>Total</span>
                        <span className="tabular-nums">{fmtEur(s.totalCents)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════════════════ */

export function ClientsClient({
  rows, inactivityWarningDays, isAdmin,
}: {
  rows: ClientRow[]
  inactivityWarningDays: number
  isAdmin: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | ActivityStatus | "warning">("all")
  const [panelOpen, setPanelOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null)
  const [newSex, setNewSex] = useState("")
  const [newReferral, setNewReferral] = useState("")
  const [newPhone, setNewPhone] = useState<PhoneFields>(EMPTY_PHONE)
  const [newPhone2, setNewPhone2] = useState<PhoneFields>(EMPTY_PHONE)
  // Misma regla que en la ficha: sin teléfono válido no hay etiqueta.
  const newPhoneJoined = joinPhone(newPhone.prefix, newPhone.national)
  const newPhone2Joined = joinPhone(newPhone2.prefix, newPhone2.national)
  const newPhoneOk = isValidPhone(newPhoneJoined)
  const newPhone2Ok = newPhone2.national.trim() !== "" && isValidPhone(newPhone2Joined)
  // Se guarda el id y no la fila entera: así, al guardar cambios en la ficha,
  // el router.refresh() trae los datos nuevos y la ficha se repinta sola.
  const [profileId, setProfileId] = useState<string | null>(null)
  const profileRow = profileId ? rows.find((r) => r.id === profileId) ?? null : null

  useEffect(() => {
    const openId = new URLSearchParams(window.location.search).get("open")
    if (!openId) return
    if (rows.some((r) => r.id === openId)) setProfileId(openId)
    router.replace("/clients")
  }, [rows, router])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return rows.filter((r) => {
      const nameWords = normalizeSearch(`${r.lastName ?? ""} ${r.lastName2 ?? ""} ${r.firstName}`).split(/\s+/).filter(Boolean)
      // Los teléfonos se guardan en formato internacional (+34600111222), así que
      // se comparan solo los dígitos y por inclusión: buscar "600" encuentra el
      // número aunque esté guardado con el prefijo del país delante.
      const phoneDigits = [r.phone, r.phone2].filter(Boolean).map((p) => onlyDigits(String(p)))
      const fileNumber = formatFileNumber(r.fileNumber)
      const tokens = q.split(/\s+/).filter(Boolean)
      const matchesSearch =
        !q ||
        tokens.every((t) => {
          const digits = onlyDigits(t)
          const byName = nameWords.some((w) => w.startsWith(t))
          const byPhone = digits.length > 0 && phoneDigits.some((p) => p.includes(digits))
          // El expediente se busca tal cual ("0042") o sin ceros ("42").
          const byFileNumber =
            digits.length > 0 && (fileNumber === digits.padStart(4, "0") || String(r.fileNumber) === String(Number(digits)))
          return byName || byPhone || byFileNumber
        })
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "warning" ? hasInactivityWarning(r, inactivityWarningDays) : getActivityStatus(r) === statusFilter)
      return matchesSearch && matchesStatus
    })
  }, [rows, search, statusFilter, inactivityWarningDays])

  const { sort, sorted, toggleSort } = useTableSort<ClientRow, ClientSortKey>(
    filtered, CLIENT_SORTERS, CLIENT_SORT_INICIAL,
  )

  function openNew() {
    setNewSex(""); setNewReferral("")
    setNewPhone(EMPTY_PHONE)
    setNewPhone2(EMPTY_PHONE)
    setPanelOpen(true)
  }
  function closePanel() { setPanelOpen(false) }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (!newPhoneOk) {
      toast.error("Teléfono no válido. Ejemplo: 600 111 222.")
      return
    }
    if (newPhone2.national.trim() !== "" && !newPhone2Ok) {
      toast.error("El segundo teléfono no es válido.")
      return
    }
    // Prefijo y número se juntan aquí, que es como se guarda el teléfono.
    fd.set("phone", newPhoneJoined)
    fd.set("phone2", newPhone2Joined)
    fd.set("sex", newSex)
    fd.set("referralSource", newReferral)
    setLoading(true)
    const res = await saveCustomer(null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Cliente creado.")
      closePanel()
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al guardar.")
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const res = await deleteCustomer(deleteTarget.id)
    setDeleteTarget(null)
    if (res.ok) {
      toast.success("Cliente borrado.")
      setProfileId(null)
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al borrar.")
    }
  }

  const counts = useMemo(() => ({
    active:   rows.filter((r) => getActivityStatus(r) === "active").length,
    inactive: rows.filter((r) => getActivityStatus(r) === "inactive").length,
    warning:  rows.filter((r) => hasInactivityWarning(r, inactivityWarningDays)).length,
  }), [rows, inactivityWarningDays])

  const deleteDialog = (
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#B31412]" /> ¿Borrar cliente?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Vas a borrar a{" "}
            <span className="font-medium text-foreground">{deleteTarget?.firstName} {deleteTarget?.lastName}</span>.
            Esta acción no se puede deshacer. Solo es posible si el cliente no tiene citas registradas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="bg-[#B31412] hover:bg-[#8B0000] text-white" onClick={confirmDelete}>
            Sí, borrar cliente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (profileRow) {
    return (
      <>
        <ClientProfileView
          row={profileRow}
          isAdmin={isAdmin}
          onBack={() => setProfileId(null)}
          onDelete={() => setDeleteTarget(profileRow)}
        />
        {deleteDialog}
      </>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">{rows.length} clientes registrados</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="min-w-0 flex-1 space-y-4 overflow-auto p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre, teléfono o expediente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({rows.length})</SelectItem>
                <SelectItem value="active">Activos ({counts.active})</SelectItem>
                <SelectItem value="inactive">Inactivos ({counts.inactive})</SelectItem>
                <SelectItem value="warning">Con aviso ({counts.warning})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="expediente" sort={sort} onToggle={toggleSort}>Expediente</SortableTableHead>
                  <SortableTableHead sortKey="nombre" sort={sort} onToggle={toggleSort}>Apellidos, Nombre</SortableTableHead>
                  <SortableTableHead sortKey="telefono" sort={sort} onToggle={toggleSort}>Teléfono</SortableTableHead>
                  <SortableTableHead sortKey="nacimiento" sort={sort} onToggle={toggleSort}>Nacimiento</SortableTableHead>
                  <SortableTableHead sortKey="whatsapp" sort={sort} onToggle={toggleSort}>WhatsApp</SortableTableHead>
                  <SortableTableHead sortKey="ultimaCita" sort={sort} onToggle={toggleSort}>Última cita</SortableTableHead>
                  <SortableTableHead sortKey="saldo" sort={sort} onToggle={toggleSort}>Saldo</SortableTableHead>
                  <SortableTableHead sortKey="deuda" sort={sort} onToggle={toggleSort}>Deuda</SortableTableHead>
                  <SortableTableHead sortKey="estado" sort={sort} onToggle={toggleSort}>Estado</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => {
                  const status = getActivityStatus(r)
                  const badge = ACTIVITY_BADGE[status]
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setProfileId(r.id)}
                    >
                      <TableCell className="font-medium tabular-nums text-muted-foreground">
                        {formatFileNumber(r.fileNumber)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {hasInactivityWarning(r, inactivityWarningDays) && (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#E65100]" />
                          )}
                          {r.lastName ? `${r.lastName}${r.lastName2 ? ` ${r.lastName2}` : ""}, ${r.firstName}` : r.firstName}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="tabular-nums">{formatPhone(r.phone)}</div>
                        {r.phone2 && <div className="text-xs tabular-nums">{formatPhone(r.phone2)}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.birthDate
                          ? new Date(r.birthDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {r.whatsappOptIn ? (
                          <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" /> Sí</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-muted-foreground"><X className="h-3 w-3" /> No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.lastAppointment ?? "—"}
                        {r.daysSinceLastAppt !== null && (
                          <span className="ml-1 text-xs opacity-60">({r.daysSinceLastAppt}d)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.balanceCents > 0 ? (
                          <span className="text-sm font-medium tabular-nums text-green-700">+{fmtEur(r.balanceCents)}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.debtCents > 0 ? (
                          <span className="text-sm font-medium tabular-nums text-red-600">−{fmtEur(r.debtCents)}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1", badge.className)}>
                          {badge.icon} {badge.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Fondo oscurecido del panel de alta */}
        {panelOpen && (
          <div className="fixed inset-0 z-40 bg-black/30" onClick={closePanel} aria-hidden="true" />
        )}

        {/* Panel de alta. La edición vive en la ficha del cliente. */}
        {panelOpen && (
          <aside
            className={cn(
              "flex w-full flex-col border-l bg-card shadow-xl",
              "fixed inset-y-0 right-0 z-50 max-w-xl",
            )}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Nuevo cliente</h2>
              <Button variant="ghost" size="icon" onClick={closePanel}><X className="h-4 w-4" /></Button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Identidad */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Datos personales</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Primer apellido</Label>
                    <Input id="lastName" name="lastName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName2">Segundo apellido</Label>
                    <Input id="lastName2" name="lastName2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nombre</Label>
                  <Input id="firstName" name="firstName" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Fecha de nacimiento</Label>
                    <Input id="birthDate" name="birthDate" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>Sexo</Label>
                    <Select value={newSex || NO_VALUE} onValueChange={(v) => setNewSex(v === NO_VALUE ? "" : v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VALUE}>Sin especificar</SelectItem>
                        <SelectItem value="FEMALE">Mujer</SelectItem>
                        <SelectItem value="MALE">Hombre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profession">Profesión</Label>
                  <Input id="profession" name="profession" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allergies">Alergias</Label>
                  <Textarea id="allergies" name="allergies" rows={2} className="resize-none" placeholder="Alergias e intolerancias conocidas" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observaciones</Label>
                  <Textarea id="notes" name="notes" rows={3} className="resize-none" placeholder="Preferencias, notas internas…" />
                </div>
              </div>

              {/* Contacto */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contacto</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-[1fr_11rem] gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <div className="flex gap-2">
                      <Input
                        aria-label="Prefijo" className="w-16 shrink-0 tabular-nums"
                        placeholder={DEFAULT_PHONE_PREFIX}
                        value={newPhone.prefix}
                        onChange={(e) => setNewPhone({ ...newPhone, prefix: e.target.value })}
                      />
                      <Input
                        id="phone" placeholder="600 111 222" required
                        className={cn("min-w-0 flex-1", newPhone.national !== "" && !newPhoneOk && "border-destructive focus-visible:ring-destructive")}
                        value={newPhone.national}
                        onChange={(e) => setNewPhone(withNational(newPhone, e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phoneLabel">Etiqueta</Label>
                    <span className="block" title={newPhoneOk ? LABEL_HINT : LABEL_BLOCKED}>
                      <Input
                        id="phoneLabel" name="phoneLabel" className="disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground"
                        placeholder="personal, trabajo, madre…"
                        disabled={!newPhoneOk}
                      />
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_11rem] gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="phone2">Teléfono 2 <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <div className="flex gap-2">
                      <Input
                        aria-label="Prefijo del teléfono 2" className="w-16 shrink-0 tabular-nums"
                        placeholder={DEFAULT_PHONE_PREFIX}
                        value={newPhone2.prefix}
                        onChange={(e) => setNewPhone2({ ...newPhone2, prefix: e.target.value })}
                      />
                      <Input
                        id="phone2" placeholder="611 222 333"
                        className={cn("min-w-0 flex-1", newPhone2.national !== "" && !newPhone2Ok && "border-destructive focus-visible:ring-destructive")}
                        value={newPhone2.national}
                        onChange={(e) => setNewPhone2(withNational(newPhone2, e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone2Label">Etiqueta</Label>
                    <span className="block" title={newPhone2Ok ? LABEL_HINT : LABEL_BLOCKED}>
                      <Input
                        id="phone2Label" name="phone2Label" className="disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground"
                        placeholder="personal, trabajo, madre…"
                        disabled={!newPhone2Ok}
                      />
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input id="address" name="address" placeholder="Calle Mayor 24, 3ºB, Albacete (02001)" />
                </div>
                <div className="space-y-2">
                  <Label>Cómo nos ha conocido</Label>
                  <Select value={newReferral || NO_VALUE} onValueChange={(v) => setNewReferral(v === NO_VALUE ? "" : v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_VALUE}>Sin especificar</SelectItem>
                      {(Object.keys(REFERRAL_SOURCE_META) as ReferralSource[]).map((k) => (
                        <SelectItem key={k} value={k}>{REFERRAL_SOURCE_META[k].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Configuración */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Configuración</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="whatsappOptIn">Recordatorios por WhatsApp</Label>
                    <p className="text-xs text-muted-foreground">Consentimiento del cliente</p>
                  </div>
                  <Switch id="whatsappOptIn" name="whatsappOptIn" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="active">Cliente activo</Label>
                    <p className="text-xs text-muted-foreground">Desactiva para marcarlo como inactivo manualmente</p>
                  </div>
                  <Switch id="active" name="active" defaultChecked />
                </div>
              </div>
            </form>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
              <Button type="button" variant="outline" onClick={closePanel}>Cancelar</Button>
              <Button type="button" onClick={(e) => {
                const form = (e.currentTarget as HTMLElement).closest("aside")?.querySelector("form")
                form?.requestSubmit()
              }} disabled={loading}>
                {loading ? "Guardando…" : "Crear cliente"}
              </Button>
            </div>
          </aside>
        )}
      </div>

      {deleteDialog}
    </div>
  )
}

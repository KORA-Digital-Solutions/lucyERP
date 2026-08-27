"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Search, Pencil, Trash2, Check, X, UserCheck, UserX, AlertTriangle,
  FileText, Wallet, ShoppingCart, ArrowLeft, Bell, CheckCircle2, RotateCcw, Pin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  saveCustomer, getClientProfile, getCustomerConsumption,
  getCustomerReminders, createCustomerReminder, completeCustomerReminder,
  deleteCustomerReminder, reopenCustomerReminder,
} from "@/lib/actions"
import {
  DEFAULT_PHONE_PREFIX, formatFileNumber, formatPhone, isValidPhone,
  isValidPhonePrefix, joinPhone, normalizeSearch, phoneFields, withNational,
} from "@/lib/format"
import {
  STATUS_META, CUSTOMER_SEX_META, REFERRAL_SOURCE_META,
  type AppointmentStatus, type CustomerSex, type ReferralSource,
} from "@/lib/enums"
import {
  isReminderOverdue, reminderCompleteLabel, reminderCompletedMessage,
  reminderCompletedVerb, REMINDER_TONE,
} from "@/lib/reminders"
import {
  useTableSort, SortableTableHead, byText, byNumber, byDate,
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

export type ActivityStatus = "active" | "inactive"

export function getActivityStatus(row: ClientRow): ActivityStatus {
  return row.active ? "active" : "inactive"
}

export const ACTIVITY_BADGE: Record<ActivityStatus, { label: string; className: string; icon: React.ReactNode }> = {
  active:   { label: "Activo",   className: "bg-[#E6F4EA] text-[#1E6B34] border-[#A8D5B5]", icon: <UserCheck className="h-3 w-3" /> },
  inactive: { label: "Inactivo", className: "bg-[#F5F5F5] text-[#757575] border-[#E0E0E0]", icon: <UserX className="h-3 w-3" /> },
}

// Edad cumplida, contando el mes y el día: aproximarla dividiendo por 365.25
// falla justo en los días alrededor del cumpleaños, que es cuando más canta.
export function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age--
  return age < 0 ? null : age
}

export function fmtEur(cents: number) {
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
export const NO_VALUE = "__none__"

export const LABEL_HINT = "De quién es el teléfono: personal, trabajo, madre…"
export const LABEL_BLOCKED = "Escribe antes un teléfono válido"

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

function ClientDataTab({
  row, isAdmin, onDelete, readOnly = false,
}: {
  row: ClientRow
  isAdmin: boolean
  onDelete?: () => void
  readOnly?: boolean
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
  const phonePrefixOk = isValidPhonePrefix(phone.prefix)
  const phone2PrefixOk = isValidPhonePrefix(phone2.prefix)
  const phoneOk = phonePrefixOk && isValidPhone(joinPhone(phone.prefix, phone.national))
  const phone2Ok =
    phone2PrefixOk && phone2.national.trim() !== "" && isValidPhone(joinPhone(phone2.prefix, phone2.national))

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
    if (!phonePrefixOk || !phone2PrefixOk) {
      toast.error("El prefijo del teléfono no es válido. Ejemplo: +34.")
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
    // Prefijo y número viajan por separado y los junta el servidor, que es el
    // único sitio donde se puede comprobar el prefijo: en "+9999600111222" ya
    // no hay forma de saber dónde acababa.
    fd.set("phonePrefix", phone.prefix)
    fd.set("phone", phone.national)
    fd.set("phone2Prefix", phone2.prefix)
    fd.set("phone2", phone2.national)
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

  const age = getAge(row.birthDate)
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
            {isAdmin && !readOnly && onDelete && (
              <Button
                type="button" variant="ghost" size="sm"
                className="mr-auto gap-1.5 text-[#B31412] hover:bg-[#FCE8E6] hover:text-[#B31412]"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Borrar cliente
              </Button>
            )}
            {!readOnly && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
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
                  aria-label="Prefijo"
                  className={cn("h-8 w-16 shrink-0 tabular-nums", !phonePrefixOk && "border-destructive focus-visible:ring-destructive")}
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
                  aria-label="Prefijo del teléfono 2"
                  className={cn("h-8 w-16 shrink-0 tabular-nums", !phone2PrefixOk && "border-destructive focus-visible:ring-destructive")}
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

/* ─── Pestaña "Total Servicios" ───────────────────────────────────────────
   Todo lo que se le ha cobrado alguna vez al cliente, en una tabla de solo
   lectura con el mismo comportamiento que el listado de clientes: cabeceras
   que ordenan y filtros encima.

   Una línea por concepto cobrado, no por ticket, que es como se leen los
   listados de servicios realizados de toda la vida: fecha, familia,
   descripción, descuento y total. */

type ConsumptionData = Awaited<ReturnType<typeof getCustomerConsumption>>

type ServiceRow = {
  key: string
  date: string
  family: string
  description: string
  quantity: number
  discountPercent: number
  totalCents: number
  ticketStatus: string
}

const SERVICE_SORTERS = {
  fecha: byDate<ServiceRow>((r) => r.date),
  familia: byText<ServiceRow>((r) => r.family),
  descripcion: byText<ServiceRow>((r) => r.description),
  uds: byNumber<ServiceRow>((r) => r.quantity),
  dto: byNumber<ServiceRow>((r) => r.discountPercent),
  total: byNumber<ServiceRow>((r) => r.totalCents),
}

type ServiceSortKey = keyof typeof SERVICE_SORTERS

// Lo más reciente primero, que es lo que se mira al abrir la ficha.
const SERVICE_SORT_INICIAL: SortRule<ServiceSortKey>[] = [{ key: "fecha", dir: "desc" }]

const TODAS_FAMILIAS = "__todas__"

function ClientServicesTab({ data }: { data: ConsumptionData | null }) {
  const [search, setSearch] = useState("")
  const [family, setFamily] = useState(TODAS_FAMILIAS)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  // Una fila por línea de venta.
  const rows = useMemo<ServiceRow[]>(() => {
    const out: ServiceRow[] = []
    for (const t of data?.tickets ?? []) {
      t.lines.forEach((l, i) => {
        out.push({
          key: `${t.id}-${i}`,
          date: t.date,
          family: l.family,
          description: l.description,
          quantity: l.quantity,
          discountPercent: l.discountPercent,
          totalCents: l.totalCents,
          ticketStatus: t.status,
        })
      })
    }
    return out
  }, [data])

  // Las familias del desplegable salen de lo que este cliente ha consumido, no
  // del catálogo entero: no tiene sentido ofrecerle filtrar por algo que nunca
  // se ha hecho.
  const familyCounts = useMemo(() => {
    const acc = new Map<string, number>()
    for (const r of rows) acc.set(r.family, (acc.get(r.family) ?? 0) + 1)
    return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"))
  }, [rows])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return rows.filter((r) => {
      const day = r.date.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (family !== TODAS_FAMILIAS && r.family !== family) return false
      if (q && !normalizeSearch(`${r.description} ${r.family}`).includes(q)) return false
      return true
    })
  }, [rows, search, family, from, to])

  const { sort, sorted, toggleSort } = useTableSort<ServiceRow, ServiceSortKey>(
    filtered, SERVICE_SORTERS, SERVICE_SORT_INICIAL,
  )

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, r) => sum + r.totalCents, 0),
    [filtered],
  )
  const hayFiltro = search !== "" || family !== TODAS_FAMILIAS || from !== "" || to !== ""

  function limpiarFiltros() {
    setSearch(""); setFamily(TODAS_FAMILIAS); setFrom(""); setTo("")
  }

  if (!data) return <p className="text-sm text-muted-foreground">Cargando…</p>

  if (rows.length === 0) {
    return (
      <div className="max-w-xl rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" />
        <p className="font-medium">Sin servicios registrados</p>
        <p className="mt-1 text-sm">Aquí aparecerá todo lo que se le cobre a este cliente.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] space-y-3">

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Buscar servicio o producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={family} onValueChange={setFamily}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Familia" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS_FAMILIAS}>Todas las familias ({rows.length})</SelectItem>
            {familyCounts.map(([f, n]) => (
              <SelectItem key={f} value={f}>{f} ({n})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label htmlFor="serv-desde" className="text-xs font-normal text-muted-foreground">Desde</Label>
          <Input id="serv-desde" type="date" className="h-9 w-[9.5rem]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Label htmlFor="serv-hasta" className="text-xs font-normal text-muted-foreground">Hasta</Label>
          <Input id="serv-hasta" type="date" className="h-9 w-[9.5rem]" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {hayFiltro && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Quitar filtros
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="fecha" sort={sort} onToggle={toggleSort}>Fecha</SortableTableHead>
              <SortableTableHead sortKey="familia" sort={sort} onToggle={toggleSort}>Familia</SortableTableHead>
              <SortableTableHead sortKey="descripcion" sort={sort} onToggle={toggleSort}>Descripción</SortableTableHead>
              <SortableTableHead sortKey="uds" sort={sort} onToggle={toggleSort} className="text-right">Uds</SortableTableHead>
              <SortableTableHead sortKey="dto" sort={sort} onToggle={toggleSort} className="text-right">Dto</SortableTableHead>
              <SortableTableHead sortKey="total" sort={sort} onToggle={toggleSort} className="text-right">Total</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(r.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                  {r.ticketStatus === "DEBT" && (
                    <span className="ml-2 text-xs text-[#B31412]">sin cobrar</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.family}</TableCell>
                <TableCell>{r.description}</TableCell>
                {/* Las unidades van siempre, aunque sea 1: si solo se pintan
                    cuando hay varias, la columna se queda vacía y parece rota.
                    El descuento sí se oculta a 0, que es lo pedido. */}
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.quantity}
                </TableCell>
                {/* El descuento solo se enseña cuando lo hay, como en los
                    listados de servicios realizados de siempre. */}
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.discountPercent > 0 ? `${r.discountPercent}%` : ""}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtEur(r.totalCents)}</TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Sin resultados con estos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Total de lo que se está viendo. Cuando hay filtros se recuerda además
          el total de todo, para no perder la referencia. */}
      <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 rounded-xl border bg-muted/20 px-4 py-3">
        <span className="mr-auto text-xs text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "línea" : "líneas"}
        </span>
        {hayFiltro && (
          <span className="text-xs text-muted-foreground">
            de {fmtEur(data?.totalCents ?? 0)} en total
          </span>
        )}
        <span className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {hayFiltro ? "Total filtrado" : "Total"}
          </span>
          <span className="text-2xl font-bold tabular-nums">{fmtEur(filteredTotal)}</span>
        </span>
      </div>
    </div>
  )
}

/* ─── Profile fullscreen view ────────────────────────────────────────────── */

type ProfileData = Awaited<ReturnType<typeof getClientProfile>>
type ReminderData = Awaited<ReturnType<typeof getCustomerReminders>>

function formatReminderDate(date: Date | string | null): string {
  if (!date) return "sin fecha"
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
}

// Completar y borrar son lo mismo para permanentes y para los que vencen, así
// que la botonera es una sola. Completar deja el recordatorio en el histórico
// de la ficha; borrar lo quita de en medio para siempre. Lo único que cambia
// es cómo se llama: ver reminderCompleteLabel.
function ReminderActions({ onComplete, onDelete, busy, dueDate }: {
  onComplete: () => void
  onDelete: () => void
  busy: boolean
  dueDate: Date | string | null
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" className="gap-1" disabled={busy} onClick={onComplete}>
        <CheckCircle2 className="h-4 w-4" /> {reminderCompleteLabel(dueDate)}
      </Button>
      <Button
        variant="ghost" size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-[#B31412]"
        title="Borrar recordatorio"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

/* ─── Pestaña "Citas" ─────────────────────────────────────────────────────
   Historial de agenda del cliente, en el mismo formato de tabla que el
   listado de clientes y que Total Servicios: cabeceras que ordenan y filtros
   encima. Aquí se ve cuándo vino y con quién —incluidas las canceladas y las
   que no se presentó—, que es una pregunta distinta de qué se le cobró. */

type AppointmentRow = ProfileData["appointments"][number]

const APPOINTMENT_SORTERS = {
  fecha: byNumber<AppointmentRow>((r) => new Date(r.startAt).getTime()),
  servicio: byText<AppointmentRow>((r) => r.service.name),
  empleada: byText<AppointmentRow>((r) => r.worker.name),
  cabina: byText<AppointmentRow>((r) => r.cabin.name),
  duracion: byNumber<AppointmentRow>((r) => r.durationMinutes),
  estado: byText<AppointmentRow>((r) => STATUS_META[r.status as AppointmentStatus]?.label ?? r.status),
}

type AppointmentSortKey = keyof typeof APPOINTMENT_SORTERS

// La más reciente primero, que es lo que se mira al abrir la ficha.
const APPOINTMENT_SORT_INICIAL: SortRule<AppointmentSortKey>[] = [{ key: "fecha", dir: "desc" }]

const TODOS_ESTADOS = "__todos__"

function ClientAppointmentsTab({ appointments }: { appointments: AppointmentRow[] }) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(TODOS_ESTADOS)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  // Los estados del desplegable salen de las citas que tiene este cliente, no
  // del catálogo entero: no tiene sentido ofrecer filtrar por "No asistió" si
  // nunca ha faltado.
  const statusCounts = useMemo(() => {
    const acc = new Map<string, number>()
    for (const a of appointments) acc.set(a.status, (acc.get(a.status) ?? 0) + 1)
    return [...acc.entries()].sort((x, y) => y[1] - x[1])
  }, [appointments])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return appointments.filter((a) => {
      const day = new Date(a.startAt).toISOString().slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (status !== TODOS_ESTADOS && a.status !== status) return false
      if (q && !normalizeSearch(`${a.service.name} ${a.worker.name} ${a.cabin.name}`).includes(q)) return false
      return true
    })
  }, [appointments, search, status, from, to])

  const { sort, sorted, toggleSort } = useTableSort<AppointmentRow, AppointmentSortKey>(
    filtered, APPOINTMENT_SORTERS, APPOINTMENT_SORT_INICIAL,
  )

  const hayFiltro = search !== "" || status !== TODOS_ESTADOS || from !== "" || to !== ""

  function limpiarFiltros() {
    setSearch(""); setStatus(TODOS_ESTADOS); setFrom(""); setTo("")
  }

  if (appointments.length === 0) {
    return (
      <div className="max-w-xl rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <FileText className="mx-auto mb-3 h-8 w-8 opacity-30" />
        <p className="font-medium">Sin citas registradas</p>
        <p className="mt-1 text-sm">Aquí aparecerán todas las citas de este cliente.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] space-y-3">

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Buscar servicio, empleada o cabina…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_ESTADOS}>Todos los estados ({appointments.length})</SelectItem>
            {statusCounts.map(([st, n]) => (
              <SelectItem key={st} value={st}>
                {STATUS_META[st as AppointmentStatus]?.label ?? st} ({n})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label htmlFor="cita-desde" className="text-xs font-normal text-muted-foreground">Desde</Label>
          <Input id="cita-desde" type="date" className="h-9 w-[9.5rem]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Label htmlFor="cita-hasta" className="text-xs font-normal text-muted-foreground">Hasta</Label>
          <Input id="cita-hasta" type="date" className="h-9 w-[9.5rem]" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {hayFiltro && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Quitar filtros
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="fecha" sort={sort} onToggle={toggleSort}>Fecha</SortableTableHead>
              <SortableTableHead sortKey="servicio" sort={sort} onToggle={toggleSort}>Servicio</SortableTableHead>
              <SortableTableHead sortKey="empleada" sort={sort} onToggle={toggleSort}>Empleada</SortableTableHead>
              <SortableTableHead sortKey="cabina" sort={sort} onToggle={toggleSort}>Cabina</SortableTableHead>
              <SortableTableHead sortKey="duracion" sort={sort} onToggle={toggleSort} className="text-right">Duración</SortableTableHead>
              <SortableTableHead sortKey="estado" sort={sort} onToggle={toggleSort}>Estado</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((a) => {
              const inicio = new Date(a.startAt)
              const meta = STATUS_META[a.status as AppointmentStatus]
              return (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {/* Sin `capitalize`: en español los meses van en
                        minúscula, y así cuadra con Total Servicios. */}
                    {inicio.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {inicio.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{a.service.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.worker.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.cabin.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {a.durationMinutes} min
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("gap-1", meta?.className)}>
                      {meta?.label ?? a.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Sin resultados con estos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-baseline justify-between gap-4 rounded-xl border bg-muted/20 px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "cita" : "citas"}
          {hayFiltro && ` de ${appointments.length}`}
        </span>
      </div>
    </div>
  )
}

/* ─── Pestaña "Tto. Domiciliario" ─────────────────────────────────────────
   Los productos que se lleva el cliente a casa, agrupados por producto.

   No es Total Servicios filtrado: allí hay una fila por línea de venta y aquí
   una fila por producto, con lo que de verdad se pregunta en el mostrador
   —cuántos se ha llevado y cuándo fue la última vez—. El producto es un
   consumible que se repone; un servicio no.

   La media entre compras se enseña, pero solo con tres o más: con dos, la
   "media" es un número inventado. Y el aviso de a quién le toca reponer no
   vive aquí, sino en el módulo de informes, porque para eso hay que cruzar
   todos los clientes de una vez y no ir abriendo fichas. */

type HomeCareRow = {
  product: string
  /** Ocasiones de compra. No tiene columna, pero de aquí sale "Cada". */
  times: number
  units: number
  totalCents: number
  lastDate: string
  /** Días entre compras, solo si hay histórico suficiente. */
  everyDays: number | null
}

const HOME_CARE_SORTERS = {
  producto: byText<HomeCareRow>((r) => r.product),
  uds: byNumber<HomeCareRow>((r) => r.units),
  total: byNumber<HomeCareRow>((r) => r.totalCents),
  ultima: byNumber<HomeCareRow>((r) => new Date(r.lastDate).getTime()),
  cada: byNumber<HomeCareRow>((r) => r.everyDays),
}

type HomeCareSortKey = keyof typeof HOME_CARE_SORTERS

const HOME_CARE_SORT_INICIAL: SortRule<HomeCareSortKey>[] = [{ key: "ultima", dir: "desc" }]

function weeksSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 86_400_000))
}

function ClientHomeCareTab({ data }: { data: ConsumptionData | null }) {
  const rows = useMemo<HomeCareRow[]>(() => {
    // Fechas de cada compra por producto, para poder sacar la última y el
    // ritmo. Los tickets vienen del más reciente al más antiguo.
    const compras = new Map<string, { dates: string[]; units: number; totalCents: number }>()
    for (const t of data?.tickets ?? []) {
      for (const l of t.lines) {
        if (!l.productId) continue
        const prev = compras.get(l.description) ?? { dates: [], units: 0, totalCents: 0 }
        prev.dates.push(t.date)
        prev.units += l.quantity || 1
        prev.totalCents += l.totalCents
        compras.set(l.description, prev)
      }
    }

    return [...compras.entries()].map(([product, c]) => {
      const ms = c.dates.map((d) => new Date(d).getTime())
      const primera = Math.min(...ms)
      const ultima = Math.max(...ms)
      // Media entre compras: el tiempo total repartido entre los huecos que
      // hay, que son una menos que las compras. Se guarda en días y ya se
      // decide al pintarlo si se enseña en días o en semanas; redondear a
      // semanas aquí convertía en "~0 sem" a quien repone cada pocos días.
      const dias = Math.round((ultima - primera) / (c.dates.length - 1) / 86_400_000)
      const everyDays = c.dates.length >= 3 && dias >= 1 ? dias : null
      return {
        product,
        times: c.dates.length,
        units: c.units,
        totalCents: c.totalCents,
        lastDate: new Date(ultima).toISOString(),
        everyDays,
      }
    })
  }, [data])

  const { sort, sorted, toggleSort } = useTableSort<HomeCareRow, HomeCareSortKey>(
    rows, HOME_CARE_SORTERS, HOME_CARE_SORT_INICIAL,
  )

  const totalCents = useMemo(() => rows.reduce((sum, r) => sum + r.totalCents, 0), [rows])

  if (!data) return <p className="text-sm text-muted-foreground">Cargando…</p>

  if (rows.length === 0) {
    return (
      <div className="max-w-xl rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" />
        <p className="font-medium">Sin tratamiento domiciliario</p>
        <p className="mt-1 text-sm">Aquí aparecerán los productos que se lleve a casa.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] space-y-3">
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="producto" sort={sort} onToggle={toggleSort}>Producto</SortableTableHead>
              <SortableTableHead sortKey="uds" sort={sort} onToggle={toggleSort} className="text-right">Uds</SortableTableHead>
              <SortableTableHead sortKey="total" sort={sort} onToggle={toggleSort} className="text-right">Total</SortableTableHead>
              <SortableTableHead sortKey="ultima" sort={sort} onToggle={toggleSort}>Última compra</SortableTableHead>
              <SortableTableHead sortKey="cada" sort={sort} onToggle={toggleSort}>Tiempo entre compras</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              const semanas = weeksSince(r.lastDate)
              return (
                <TableRow key={r.product}>
                  <TableCell className="font-medium">{r.product}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.units}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(r.totalCents)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.lastDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {semanas === 0 ? "esta semana" : `hace ${semanas} sem`}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {r.everyDays === null
                      ? <span className="text-muted-foreground/50">—</span>
                      : r.everyDays < 14
                        ? `~${r.everyDays} ${r.everyDays === 1 ? "día" : "días"}`
                        : `~${Math.round(r.everyDays / 7)} sem`}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 rounded-xl border bg-muted/20 px-4 py-3">
        <span className="mr-auto text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "producto" : "productos"}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</span>
          <span className="text-2xl font-bold tabular-nums">{fmtEur(totalCents)}</span>
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        El tiempo medio entre compras solo se calcula a partir de la tercera: con dos
        compras no significa nada.
      </p>
    </div>
  )
}

type ProfileTab = "datos" | "citas" | "servicios" | "domiciliario" | "recordatorios" | "finanzas"


export function ClientProfileView({
  row, isAdmin, onBack, onDelete, embedded = false, readOnly = false,
}: {
  row: ClientRow
  isAdmin: boolean
  onBack: () => void
  onDelete?: () => void
  /**
   * La ficha se abre también dentro de un diálogo (desde el TPV). Ahí no manda
   * en la pantalla entera ni necesita su propio "Volver": el diálogo ya trae
   * su alto y su aspa para cerrar.
   */
  embedded?: boolean
  /**
   * Ficha de consulta: se ve todo pero no se toca nada — ni datos ni
   * recordatorios. Para cambiar algo se va a Clientes, que es donde se
   * gestiona al cliente.
   */
  readOnly?: boolean
}) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [consumption, setConsumption] = useState<ConsumptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ProfileTab>("datos")
  const [reminders, setReminders] = useState<ReminderData>([])
  const [remindersLoading, setRemindersLoading] = useState(true)
  const [newTitle, setNewTitle] = useState("")
  // Permanente = sin fecha. Arranca desactivado porque el caso corriente es el
  // "vuelve dentro de 3 meses"; el aviso de por vida es más raro.
  const [newPermanent, setNewPermanent] = useState(false)
  const [newDueDate, setNewDueDate] = useState("")
  const [newAlertDays, setNewAlertDays] = useState("7")
  const [savingReminder, setSavingReminder] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [reminderToDelete, setReminderToDelete] = useState<ReminderData[number] | null>(null)

  useEffect(() => {
    getClientProfile(row.id).then((d) => { setData(d); setLoading(false) })
  }, [row.id])

  useEffect(() => {
    setConsumption(null)
    getCustomerConsumption(row.id).then(setConsumption)
  }, [row.id])

  function reloadReminders() {
    setRemindersLoading(true)
    getCustomerReminders(row.id).then((rs) => { setReminders(rs); setRemindersLoading(false) })
  }

  useEffect(() => { reloadReminders() }, [row.id])

  async function addReminder(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) {
      toast.error("Escribe el recordatorio.")
      return
    }
    if (!newPermanent && !newDueDate) {
      toast.error("Indica la fecha, o márcalo como permanente.")
      return
    }
    const fd = new FormData()
    fd.set("title", newTitle.trim())
    fd.set("dueDate", newPermanent ? "" : newDueDate)
    fd.set("alertDaysBefore", newAlertDays)
    setSavingReminder(true)
    const res = await createCustomerReminder(row.id, fd)
    setSavingReminder(false)
    if (res.ok) {
      toast.success("Recordatorio creado.")
      setNewTitle(""); setNewPermanent(false); setNewDueDate(""); setNewAlertDays("7")
      reloadReminders()
    } else {
      toast.error(res.error ?? "Error al crear el recordatorio.")
    }
  }

  async function reopenReminder(id: string) {
    setCompletingId(id)
    const res = await reopenCustomerReminder(id)
    setCompletingId(null)
    if (res.ok) {
      toast.success("Recordatorio reabierto.")
      reloadReminders()
    } else {
      toast.error(res.error ?? "Error al reabrir el recordatorio.")
    }
  }

  async function confirmDeleteReminder() {
    if (!reminderToDelete) return
    const res = await deleteCustomerReminder(reminderToDelete.id)
    setReminderToDelete(null)
    if (res.ok) {
      toast.success("Recordatorio borrado.")
      reloadReminders()
    } else {
      toast.error(res.error ?? "Error al borrar el recordatorio.")
    }
  }

  async function markComplete(id: string) {
    const dueDate = reminders.find((r) => r.id === id)?.dueDate ?? null
    setCompletingId(id)
    const res = await completeCustomerReminder(id)
    setCompletingId(null)
    if (res.ok) {
      toast.success(reminderCompletedMessage(dueDate))
      reloadReminders()
    } else {
      toast.error(res.error ?? "Error al completar el recordatorio.")
    }
  }

  const movements = data?.movements ?? []
  const appointments = data?.appointments ?? []
  const balance = data?.customer?.balanceCents ?? row.balanceCents
  const age = getAge(row.birthDate)
  const fullLastName = [row.lastName, row.lastName2].filter(Boolean).join(" ")
  const pendingReminders = reminders.filter((r) => !r.completedAt)
  const permanentReminders = pendingReminders.filter((r) => r.dueDate === null)
  const datedReminders = pendingReminders.filter((r) => r.dueDate !== null)
  const completedReminders = reminders.filter((r) => r.completedAt)

  const TABS: { key: ProfileTab; label: string }[] = [
    { key: "datos",         label: "Datos de Cliente" },
    { key: "recordatorios", label: `Recordatorios${pendingReminders.length ? ` (${pendingReminders.length})` : ""}` },
    { key: "citas",         label: `Citas${appointments.length ? ` (${appointments.length})` : ""}` },
    { key: "servicios",     label: "Total Servicios" },
    { key: "domiciliario",  label: "Tto. Domiciliario" },
    { key: "finanzas",      label: "Finanzas" },
  ]

  return (
    <div className={cn("flex flex-col overflow-hidden bg-background", embedded ? "h-full" : "h-screen")}>
      {/* Header */}
      <div className="border-b bg-background shrink-0">
        <div className={cn("flex items-start gap-4 px-6 pt-3 pb-2", embedded && "pr-12")}>
          {!embedded && (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 mt-0.5 shrink-0">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
              Ficha Cliente · Expediente {formatFileNumber(row.fileNumber)}
              {readOnly && (
                <span className="ml-2 normal-case tracking-normal">
                  · Solo consulta, se modifica en Clientes
                </span>
              )}
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
            <ClientDataTab row={row} isAdmin={isAdmin} onDelete={onDelete} readOnly={readOnly} />
          )}

          {/* ── Citas ── */}
          {tab === "citas" && <ClientAppointmentsTab appointments={appointments} />}

          {/* ── Total Servicios ── */}
          {tab === "servicios" && <ClientServicesTab data={consumption} />}

          {/* ── Tto. Domiciliario ── */}
          {tab === "domiciliario" && <ClientHomeCareTab data={consumption} />}

          {/* ── Recordatorios ── */}
          {tab === "recordatorios" && (
            <div className="max-w-xl space-y-6 text-sm">
              {!readOnly && (
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
                <div className="flex items-start gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5">
                  <Switch
                    id="reminder-permanent"
                    className="mt-0.5"
                    checked={newPermanent}
                    onCheckedChange={setNewPermanent}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="reminder-permanent" className="font-normal">Permanente</Label>
                    <p className="text-xs text-muted-foreground">
                      Sin fecha. Salta siempre que se atienda a este cliente, hasta que se complete o se borre.
                    </p>
                  </div>
                </div>
                {!newPermanent && (
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
                )}
                <Button type="submit" size="sm" disabled={savingReminder} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Añadir recordatorio
                </Button>
              </form>
              )}

              {remindersLoading ? (
                <p className="text-xs text-muted-foreground">Cargando…</p>
              ) : pendingReminders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin recordatorios pendientes.</p>
              ) : (
                <>
                  {permanentReminders.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Permanentes ({permanentReminders.length})
                      </p>
                      {permanentReminders.map((r) => (
                        <div key={r.id} className={cn("flex items-start justify-between gap-3 rounded-xl border px-4 py-3", REMINDER_TONE.permanent.card)}>
                          <div className="flex items-start gap-2 min-w-0">
                            <Pin className={cn("h-4 w-4 shrink-0 mt-0.5", REMINDER_TONE.permanent.accent)} />
                            <div className="min-w-0">
                              <p className="font-medium">{r.title}</p>
                              <p className="text-xs text-muted-foreground">Avisa siempre · sin fecha de vencimiento</p>
                            </div>
                          </div>
                          {!readOnly && (
                            <ReminderActions
                              onComplete={() => markComplete(r.id)}
                              onDelete={() => setReminderToDelete(r)}
                              busy={completingId === r.id}
                              dueDate={r.dueDate}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {datedReminders.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Con fecha ({datedReminders.length})
                      </p>
                      {datedReminders.map((r) => {
                        const vencido = r.dueDate !== null && isReminderOverdue(new Date(r.dueDate), new Date())
                        return (
                          <div key={r.id} className={cn(
                            "flex items-start justify-between gap-3 rounded-xl border px-4 py-3",
                            REMINDER_TONE[vencido ? "overdue" : "due"].card,
                          )}>
                            <div className="flex items-start gap-2 min-w-0">
                              <Bell className={cn("h-4 w-4 shrink-0 mt-0.5", REMINDER_TONE[vencido ? "overdue" : "due"].accent)} />
                              <div className="min-w-0">
                                <p className="font-medium">{r.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {vencido ? "Venció el " : "Vence el "}
                                  {formatReminderDate(r.dueDate)}
                                  {" · "}avisa {r.alertDaysBefore} días antes
                                </p>
                              </div>
                            </div>
                            {!readOnly && (
                              <ReminderActions
                                onComplete={() => markComplete(r.id)}
                                onDelete={() => setReminderToDelete(r)}
                                busy={completingId === r.id}
                                dueDate={r.dueDate}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {completedReminders.length > 0 && (
                <div className="space-y-2">
                  {/* Mezcla tareas completadas y avisos retirados, así que la
                      cabecera no puede llamarse por ninguno de los dos. */}
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Histórico</p>
                  {completedReminders.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3">
                      <div className="flex items-start gap-2 min-w-0 opacity-60">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                        <div className="min-w-0">
                          <p className="font-medium line-through">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.dueDate ? `Vencía el ${formatReminderDate(r.dueDate)}` : "Permanente"}
                          </p>
                          {r.completedAt && (
                            <p className="text-xs text-muted-foreground">
                              {reminderCompletedVerb(r.dueDate)}{r.completedByUser ? ` por ${r.completedByUser.name}${r.completedByUser.lastName ? ` ${r.completedByUser.lastName}` : ""}` : ""}
                              {" el "}
                              {new Date(r.completedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
                              {" a las "}
                              {new Date(r.completedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost" size="sm" className="gap-1 text-muted-foreground"
                            disabled={completingId === r.id}
                            onClick={() => reopenReminder(r.id)}
                          >
                            <RotateCcw className="h-4 w-4" /> Reabrir
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-[#B31412]"
                            title="Borrar recordatorio"
                            onClick={() => setReminderToDelete(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Finanzas ── */}
          {tab === "finanzas" && (
            <div className="max-w-2xl space-y-4 text-sm">
              <div className={cn(
                "rounded-xl border p-4",
                row.debtCents > 0 ? "border-red-200 bg-red-50/60" :
                balance > 0 ? "border-green-200 bg-green-50/60" : "border-border bg-muted/20"
              )}>
                <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" /> Saldo y deuda
                </p>
                {balance === 0 && row.debtCents === 0 ? (
                  <p className="text-3xl font-bold tabular-nums text-muted-foreground">+{fmtEur(0)}</p>
                ) : (
                  <div className="space-y-0.5">
                    {balance > 0 && (
                      <p className="text-2xl font-bold tabular-nums text-green-700">
                        +{fmtEur(balance)}<span className="ml-1.5 text-xs font-normal text-muted-foreground">saldo a favor</span>
                      </p>
                    )}
                    {row.debtCents > 0 && (
                      <p className="text-2xl font-bold tabular-nums text-red-600">
                        −{fmtEur(row.debtCents)}<span className="ml-1.5 text-xs font-normal text-muted-foreground">deuda pendiente</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Movimientos de saldo</p>
                {movements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin movimientos.</p>
                ) : movements.map((m) => {
                  const meta = MOV_META[m.type] ?? { label: m.type, sign: "", cls: "" }
                  const date = new Date(m.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className={cn("font-medium", meta.cls)}>{meta.label}</span>
                        <span className="ml-2 text-muted-foreground">{date}</span>
                        {m.notes && <span className="ml-1 text-muted-foreground">· {m.notes}</span>}
                      </div>
                      <span className={cn("ml-3 shrink-0 font-semibold tabular-nums", meta.cls)}>
                        {meta.sign}{fmtEur(Math.abs(m.amountCents))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Borrar es irreversible y no deja rastro en el histórico, al revés que
          completar, así que se pregunta antes. */}
      <AlertDialog open={!!reminderToDelete} onOpenChange={(open) => !open && setReminderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#B31412]" /> ¿Borrar el recordatorio?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vas a borrar <span className="font-medium text-foreground">{reminderToDelete?.title}</span>.
              Desaparece de la ficha y no queda registrado. Si lo que quieres es dejar constancia de
              que ya está hecho, márcalo como completado en vez de borrarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-[#B31412] hover:bg-[#8B0000] text-white" onClick={confirmDeleteReminder}>
              Sí, borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

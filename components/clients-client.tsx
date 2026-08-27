"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Search, Check, X, AlertTriangle,
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
import { saveCustomer, deleteCustomer } from "@/lib/actions"
import {
  DEFAULT_PHONE_PREFIX, EMPTY_PHONE, formatFileNumber, formatPhone, isValidPhone,
  isValidPhonePrefix, joinPhone, normalizeSearch, onlyDigits, withNational,
  type PhoneFields,
} from "@/lib/format"
import { REFERRAL_SOURCE_META, type CustomerSex, type ReferralSource } from "@/lib/enums"
import {
  useTableSort, SortableTableHead, byText, byNumber, byDate, byBoolean,
  type SortRule,
} from "@/components/sortable-table-head"
// La ficha vive aparte porque también se abre desde el TPV (ver
// ClientProfileDialog). De ahí salen también los ayudantes que comparten el
// listado y la ficha.
import {
  ACTIVITY_BADGE, ClientProfileView, fmtEur, getActivityStatus, getAge,
  LABEL_BLOCKED, LABEL_HINT, NO_VALUE,
  type ActivityStatus, type ClientRow,
} from "@/components/client-profile-view"

export type { ClientRow }

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

type StatusFilter = "all" | ActivityStatus | "warning"
type SexFilter = "all" | CustomerSex | "unknown"

/* Cada filtro es una función suelta para poder aplicarlos por separado: así
   los contadores de un desplegable se calculan con los DEMÁS filtros puestos
   pero sin el suyo propio, que si no siempre se contaría a sí mismo. */

function matchesSearch(row: ClientRow, query: string): boolean {
  const q = normalizeSearch(query)
  if (!q) return true
  const nameWords = normalizeSearch(`${row.lastName ?? ""} ${row.lastName2 ?? ""} ${row.firstName}`).split(/\s+/).filter(Boolean)
  // Los teléfonos se guardan en formato internacional (+34600111222), así que
  // se comparan solo los dígitos y por inclusión: buscar "600" encuentra el
  // número aunque esté guardado con el prefijo del país delante.
  const phoneDigits = [row.phone, row.phone2].filter(Boolean).map((p) => onlyDigits(String(p)))
  const fileNumber = formatFileNumber(row.fileNumber)
  return q.split(/\s+/).filter(Boolean).every((t) => {
    const digits = onlyDigits(t)
    const byName = nameWords.some((w) => w.startsWith(t))
    const byPhone = digits.length > 0 && phoneDigits.some((p) => p.includes(digits))
    // El expediente se busca tal cual ("0042") o sin ceros ("42").
    const byFileNumber =
      digits.length > 0 && (fileNumber === digits.padStart(4, "0") || String(row.fileNumber) === String(Number(digits)))
    return byName || byPhone || byFileNumber
  })
}

function matchesStatus(row: ClientRow, filter: StatusFilter, warningDays: number): boolean {
  if (filter === "all") return true
  if (filter === "warning") return hasInactivityWarning(row, warningDays)
  return getActivityStatus(row) === filter
}

function matchesSex(row: ClientRow, filter: SexFilter): boolean {
  if (filter === "all") return true
  if (filter === "unknown") return !row.sex
  return row.sex === filter
}

// Sin fecha de nacimiento no hay edad que comparar: en cuanto se acota el
// rango, esos clientes se quedan fuera.
function matchesAge(row: ClientRow, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true
  const age = getAge(row.birthDate)
  if (age === null) return false
  if (min !== null && age < min) return false
  if (max !== null && age > max) return false
  return true
}

// La casilla de edad va vacía mientras no se escriba nada, y admite basura
// ("--", "e"): cualquier cosa que no sea un entero >= 0 no filtra.
function parseAge(value: string): number | null {
  if (value.trim() === "") return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sexFilter, setSexFilter] = useState<SexFilter>("all")
  const [ageFrom, setAgeFrom] = useState("")
  const [ageTo, setAgeTo] = useState("")
  const [panelOpen, setPanelOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null)
  const [newSex, setNewSex] = useState("")
  const [newReferral, setNewReferral] = useState("")
  const [newPhone, setNewPhone] = useState<PhoneFields>(EMPTY_PHONE)
  const [newPhone2, setNewPhone2] = useState<PhoneFields>(EMPTY_PHONE)
  // Misma regla que en la ficha: sin teléfono válido no hay etiqueta.
  const newPhonePrefixOk = isValidPhonePrefix(newPhone.prefix)
  const newPhone2PrefixOk = isValidPhonePrefix(newPhone2.prefix)
  const newPhoneOk = newPhonePrefixOk && isValidPhone(joinPhone(newPhone.prefix, newPhone.national))
  const newPhone2Ok =
    newPhone2PrefixOk && newPhone2.national.trim() !== "" && isValidPhone(joinPhone(newPhone2.prefix, newPhone2.national))
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

  const ageMin = parseAge(ageFrom)
  const ageMax = parseAge(ageTo)

  const filtered = useMemo(
    () => rows.filter((r) =>
      matchesSearch(r, search) &&
      matchesStatus(r, statusFilter, inactivityWarningDays) &&
      matchesSex(r, sexFilter) &&
      matchesAge(r, ageMin, ageMax)
    ),
    [rows, search, statusFilter, sexFilter, ageMin, ageMax, inactivityWarningDays],
  )

  // Los contadores de cada desplegable se calculan sobre los clientes que pasan
  // el RESTO de filtros: así dicen cuántos quedarían al elegir esa opción, en
  // vez de repetir siempre el total de la clínica.
  const statusCounts = useMemo(() => {
    const base = rows.filter((r) =>
      matchesSearch(r, search) && matchesSex(r, sexFilter) && matchesAge(r, ageMin, ageMax))
    return {
      all: base.length,
      active: base.filter((r) => getActivityStatus(r) === "active").length,
      inactive: base.filter((r) => getActivityStatus(r) === "inactive").length,
      warning: base.filter((r) => hasInactivityWarning(r, inactivityWarningDays)).length,
    }
  }, [rows, search, sexFilter, ageMin, ageMax, inactivityWarningDays])

  const sexCounts = useMemo(() => {
    const base = rows.filter((r) =>
      matchesSearch(r, search) && matchesStatus(r, statusFilter, inactivityWarningDays) && matchesAge(r, ageMin, ageMax))
    return {
      all: base.length,
      FEMALE: base.filter((r) => r.sex === "FEMALE").length,
      MALE: base.filter((r) => r.sex === "MALE").length,
      unknown: base.filter((r) => !r.sex).length,
    }
  }, [rows, search, statusFilter, ageMin, ageMax, inactivityWarningDays])

  const hayFiltro =
    search !== "" || statusFilter !== "all" || sexFilter !== "all" || ageFrom !== "" || ageTo !== ""

  function limpiarFiltros() {
    setSearch(""); setStatusFilter("all"); setSexFilter("all"); setAgeFrom(""); setAgeTo("")
  }

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
    if (!newPhonePrefixOk || !newPhone2PrefixOk) {
      toast.error("El prefijo del teléfono no es válido. Ejemplo: +34.")
      return
    }
    if (!newPhoneOk) {
      toast.error("Teléfono no válido. Ejemplo: 600 111 222.")
      return
    }
    if (newPhone2.national.trim() !== "" && !newPhone2Ok) {
      toast.error("El segundo teléfono no es válido.")
      return
    }
    // Los junta el servidor: ver el comentario de la ficha.
    fd.set("phonePrefix", newPhone.prefix)
    fd.set("phone", newPhone.national)
    fd.set("phone2Prefix", newPhone2.prefix)
    fd.set("phone2", newPhone2.national)
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
            <div className="relative min-w-[16rem] max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre, teléfono o expediente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados ({statusCounts.all})</SelectItem>
                <SelectItem value="active">Activos ({statusCounts.active})</SelectItem>
                <SelectItem value="inactive">Inactivos ({statusCounts.inactive})</SelectItem>
                <SelectItem value="warning">Con aviso ({statusCounts.warning})</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sexFilter} onValueChange={(v) => setSexFilter(v as SexFilter)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sexo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los sexos ({sexCounts.all})</SelectItem>
                <SelectItem value="FEMALE">Mujeres ({sexCounts.FEMALE})</SelectItem>
                <SelectItem value="MALE">Hombres ({sexCounts.MALE})</SelectItem>
                <SelectItem value="unknown">Sin especificar ({sexCounts.unknown})</SelectItem>
              </SelectContent>
            </Select>
            {/* Rango de edad abierto por los dos lados: rellenar solo "Desde"
                busca "de X en adelante", y solo "Hasta", "hasta X". */}
            <div className="flex items-center gap-2">
              <Label htmlFor="edad-desde" className="text-xs font-normal text-muted-foreground">Edad</Label>
              <Input
                id="edad-desde"
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                placeholder="Desde"
                className="w-24"
                value={ageFrom}
                onChange={(e) => setAgeFrom(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">a</span>
              <Input
                id="edad-hasta"
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                placeholder="Hasta"
                className="w-24"
                value={ageTo}
                onChange={(e) => setAgeTo(e.target.value)}
              />
            </div>
          </div>

          {/* Cuántos clientes está viendo ahora mismo: con filtros puestos, el
              número de la cabecera deja de valer y hay que verlo de un vistazo. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/20 px-4 py-3">
            <span className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{sorted.length}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {sorted.length === 1 ? "cliente" : "clientes"}{hayFiltro ? " con estos filtros" : ""}
              </span>
            </span>
            {hayFiltro && (
              <span className="text-xs text-muted-foreground">de {rows.length} en total</span>
            )}
            {hayFiltro && (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="ml-auto gap-1.5">
                <X className="h-3.5 w-3.5" /> Quitar filtros
              </Button>
            )}
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
                  const age = getAge(r.birthDate)
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
                        {age !== null && <span className="ml-1 text-xs opacity-60">({age} años)</span>}
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
                        aria-label="Prefijo"
                        className={cn("w-16 shrink-0 tabular-nums", !newPhonePrefixOk && "border-destructive focus-visible:ring-destructive")}
                        placeholder={DEFAULT_PHONE_PREFIX}
                        value={newPhone.prefix}
                        onChange={(e) => setNewPhone({ ...newPhone, prefix: e.target.value })}
                      />
                      <Input
                        id="phone" inputMode="tel" placeholder="600 111 222" required
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
                        aria-label="Prefijo del teléfono 2"
                        className={cn("w-16 shrink-0 tabular-nums", !newPhone2PrefixOk && "border-destructive focus-visible:ring-destructive")}
                        placeholder={DEFAULT_PHONE_PREFIX}
                        value={newPhone2.prefix}
                        onChange={(e) => setNewPhone2({ ...newPhone2, prefix: e.target.value })}
                      />
                      <Input
                        id="phone2" inputMode="tel" placeholder="611 222 333"
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

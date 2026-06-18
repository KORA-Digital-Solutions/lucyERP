"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Search, Pencil, Trash2, Check, X, UserCheck, UserX,
  AlertTriangle, FileText, Wallet, ArrowUpCircle, ArrowDownCircle,
  ShoppingCart, Gift,
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
import { saveCustomer, deleteCustomer, getClientProfile } from "@/lib/actions"
import { isValidPhone, normalizeSearch } from "@/lib/format"

export interface ClientRow {
  id: string
  firstName: string
  lastName: string | null
  phone: string
  phone2: string | null
  email: string | null
  birthDate: string | null
  notes: string | null
  whatsappOptIn: boolean
  active: boolean
  balanceCents: number
  lastAppointment: string | null
  daysSinceLastAppt: number | null
}

type ActivityStatus = "active" | "inactive"

function getActivityStatus(row: ClientRow): ActivityStatus {
  return row.active ? "active" : "inactive"
}

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

/* ─── Profile dialog ─────────────────────────────────────────────────────── */

type ProfileData = Awaited<ReturnType<typeof getClientProfile>>

function ClientProfileDialog({ row, onClose }: { row: ClientRow; onClose: () => void }) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClientProfile(row.id).then((d) => { setData(d); setLoading(false) })
  }, [row.id])

  const customer = data?.customer
  const movements = data?.movements ?? []
  const sales = data?.recentSales ?? []

  const balance = customer?.balanceCents ?? 0

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: "52rem" }}>
        <DialogHeader>
          <DialogTitle>
            Ficha de {row.lastName ? `${row.lastName}, ${row.firstName}` : row.firstName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Cargando…</div>
        ) : (
          <div className="grid grid-cols-2 gap-6 text-sm max-h-[70vh] overflow-y-auto">
            {/* Left: info + balance */}
            <div className="space-y-4">
              {/* Contact */}
              <div className="rounded-xl border p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Datos de contacto</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teléfono</span>
                  <span className="font-medium">{row.phone}</span>
                </div>
                {row.email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{row.email}</span>
                  </div>
                )}
                {row.notes && (
                  <div className="border-t pt-2 text-muted-foreground">{row.notes}</div>
                )}
              </div>

              {/* Balance */}
              <div className={cn(
                "rounded-xl border p-4",
                balance > 0 ? "border-green-200 bg-green-50/60" :
                balance < 0 ? "border-red-200 bg-red-50/60" : "border-border bg-muted/20"
              )}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" /> Saldo
                </p>
                <p className={cn(
                  "text-3xl font-bold tabular-nums",
                  balance > 0 ? "text-green-700" : balance < 0 ? "text-red-600" : "text-muted-foreground"
                )}>
                  {balance >= 0 ? "+" : "−"}{fmtEur(balance)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {balance > 0 ? "Saldo a favor del cliente" :
                   balance < 0 ? "Deuda pendiente" :
                   "Sin saldo ni deuda"}
                </p>
              </div>

              {/* Movements */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Movimientos de saldo</p>
                {movements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin movimientos.</p>
                ) : (
                  <div className="space-y-1">
                    {movements.map((m) => {
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
                )}
              </div>
            </div>

            {/* Right: sales */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Últimas ventas</p>
              {sales.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin ventas registradas.</p>
              ) : (
                <div className="space-y-2">
                  {sales.map((s) => {
                    const date = new Date(s.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                    const statusCls = s.status === "PAID" ? "text-green-700" : s.status === "DEBT" ? "text-red-600" : "text-orange-600"
                    const statusLabel = s.status === "PAID" ? "Pagado" : s.status === "DEBT" ? "Debido" : "Parcial"
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
                        <div className="flex justify-between border-t pt-1 font-medium">
                          <span>Total</span>
                          <span className="tabular-nums">{fmtEur(s.totalCents)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════════════════ */

export function ClientsClient({ rows, inactivityWarningDays }: { rows: ClientRow[]; inactivityWarningDays: number }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | ActivityStatus | "warning">("all")
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<ClientRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null)
  const [profileRow, setProfileRow] = useState<ClientRow | null>(null)

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return rows.filter((r) => {
      const matchesSearch = !q || normalizeSearch(`${r.firstName} ${r.lastName ?? ""} ${r.phone}`).includes(q)
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "warning" ? hasInactivityWarning(r, inactivityWarningDays) : getActivityStatus(r) === statusFilter)
      return matchesSearch && matchesStatus
    })
  }, [rows, search, statusFilter])

  function openNew() { setEditing(null); setPanelOpen(true) }
  function openEdit(r: ClientRow) { setEditing(r); setPanelOpen(true) }
  function closePanel() { setPanelOpen(false); setEditing(null) }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (!isValidPhone(String(fd.get("phone")))) {
      toast.error("Teléfono no válido. Ejemplo: 600 111 222 o +34600111222.")
      return
    }
    setLoading(true)
    const res = await saveCustomer(editing?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success(editing ? "Cliente actualizado." : "Cliente creado.")
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
      closePanel()
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

  return (
    <div className="flex h-screen flex-col">
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
        <div className="flex-1 space-y-4 overflow-auto p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre o teléfono…"
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
                  <TableHead>Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>F. nacimiento</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Última cita</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const status = getActivityStatus(r)
                  const badge = ACTIVITY_BADGE[status]
                  return (
                    <TableRow
                      key={r.id}
                      className={cn("cursor-pointer", panelOpen && editing?.id === r.id && "bg-accent/60")}
                      onClick={() => openEdit(r)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {hasInactivityWarning(r, inactivityWarningDays) && (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#E65100]" />
                          )}
                          {r.lastName ? `${r.lastName}, ${r.firstName}` : r.firstName}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div>{r.phone}</div>
                        {r.phone2 && <div className="text-xs">{r.phone2}</div>}
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
                        {r.balanceCents !== 0 ? (
                          <span className={cn(
                            "text-sm font-medium tabular-nums",
                            r.balanceCents > 0 ? "text-green-700" : "text-red-600"
                          )}>
                            {r.balanceCents > 0 ? "+" : "−"}{fmtEur(r.balanceCents)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1", badge.className)}>
                          {badge.icon} {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ver ficha"
                            onClick={(e) => { e.stopPropagation(); setProfileRow(r) }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar"
                            onClick={(e) => { e.stopPropagation(); openEdit(r) }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Mobile backdrop */}
        {panelOpen && (
          <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={closePanel} aria-hidden="true" />
        )}

        {/* Edit panel */}
        {panelOpen && (
          <aside
            key={editing?.id ?? "new"}
            className={cn(
              "flex w-full flex-col border-l bg-card shadow-xl",
              "fixed inset-y-0 right-0 z-50 max-w-xl",
              "lg:static lg:z-auto lg:w-[520px] lg:max-w-none lg:shadow-none",
            )}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">{editing ? "Editar cliente" : "Nuevo cliente"}</h2>
              <Button variant="ghost" size="icon" onClick={closePanel}><X className="h-4 w-4" /></Button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nombre</Label>
                  <Input id="firstName" name="firstName" defaultValue={editing?.firstName} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Apellidos</Label>
                  <Input id="lastName" name="lastName" defaultValue={editing?.lastName ?? ""} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Fecha de nacimiento</Label>
                <Input id="birthDate" name="birthDate" type="date" defaultValue={editing?.birthDate ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" name="phone" placeholder="600 111 222" defaultValue={editing?.phone} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone2">Teléfono adicional <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input id="phone2" name="phone2" placeholder="611 222 333" defaultValue={editing?.phone2 ?? ""} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observaciones</Label>
                <Textarea id="notes" name="notes" rows={2} className="resize-none" defaultValue={editing?.notes ?? ""} />
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="whatsappOptIn">Recordatorios por WhatsApp</Label>
                    <p className="text-xs text-muted-foreground">Consentimiento del cliente</p>
                  </div>
                  <Switch id="whatsappOptIn" name="whatsappOptIn" defaultChecked={editing?.whatsappOptIn ?? true} />
                </div>
                <div className="border-t pt-3 flex items-center justify-between">
                  <div>
                    <Label htmlFor="active">Cliente activo</Label>
                    <p className="text-xs text-muted-foreground">Desactiva para marcar como inactivo manualmente</p>
                  </div>
                  <Switch id="active" name="active" defaultChecked={editing?.active ?? true} />
                </div>
              </div>
              {editing && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Última cita registrada</p>
                  <p>
                    {editing.lastAppointment
                      ? <>{editing.lastAppointment}{editing.daysSinceLastAppt !== null && <span className="ml-2 text-xs text-muted-foreground">(hace {editing.daysSinceLastAppt} días)</span>}</>
                      : <span className="text-muted-foreground">Sin citas registradas</span>}
                  </p>
                </div>
              )}
            </form>

            <div className="flex items-center justify-between gap-2 border-t px-5 py-4">
              {editing ? (
                <Button type="button" variant="ghost" className="text-[#B31412]" disabled={loading} onClick={() => setDeleteTarget(editing)}>
                  <Trash2 className="mr-1 h-4 w-4" /> Borrar
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closePanel}>Cancelar</Button>
                <Button type="button" onClick={(e) => {
                  const form = (e.currentTarget as HTMLElement).closest("aside")?.querySelector("form")
                  form?.requestSubmit()
                }} disabled={loading}>
                  {loading ? "Guardando…" : editing ? "Guardar" : "Crear cliente"}
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Profile dialog */}
      {profileRow && <ClientProfileDialog row={profileRow} onClose={() => setProfileRow(null)} />}

      {/* Delete confirm */}
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
    </div>
  )
}

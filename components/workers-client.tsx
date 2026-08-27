"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, KeyRound, Trash2, FileBarChart, Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { saveWorker, toggleWorkerActive, setUserPassword, deleteWorker, generateUserPin, clearUserPin } from "@/lib/actions"
import { WorkerReportView } from "@/components/worker-report-view"

export interface WorkerRow {
  id: string
  name: string
  lastName: string | null
  email: string | null
  phone: string | null
  role: string
  active: boolean
  color: string
  mustChangePassword: boolean
  hasPassword: boolean
  hasPin: boolean
  mustChangePin: boolean
}

/**
 * Qué significa "acceso" en cada fila. Las administradoras entran con usuario y
 * contraseña por la gestión del centro; las trabajadoras, con PIN por el
 * mostrador. Son dos puertas distintas y no se mezclan.
 */
function estadoPin(r: WorkerRow) {
  if (!r.hasPin) return <span className="block text-xs text-muted-foreground">Sin PIN</span>
  if (r.mustChangePin) return <span className="block text-xs text-yellow-600">PIN por cambiar</span>
  return <span className="block text-xs text-green-700">PIN activo</span>
}

function accesoDe(r: WorkerRow) {
  // Una administradora que además atiende tiene las dos cosas: PIN para el
  // mostrador y contraseña para la gestión. No son alternativas.
  if (r.role !== "ADMIN") return estadoPin(r)

  const contraseña = !r.email || !r.hasPassword
    ? <span className="block text-xs text-muted-foreground">Sin contraseña</span>
    : r.mustChangePassword
      ? <span className="block text-xs text-yellow-600">Contraseña por cambiar</span>
      : <span className="block text-xs text-green-700">Contraseña activa</span>

  return <>{contraseña}{estadoPin(r)}</>
}

export function WorkersClient({
  rows,
  domain,
}: {
  rows: WorkerRow[]
  domain: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WorkerRow | null>(null)
  const [role, setRole] = useState("WORKER")
  const [loading, setLoading] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [lastNameValue, setLastNameValue] = useState("")
  const [emailValue, setEmailValue] = useState("")
  const [emailManual, setEmailManual] = useState(false)

  function buildEmail(name: string, lastName: string) {
    const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".")
    const parts = [slug(name), slug(lastName)].filter(Boolean)
    return parts.length ? `${parts.join(".")}@${domain}` : ""
  }
  const [pwOpen, setPwOpen] = useState(false)
  const [pwTarget, setPwTarget] = useState<WorkerRow | null>(null)
  const [tempPw, setTempPw] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<WorkerRow | null>(null)
  const [pinTarget, setPinTarget] = useState<WorkerRow | null>(null)
  // El PIN recién generado, para poder dictárselo. Se enseña una sola vez: no
  // se guarda en claro en ningún sitio.
  const [pinGenerado, setPinGenerado] = useState<string | null>(null)
  // Informe de personal: ocupa la pantalla entera, como la ficha del
  // cliente. Se guarda el id y no la fila para que, al volver de un
  // refresh, se siga viendo el informe de quien toca.
  const [reportId, setReportId] = useState<string | null>(null)
  const reportRow = reportId ? rows.find((r) => r.id === reportId) ?? null : null

  function openForm(r: WorkerRow | null) {
    setEditing(r)
    setRole(r?.role ?? "WORKER")
    const name = r?.name ?? ""
    const lastName = r?.lastName ?? ""
    setNameValue(name)
    setLastNameValue(lastName)
    setEmailManual(!!r?.email)
    setEmailValue(r?.email ?? buildEmail(name, lastName))
    setOpen(true)
  }

  function openSetPin(r: WorkerRow) {
    setPinTarget(r)
    setPinGenerado(null)
  }

  async function onGeneratePin() {
    if (!pinTarget) return
    setLoading(true)
    const res = await generateUserPin(pinTarget.id)
    setLoading(false)
    if (res.ok && res.pin) {
      setPinGenerado(res.pin)
      router.refresh()
    } else toast.error(res.error ?? "Error al generar el PIN.")
  }

  async function onClearPin() {
    if (!pinTarget) return
    setLoading(true)
    const res = await clearUserPin(pinTarget.id)
    setLoading(false)
    if (res.ok) {
      toast.success("PIN retirado.")
      setPinTarget(null)
      setPinGenerado(null)
      router.refresh()
    } else toast.error(res.error ?? "Error al retirar el PIN.")
  }

  function openSetPassword(r: WorkerRow) {
    setPwTarget(r)
    setTempPw("")
    setPwOpen(true)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("role", role)
    setLoading(true)
    const res = await saveWorker(editing?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Usuario guardado.")
      setOpen(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  async function onDelete() {
    if (!deleteTarget) return
    const res = await deleteWorker(deleteTarget.id)
    if (res.ok) { toast.success("Usuario eliminado."); setDeleteTarget(null); router.refresh() }
    else toast.error(res.error ?? "Error al eliminar.")
  }

  async function onToggle(r: WorkerRow) {
    const res = await toggleWorkerActive(r.id, !r.active)
    if (res.ok) router.refresh()
    else toast.error(res.error ?? "Error")
  }

  async function onSetPassword() {
    if (!pwTarget || !tempPw) return
    setLoading(true)
    const res = await setUserPassword(pwTarget.id, tempPw)
    setLoading(false)
    if (res.ok) {
      toast.success(`Contraseña temporal asignada. El usuario deberá cambiarla en el próximo acceso.`)
      setPwOpen(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al asignar contraseña.")
  }

  if (reportRow) {
    return <WorkerReportView worker={reportRow} onBack={() => setReportId(null)} />
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">{rows.length} usuarios · gestiona accesos y roles</p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="p-6 space-y-6">
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Acceso</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end text-xs font-normal text-muted-foreground">
                    <span className="flex w-20 items-center justify-center gap-1"><FileBarChart className="h-3.5 w-3.5" /> Informe</span>
                    <span className="flex w-20 items-center justify-center gap-1"><Hash className="h-3.5 w-3.5" /> PIN</span>
                    <span className="flex w-24 items-center justify-center gap-1"><KeyRound className="h-3.5 w-3.5" /> Contraseña</span>
                    <span className="flex w-20 items-center justify-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar</span>
                    <span className="flex w-20 items-center justify-center gap-1"><Trash2 className="h-3.5 w-3.5 text-destructive" /> Eliminar</span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: r.color }} />
                    {r.name}{r.lastName ? ` ${r.lastName}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.role === "ADMIN" ? "default" : "secondary"}>
                      {r.role === "ADMIN" ? "Administrador" : "Trabajador"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                  {/* Cada rol entra por una puerta distinta, así que "acceso"
                      significa una cosa distinta en cada fila. */}
                  <TableCell>{accesoDe(r)}</TableCell>
                  <TableCell>
                    <Switch checked={r.active} onCheckedChange={() => onToggle(r)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <span className="flex w-20 justify-center">
                        <Button variant="ghost" size="icon" title="Ver informe de personal" onClick={() => setReportId(r.id)}>
                          <FileBarChart className="h-4 w-4" />
                        </Button>
                      </span>
                      <span className="flex w-20 justify-center">
                        <Button
                          variant="ghost" size="icon"
                          title={r.hasPin ? "Generar un PIN nuevo o retirarlo" : "Generar PIN de mostrador"}
                          onClick={() => openSetPin(r)}
                        >
                          <Hash className={cn("h-4 w-4", !r.hasPin && "text-muted-foreground/40")} />
                        </Button>
                      </span>
                      <span className="flex w-24 justify-center">
                        {/* Las trabajadoras no tienen contraseña: entran por el
                            mostrador con su PIN. */}
                        {r.role === "ADMIN" && (
                          <Button variant="ghost" size="icon" title="Asignar contraseña" onClick={() => openSetPassword(r)}>
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                      </span>
                      <span className="flex w-20 justify-center">
                        <Button variant="ghost" size="icon" onClick={() => openForm(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </span>
                      <span className="flex w-20 justify-center">
                        {!r.active && (
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar usuario" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin usuarios.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Diálogo editar/crear usuario */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" name="name" value={nameValue} required onChange={(e) => {
                    setNameValue(e.target.value)
                    if (!emailManual) setEmailValue(buildEmail(e.target.value, lastNameValue))
                  }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Apellidos</Label>
                  <Input id="lastName" name="lastName" value={lastNameValue} required onChange={(e) => {
                    setLastNameValue(e.target.value)
                    if (!emailManual) setEmailValue(buildEmail(nameValue, e.target.value))
                  }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    {role === "ADMIN" ? "Email de acceso" : "Email (opcional)"}
                  </Label>
                  {/* Solo la gestión del centro se abre con email y contraseña.
                      Una trabajadora entra por el mostrador con su PIN, así que
                      su email es un dato de contacto y nada más. */}
                  <Input id="email" name="email" type="email" value={emailValue} required={role === "ADMIN"}
                    onChange={(e) => { setEmailValue(e.target.value); setEmailManual(true) }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} />
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Color en agenda</Label>
                  <Input id="color" name="color" type="color" defaultValue={editing?.color ?? "#3C54A4"} className="h-10 p-1" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="active">Activo</Label>
                <Switch id="active" name="active" defaultChecked={editing?.active ?? true} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Diálogo del PIN de mostrador */}
        <Dialog open={!!pinTarget} onOpenChange={(o) => { if (!o) { setPinTarget(null); setPinGenerado(null) } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>PIN de mostrador</DialogTitle>
              <DialogDescription>
                Con este PIN <strong>{pinTarget?.name}{pinTarget?.lastName ? ` ${pinTarget.lastName}` : ""}</strong> abre
                el mostrador y firma sus cobros. No abre la gestión del centro.
              </DialogDescription>
            </DialogHeader>

            {pinGenerado ? (
              <div className="space-y-3">
                <div className="rounded-xl border-2 border-dashed bg-muted/30 py-6 text-center">
                  <p className="text-4xl font-bold tracking-[0.3em] tabular-nums">{pinGenerado}</p>
                </div>
                {/* Se enseña una sola vez porque no se guarda en claro: lo que
                    hay en la base es el hash, igual que con una contraseña. */}
                <p className="text-sm text-muted-foreground">
                  Anótalo o díselo ahora: no se vuelve a mostrar. Al entrar por primera vez
                  tendrá que cambiarlo por uno suyo.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {pinTarget?.hasPin
                  ? "Ya tiene PIN. Si genera uno nuevo, el anterior deja de servir."
                  : "El sistema genera un PIN al azar. Es de un solo uso: ella elegirá el suyo al entrar."}
              </p>
            )}

            <DialogFooter className="sm:justify-between">
              {pinTarget?.hasPin && !pinGenerado ? (
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={onClearPin} disabled={loading}>
                  Retirar PIN
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setPinTarget(null); setPinGenerado(null) }}>
                  {pinGenerado ? "Hecho" : "Cancelar"}
                </Button>
                {!pinGenerado && (
                  <Button onClick={onGeneratePin} disabled={loading}>
                    {loading ? "Generando…" : pinTarget?.hasPin ? "Generar uno nuevo" : "Generar PIN"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo asignar contraseña temporal */}
        <Dialog open={pwOpen} onOpenChange={setPwOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asignar contraseña temporal</DialogTitle>
              <DialogDescription>
                Asigna una contraseña temporal a <strong>{pwTarget?.name}{pwTarget?.lastName ? ` ${pwTarget.lastName}` : ""}</strong>. Se le pedirá que la cambie en el siguiente acceso.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tempPw">Contraseña temporal</Label>
                <Input
                  id="tempPw"
                  type="text"
                  value={tempPw}
                  onChange={(e) => setTempPw(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="off"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>Cancelar</Button>
              <Button onClick={onSetPassword} disabled={loading || tempPw.length < 6}>
                {loading ? "Guardando…" : "Asignar contraseña"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará permanentemente a <strong>{deleteTarget?.name} {deleteTarget?.lastName}</strong>. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

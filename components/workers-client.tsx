"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, KeyRound, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveWorker, toggleWorkerActive, setUserPassword, deleteWorker } from "@/lib/actions"

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
}

export function WorkersClient({ rows, domain }: { rows: WorkerRow[]; domain: string }) {
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">{rows.length} usuarios · gestiona accesos y roles</p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

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
              <TableHead className="text-right">Acciones</TableHead>
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
                <TableCell>
                  {r.email ? (
                    r.mustChangePassword
                      ? <span className="text-xs text-yellow-600">Cambio pendiente</span>
                      : <span className="text-xs text-green-700">Activo</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin acceso</span>
                  )}
                </TableCell>
                <TableCell>
                  <Switch checked={r.active} onCheckedChange={() => onToggle(r)} />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" title={r.email ? "Asignar contraseña" : "Añade un email para poder asignar contraseña"} onClick={() => openSetPassword(r)} disabled={!r.email}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openForm(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!r.active && (
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar usuario" onClick={() => setDeleteTarget(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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
        <DialogContent>
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
                <Label htmlFor="email">Email de acceso</Label>
                <Input id="email" name="email" type="email" value={emailValue} required
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

      {/* Diálogo asignar contraseña temporal */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar contraseña temporal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Asigna una contraseña temporal a <strong>{pwTarget?.name}{pwTarget?.lastName ? ` ${pwTarget.lastName}` : ""}</strong>. Se le pedirá que la cambie en el siguiente acceso.
            </p>
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
  )
}

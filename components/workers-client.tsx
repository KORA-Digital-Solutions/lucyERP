"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveWorker, toggleWorkerActive } from "@/lib/actions"

export interface WorkerRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  active: boolean
  color: string
}

export function WorkersClient({ rows }: { rows: WorkerRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WorkerRow | null>(null)
  const [role, setRole] = useState("WORKER")
  const [loading, setLoading] = useState(false)

  function openForm(r: WorkerRow | null) {
    setEditing(r)
    setRole(r?.role ?? "WORKER")
    setOpen(true)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("role", role)
    setLoading(true)
    const res = await saveWorker(editing?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Trabajador guardado.")
      setOpen(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  async function onToggle(r: WorkerRow) {
    const res = await toggleWorkerActive(r.id, !r.active)
    if (res.ok) router.refresh()
    else toast.error(res.error ?? "Error")
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trabajadores</h1>
          <p className="text-muted-foreground">{rows.length} trabajadores</p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo trabajador
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
              <TableHead>Activo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: r.color }} />
                  {r.name}
                </TableCell>
                <TableCell>
                  <Badge variant={r.role === "ADMIN" ? "default" : "secondary"}>
                    {r.role === "ADMIN" ? "Administrador" : "Trabajador"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                <TableCell>
                  <Switch checked={r.active} onCheckedChange={() => onToggle(r)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openForm(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sin trabajadores.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar trabajador" : "Nuevo trabajador"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} />
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
    </div>
  )
}

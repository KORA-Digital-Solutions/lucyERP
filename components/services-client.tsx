"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { saveService, toggleServiceActive } from "@/lib/actions"
import { formatDuration, formatPrice } from "@/lib/format"

export interface ServiceRow {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  priceCents: number
  active: boolean
}

export function ServicesClient({ rows }: { rows: ServiceRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setLoading(true)
    const res = await saveService(editing?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Servicio guardado.")
      setOpen(false)
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  async function onToggle(r: ServiceRow) {
    const res = await toggleServiceActive(r.id, !r.active)
    if (res.ok) router.refresh()
    else toast.error(res.error ?? "Error")
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
          <p className="text-muted-foreground">{rows.length} servicios</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo servicio
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{formatDuration(r.durationMinutes)}</TableCell>
                <TableCell>{formatPrice(r.priceCents)}</TableCell>
                <TableCell>
                  <Badge variant={r.active ? "secondary" : "outline"} className={r.active ? "" : "text-muted-foreground"}>
                    {r.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Switch checked={r.active} onCheckedChange={() => onToggle(r)} className="mr-2 align-middle" />
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true) }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sin servicios.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" name="description" rows={2} className="resize-none" defaultValue={editing?.description ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duración (min)</Label>
                <Input id="durationMinutes" name="durationMinutes" type="number" min={5} step={5} defaultValue={editing?.durationMinutes ?? 60} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Precio (€)</Label>
                <Input id="price" name="price" type="number" min={0} step="0.01" defaultValue={editing ? (editing.priceCents / 100).toString() : ""} required />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="active">Servicio activo</Label>
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

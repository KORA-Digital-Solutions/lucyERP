"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, ToggleRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveService, toggleServiceActive } from "@/lib/actions"
import { formatDuration, formatPrice } from "@/lib/format"

export interface ServiceRow {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  priceCents: number
  pricingType: string
  pricePerMinuteCents: number | null
  active: boolean
}

export function ServicesClient({ rows }: { rows: ServiceRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [pricingType, setPricingType] = useState("FIXED")

  function openNew() { setEditing(null); setPricingType("FIXED"); setOpen(true) }
  function openEdit(r: ServiceRow) { setEditing(r); setPricingType(r.pricingType); setOpen(true) }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("pricingType", pricingType)
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
        <Button onClick={openNew}>
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
              <TableHead>Tipo tarifa</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead className="text-right">
                <div className="flex justify-end text-xs font-normal text-muted-foreground">
                  <span className="flex w-36 items-center justify-center gap-1"><ToggleRight className="h-3.5 w-3.5 text-primary" /> Activar/Desactivar</span>
                  <span className="flex w-20 items-center justify-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar</span>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{formatDuration(r.durationMinutes)}</TableCell>
                <TableCell>
                  {r.pricingType === "PER_MINUTE" && r.pricePerMinuteCents
                    ? `${formatPrice(r.pricePerMinuteCents)}/min`
                    : formatPrice(r.priceCents)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {r.pricingType === "PER_MINUTE" ? "Por minuto" : "Precio fijo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={r.active ? "secondary" : "outline"} className={r.active ? "" : "text-muted-foreground"}>
                    {r.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end">
                    <span className="flex w-36 justify-center">
                      <Switch checked={r.active} onCheckedChange={() => onToggle(r)} />
                    </span>
                    <span className="flex w-20 justify-center">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sin servicios.</TableCell>
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
            <div className="space-y-2">
              <Label>Tipo de tarifa</Label>
              <Select value={pricingType} onValueChange={setPricingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Precio fijo</SelectItem>
                  <SelectItem value="PER_MINUTE">Por minuto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duración (min)</Label>
                <Input id="durationMinutes" name="durationMinutes" type="number" min={5} step={5} defaultValue={editing?.durationMinutes ?? 60} required />
              </div>
              {pricingType === "FIXED" ? (
                <div className="space-y-2">
                  <Label htmlFor="price">Precio (€)</Label>
                  <Input id="price" name="price" type="number" min={0} step="0.01" defaultValue={editing ? (editing.priceCents / 100).toFixed(2) : ""} required />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pricePerMinute">€ / minuto</Label>
                  <Input id="pricePerMinute" name="pricePerMinute" type="number" min={0} step="0.01"
                    defaultValue={editing?.pricePerMinuteCents ? (editing.pricePerMinuteCents / 100).toFixed(2) : ""} required />
                  <input type="hidden" name="price" value="0" />
                </div>
              )}
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

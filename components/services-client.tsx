"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, ToggleRight, Tags } from "lucide-react"
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
import { saveService, toggleServiceActive, saveServiceFamily, toggleServiceFamilyActive } from "@/lib/actions"
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
  familyId: string
  familyName: string
}

export interface ServiceFamilyRow {
  id: string
  name: string
  active: boolean
}

export function ServicesClient({ rows, families }: { rows: ServiceRow[]; families: ServiceFamilyRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [pricingType, setPricingType] = useState("FIXED")
  const [familyId, setFamilyId] = useState("")
  const [familyFilter, setFamilyFilter] = useState("ALL")
  const [familiesOpen, setFamiliesOpen] = useState(false)
  const [newFamilyName, setNewFamilyName] = useState("")
  const [savingFamily, setSavingFamily] = useState(false)

  const activeFamilies = families.filter((f) => f.active)

  function openNew() {
    setEditing(null)
    setPricingType("FIXED")
    setFamilyId(activeFamilies[0]?.id ?? "")
    setOpen(true)
  }
  function openEdit(r: ServiceRow) {
    setEditing(r)
    setPricingType(r.pricingType)
    setFamilyId(r.familyId)
    setOpen(true)
  }

  const filteredRows = useMemo(() => {
    if (familyFilter === "ALL") return rows
    return rows.filter((r) => r.familyId === familyFilter)
  }, [rows, familyFilter])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!familyId) {
      toast.error("Elegí una familia para el servicio.")
      return
    }
    const fd = new FormData(e.currentTarget)
    fd.set("pricingType", pricingType)
    fd.set("familyId", familyId)
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

  async function onAddFamily(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newFamilyName.trim()
    if (!name) return
    const fd = new FormData()
    fd.set("name", name)
    fd.set("active", "on")
    setSavingFamily(true)
    const res = await saveServiceFamily(null, fd)
    setSavingFamily(false)
    if (res.ok) {
      setNewFamilyName("")
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar la familia.")
  }

  async function onToggleFamily(f: ServiceFamilyRow) {
    const res = await toggleServiceFamilyActive(f.id, !f.active)
    if (res.ok) router.refresh()
    else toast.error(res.error ?? "Error")
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
          <p className="text-muted-foreground">{filteredRows.length} de {rows.length} servicios</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setFamiliesOpen(true)}>
            <Tags className="mr-2 h-4 w-4" /> Familias
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo servicio
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Familia</Label>
        <Select value={familyFilter} onValueChange={setFamilyFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las familias</SelectItem>
            {families.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}{!f.active ? " (inactiva)" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Familia</TableHead>
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
            {filteredRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{r.familyName}</Badge>
                </TableCell>
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
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin servicios.</TableCell>
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
              <Label>Familia</Label>
              <Select value={familyId} onValueChange={setFamilyId}>
                <SelectTrigger><SelectValue placeholder="Elegí una familia" /></SelectTrigger>
                <SelectContent>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}{!f.active ? " (inactiva)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {families.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay familias creadas todavía. Creá una desde el botón &quot;Familias&quot;.</p>
              )}
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

      <Dialog open={familiesOpen} onOpenChange={setFamiliesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Familias de servicio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form onSubmit={onAddFamily} className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="newFamilyName">Nueva familia</Label>
                <Input
                  id="newFamilyName"
                  value={newFamilyName}
                  onChange={(e) => setNewFamilyName(e.target.value)}
                  placeholder="Ej: Depilación"
                />
              </div>
              <Button type="submit" disabled={savingFamily || !newFamilyName.trim()}>
                {savingFamily ? "Añadiendo…" : "Añadir"}
              </Button>
            </form>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {families.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    <Badge variant={f.active ? "secondary" : "outline"} className={f.active ? "" : "text-muted-foreground"}>
                      {f.active ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                  <Switch checked={f.active} onCheckedChange={() => onToggleFamily(f)} />
                </div>
              ))}
              {families.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">Sin familias todavía.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFamiliesOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

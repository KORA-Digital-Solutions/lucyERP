"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Search, Pencil, Trash2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { saveCustomer, deleteCustomer } from "@/lib/actions"
import { isValidPhone, normalizeSearch } from "@/lib/format"

export interface ClientRow {
  id: string
  firstName: string
  lastName: string | null
  phone: string
  email: string | null
  notes: string | null
  whatsappOptIn: boolean
  nextAppointment: string | null
}

export function ClientsClient({ rows }: { rows: ClientRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ClientRow | null>(null)
  const [loading, setLoading] = useState(false)

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    if (!q) return rows
    return rows.filter((r) =>
      normalizeSearch(`${r.firstName} ${r.lastName ?? ""} ${r.phone}`).includes(q),
    )
  }, [rows, search])

  function openNew() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(r: ClientRow) {
    setEditing(r)
    setOpen(true)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (!isValidPhone(String(fd.get("phone")))) {
      toast.error("Teléfono no válido. Usa formato internacional, p. ej. +34600111222.")
      return
    }
    setLoading(true)
    const res = await saveCustomer(editing?.id ?? null, fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Cliente guardado.")
      setOpen(false)
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al guardar.")
    }
  }

  async function onDelete(r: ClientRow) {
    if (!confirm(`¿Borrar a ${r.firstName}?`)) return
    const res = await deleteCustomer(r.id)
    if (res.ok) {
      toast.success("Cliente borrado.")
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al borrar.")
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">{rows.length} clientes registrados</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Próxima cita</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.firstName} {r.lastName}
                </TableCell>
                <TableCell>{r.phone}</TableCell>
                <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                <TableCell>
                  {r.whatsappOptIn ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> Sí
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <X className="h-3 w-3" /> No
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.nextAppointment ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(r)}>
                    <Trash2 className="h-4 w-4 text-[#B31412]" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" name="firstName" defaultValue={editing?.firstName} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Apellidos</Label>
                <Input id="lastName" name="lastName" defaultValue={editing?.lastName ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" name="phone" placeholder="+34600111222" defaultValue={editing?.phone} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observaciones (no sanitarias)</Label>
              <Textarea id="notes" name="notes" rows={2} className="resize-none" defaultValue={editing?.notes ?? ""} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="whatsappOptIn">Recordatorios por WhatsApp</Label>
                <p className="text-xs text-muted-foreground">Consentimiento del cliente</p>
              </div>
              <Switch id="whatsappOptIn" name="whatsappOptIn" defaultChecked={editing?.whatsappOptIn ?? true} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, Building2, ShoppingCart, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveProduct, saveSupplier, deleteSupplier, addStockMovement, registerOrder } from "@/lib/actions"

export interface ProductRow {
  id: string
  name: string
  description: string | null
  supplierName: string | null
  supplierId: string | null
  priceCents: number
  costCents: number
  stock: number
  stockMin: number
  active: boolean
}

export interface SupplierRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
}

function stockBadge(stock: number, stockMin: number) {
  if (stockMin > 0 && stock <= stockMin)
    return <Badge variant="destructive">{stock} ud</Badge>
  if (stockMin > 0 && stock <= stockMin * 1.5)
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{stock} ud</Badge>
  return <Badge variant="secondary">{stock} ud</Badge>
}

// ── Panel lateral de pedido ───────────────────────────────────────────────────
interface OrderLine { productId: string; name: string; quantity: number }

interface OrderPanelProps {
  products: ProductRow[]
  onClose: () => void
  onDone: () => void
}

function OrderPanel({ products, onClose, onDone }: OrderPanelProps) {
  const [lines, setLines] = useState<OrderLine[]>([])
  const [selectedId, setSelectedId] = useState<string>("none")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)

  const activeProducts = products.filter((p) => p.active)
  const usedIds = new Set(lines.map((l) => l.productId))
  const available = activeProducts.filter((p) => !usedIds.has(p.id))

  function addLine() {
    if (selectedId === "none") return
    const product = activeProducts.find((p) => p.id === selectedId)
    if (!product) return
    setLines((prev) => [...prev, { productId: product.id, name: product.name, quantity: 1 }])
    setSelectedId("none")
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  function setQty(productId: string, qty: number) {
    setLines((prev) => prev.map((l) => l.productId === productId ? { ...l, quantity: Math.max(1, qty) } : l))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lines.length === 0) { toast.error("Añade al menos un producto."); return }
    setLoading(true)
    const res = await registerOrder(lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), notes || null)
    setLoading(false)
    if (res.ok) {
      toast.success(`Pedido registrado — ${lines.length} producto${lines.length > 1 ? "s" : ""} actualizados.`)
      onDone()
    } else {
      toast.error(res.error ?? "Error al registrar pedido.")
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-4xl" style={{ maxWidth: "56rem" }}>
        <DialogHeader>
          <DialogTitle>Registrar pedido</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Añadir producto */}
          <div className="space-y-2">
            <Label>Añadir producto</Label>
            <div className="flex gap-2">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecciona un producto…" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {available.length === 0 && (
                    <SelectItem value="none" disabled>Todos los productos añadidos</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addLine} disabled={selectedId === "none"}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Líneas del pedido */}
          {lines.length > 0 ? (
            <div className="space-y-2">
              <Label>Productos del pedido</Label>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {lines.map((line) => (
                  <div key={line.productId} className="grid grid-cols-[1fr_80px_24px] items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                    <span className="text-sm font-medium break-words leading-tight">{line.name}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => setQty(line.productId, Number(e.target.value))}
                        className="w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground">ud</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLine(line.productId)}>
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Selecciona productos para añadir al pedido
            </p>
          )}

          {/* Referencia */}
          <div className="space-y-2">
            <Label htmlFor="notes">Referencia (opcional)</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Albarán 2026-034" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading || lines.length === 0}>
              {loading ? "Guardando…" : `Guardar pedido${lines.length > 0 ? ` (${lines.length})` : ""}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Diálogo consumo individual ────────────────────────────────────────────────
interface ConsumeDialogProps {
  product: ProductRow
  type: "ENTRY" | "CONSUME"
  onClose: () => void
  onDone: () => void
}

function ConsumeDialog({ product, type, onClose, onDone }: ConsumeDialogProps) {
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (qty < 1) return
    setLoading(true)
    const res = await addStockMovement(product.id, type, qty, notes || null)
    setLoading(false)
    if (res.ok) {
      toast.success(type === "ENTRY" ? `+${qty} ud añadidas a ${product.name}.` : `-${qty} ud consumidas de ${product.name}.`)
      onDone()
    } else {
      toast.error(res.error ?? "Error al registrar consumo.")
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type === "ENTRY" ? "Entrada de stock" : "Consumo interno"} — {product.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">Cantidad (unidades)</Label>
            <Input id="qty" type="number" min={1} max={type === "CONSUME" ? product.stock : undefined} value={qty}
              onChange={(e) => setQty(Number(e.target.value))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={type === "ENTRY" ? "Ej: Ajuste manual" : "Ej: Tratamiento facial"} />
          </div>
          <p className="text-sm text-muted-foreground">
            Stock actual: <strong>{product.stock} ud</strong>. Quedará: <strong>{type === "ENTRY" ? product.stock + qty : Math.max(0, product.stock - qty)} ud</strong>.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading || qty < 1 || (type === "CONSUME" && qty > product.stock)}>
              {loading ? "Guardando…" : type === "ENTRY" ? "Añadir stock" : "Registrar consumo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function StockClient({ products, suppliers }: { products: ProductRow[]; suppliers: SupplierRow[] }) {
  const router = useRouter()
  const [tab, setTab] = useState("products")

  const [productOpen, setProductOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [productSupplier, setProductSupplier] = useState<string>("none")
  const [productLoading, setProductLoading] = useState(false)

  const [supplierOpen, setSupplierOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null)
  const [supplierLoading, setSupplierLoading] = useState(false)
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<SupplierRow | null>(null)

  const [orderOpen, setOrderOpen] = useState(false)
  const [consumeTarget, setConsumeTarget] = useState<ProductRow | null>(null)
  const [entryTarget, setEntryTarget] = useState<ProductRow | null>(null)
  const [search, setSearch] = useState("")

  function openProductForm(p: ProductRow | null) {
    setEditingProduct(p)
    setProductSupplier(p?.supplierId ?? "none")
    setProductOpen(true)
  }

  async function onProductSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (productSupplier !== "none") fd.set("supplierId", productSupplier)
    else fd.delete("supplierId")
    setProductLoading(true)
    const res = await saveProduct(editingProduct?.id ?? null, fd)
    setProductLoading(false)
    if (res.ok) { toast.success("Producto guardado."); setProductOpen(false); router.refresh() }
    else toast.error(res.error ?? "Error al guardar.")
  }

  async function onSupplierSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setSupplierLoading(true)
    const res = await saveSupplier(editingSupplier?.id ?? null, fd)
    setSupplierLoading(false)
    if (res.ok) { toast.success("Proveedor guardado."); setSupplierOpen(false); router.refresh() }
    else toast.error(res.error ?? "Error al guardar.")
  }

  async function onDeleteSupplier() {
    if (!deleteSupplierTarget) return
    const res = await deleteSupplier(deleteSupplierTarget.id)
    if (res.ok) { toast.success("Proveedor eliminado."); setDeleteSupplierTarget(null); router.refresh() }
    else toast.error(res.error ?? "Error al eliminar.")
  }

  const lowStock = products.filter((p) => p.active && p.stockMin > 0 && p.stock <= p.stockMin)
  const filteredProducts = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-muted-foreground">{products.length} productos · {suppliers.length} proveedores</p>
        </div>
        <Button onClick={() => setOrderOpen(true)}>
          <ShoppingCart className="mr-2 h-4 w-4" /> Registrar pedido
        </Button>
      </div>

      {lowStock.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive mb-2">⚠ Productos bajo mínimo</p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((p) => (
              <span key={p.id} className="text-xs rounded-md border border-destructive/30 bg-white px-2 py-1">
                {p.name} — <strong>{p.stock} ud</strong>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="products">Productos</TabsTrigger>
            <TabsTrigger value="suppliers">
              <Building2 className="mr-1.5 h-4 w-4" />
              Proveedores
            </TabsTrigger>
          </TabsList>
          {tab === "products" && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-56"
                />
              </div>
              <Button variant="outline" onClick={() => openProductForm(null)}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo producto
              </Button>
            </div>
          )}
          {tab === "suppliers" && (
            <Button variant="outline" onClick={() => { setEditingSupplier(null); setSupplierOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo proveedor
            </Button>
          )}
        </div>

        <TabsContent value="products" className="mt-4">
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Precio venta</TableHead>
                  <TableHead>Coste</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => (
                  <TableRow key={p.id} className={!p.active ? "opacity-50" : undefined}>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.supplierName ?? "—"}</TableCell>
                    <TableCell>{stockBadge(p.stock, p.stockMin)}</TableCell>
                    <TableCell className="text-sm">{p.priceCents > 0 ? `${(p.priceCents / 100).toFixed(2)} €` : "—"}</TableCell>
                    <TableCell className="text-sm">{p.costCents > 0 ? `${(p.costCents / 100).toFixed(2)} €` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "secondary" : "outline"}>{p.active ? "Sí" : "No"}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" title="Entrada de stock" onClick={() => setEntryTarget(p)}>
                        <ArrowDownCircle className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Consumo interno"
                        onClick={() => setConsumeTarget(p)} disabled={p.stock === 0}>
                        <ArrowUpCircle className="h-4 w-4 text-orange-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openProductForm(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {search ? "Sin resultados para esa búsqueda." : "Sin productos. Crea el primero."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4">
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{s.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{s.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{s.notes ?? "—"}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingSupplier(s); setSupplierOpen(true) }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteSupplierTarget(s)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Sin proveedores. Crea el primero.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Panel pedido */}
      {orderOpen && (
        <OrderPanel
          products={products}
          onClose={() => setOrderOpen(false)}
          onDone={() => { setOrderOpen(false); router.refresh() }}
        />
      )}

      {/* Diálogo entrada manual */}
      {entryTarget && (
        <ConsumeDialog
          product={entryTarget}
          type="ENTRY"
          onClose={() => setEntryTarget(null)}
          onDone={() => { setEntryTarget(null); router.refresh() }}
        />
      )}

      {/* Diálogo consumo */}
      {consumeTarget && (
        <ConsumeDialog
          product={consumeTarget}
          type="CONSUME"
          onClose={() => setConsumeTarget(null)}
          onDone={() => { setConsumeTarget(null); router.refresh() }}
        />
      )}

      {/* Diálogo producto */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onProductSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={editingProduct?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" name="description" defaultValue={editingProduct?.description ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={productSupplier} onValueChange={setProductSupplier}>
                <SelectTrigger><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Precio venta (€)</Label>
                <Input id="price" name="price" type="number" step="0.01" min="0"
                  defaultValue={editingProduct ? (editingProduct.priceCents / 100).toFixed(2) : "0"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Coste (€)</Label>
                <Input id="cost" name="cost" type="number" step="0.01" min="0"
                  defaultValue={editingProduct ? (editingProduct.costCents / 100).toFixed(2) : "0"} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stockMin">Stock mínimo (alerta)</Label>
              <Input id="stockMin" name="stockMin" type="number" min="0"
                defaultValue={editingProduct?.stockMin ?? 0} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="active">Activo</Label>
              <Switch id="active" name="active" defaultChecked={editingProduct?.active ?? true} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProductOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={productLoading}>{productLoading ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo proveedor */}
      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSupplierSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sname">Nombre</Label>
              <Input id="sname" name="name" defaultValue={editingSupplier?.name} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sphone">Teléfono</Label>
                <Input id="sphone" name="phone" defaultValue={editingSupplier?.phone ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="semail">Email</Label>
                <Input id="semail" name="email" type="email" defaultValue={editingSupplier?.email ?? ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snotes">Notas</Label>
              <Input id="snotes" name="notes" defaultValue={editingSupplier?.notes ?? ""}
                placeholder="Condiciones, contacto habitual…" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="sactive">Activo</Label>
              <Switch id="sactive" name="active" defaultChecked={editingSupplier?.active ?? true} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSupplierOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={supplierLoading}>{supplierLoading ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm borrar proveedor */}
      <AlertDialog open={!!deleteSupplierTarget} onOpenChange={() => setDeleteSupplierTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDeleteSupplier}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

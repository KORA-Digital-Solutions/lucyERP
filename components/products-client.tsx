"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Building2, ClipboardCheck } from "lucide-react"
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
import { StockFilters, hayFiltros } from "@/components/stock-filters"
import { saveProduct, saveSupplier, deleteSupplier, adjustStock } from "@/lib/actions"
import { formatPrice } from "@/lib/format"

/**
 * El catálogo de productos y proveedores, en la gestión del centro.
 *
 * Un producto es lo mismo que un servicio: qué vende el centro y a qué precio.
 * Eso se decide una vez y se toca poco, así que se da de alta aquí, con
 * contraseña, y no en mitad de la mañana desde el mostrador.
 *
 * Lo que sí es del día a día son las existencias —lo que entra y lo que se
 * gasta— y eso se queda en /stock, en el mostrador, donde está quien abre las
 * cajas. Aquí no se apuntan entradas ni consumos; lo que sí se hace es
 * regularizar tras un recuento, que es tarea de gestión y no del día a día.
 */

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

/**
 * Regularizar un producto tras contarlo.
 *
 * Se escribe lo que hay en el estante, no la diferencia: nadie cuenta "me
 * faltan dos", cuenta "hay tres". El descuadre lo calcula la pantalla y se
 * enseña antes de guardar, porque un ajuste de −40 casi siempre es un dedazo.
 */
function AdjustDialog({ product, onClose, onDone }: {
  product: ProductRow
  onClose: () => void
  onDone: () => void
}) {
  const [contado, setContado] = useState(String(product.stock))
  const [motivo, setMotivo] = useState("")
  const [loading, setLoading] = useState(false)

  const valido = contado !== "" && Number.isInteger(Number(contado)) && Number(contado) >= 0
  const delta = valido ? Number(contado) - product.stock : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || delta === 0 || !motivo.trim()) return
    setLoading(true)
    const res = await adjustStock(product.id, Number(contado), motivo)
    setLoading(false)
    if (res.ok) {
      toast.success(`${product.name}: ${delta > 0 ? "+" : ""}${delta} ud — stock ajustado a ${contado} ud.`)
      onDone()
    } else {
      toast.error(res.error ?? "Error al ajustar el stock.")
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Ajustar existencias — {product.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contado">Existencias contadas (unidades)</Label>
            <Input id="contado" type="number" min={0} step={1} inputMode="numeric"
              value={contado} onChange={(e) => setContado(e.target.value)} required autoFocus />
            <p className="text-sm text-muted-foreground">
              El sistema dice <strong>{product.stock} ud</strong>.{" "}
              {delta !== 0 && valido && (
                <span className={delta > 0 ? "text-green-700" : "text-destructive"}>
                  El ajuste será de {delta > 0 ? "+" : ""}{delta} ud.
                </span>
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo</Label>
            <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: recuento de fin de mes, rotura, caducado" required />
            {/* Obligatorio: es el único sitio donde el stock cambia sin que haya
                pasado nada en el mostrador, y sin motivo el apunte no explica nada. */}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading || !valido || delta === 0 || !motivo.trim()}>
              {loading ? "Guardando…" : "Ajustar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProductsClient({ products, suppliers }: { products: ProductRow[]; suppliers: SupplierRow[] }) {
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

  const [adjustTarget, setAdjustTarget] = useState<ProductRow | null>(null)

  const [search, setSearch] = useState("")
  const [supplierFilter, setSupplierFilter] = useState("ALL")
  const [stockDesde, setStockDesde] = useState("")
  const [stockHasta, setStockHasta] = useState("")

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

  const filteredProducts = products.filter((p) => {
    if (search.trim() && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (supplierFilter !== "ALL" && p.supplierId !== supplierFilter) return false
    if (stockDesde !== "" && p.stock < Number(stockDesde)) return false
    if (stockHasta !== "" && p.stock > Number(stockHasta)) return false
    return true
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-muted-foreground">{products.length} productos · {suppliers.length} proveedores</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Los dos son un alta, así que los dos llevan el +. El proveedor va
              en outline porque es el de al lado, no el principal. */}
          <Button variant="outline" onClick={() => { setEditingSupplier(null); setSupplierOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo proveedor
          </Button>
          <Button onClick={() => openProductForm(null)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo producto
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
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
              <StockFilters
                search={search} onSearch={setSearch}
                supplierFilter={supplierFilter} onSupplierFilter={setSupplierFilter}
                suppliers={suppliers}
                desde={stockDesde} onDesde={setStockDesde}
                hasta={stockHasta} onHasta={setStockHasta}
              />
            )}
          </div>

          <TabsContent value="products" className="mt-4">
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Precio venta</TableHead>
                    <TableHead>Coste</TableHead>
                    {/* Suben y bajan solas con las entradas y los consumos del
                        mostrador; aquí solo se corrigen tras un recuento. */}
                    <TableHead>Stock</TableHead>
                    <TableHead>Mínimo</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead className="text-right">
                      <div className="flex justify-end text-xs font-normal text-muted-foreground">
                        <span className="flex w-20 items-center justify-center gap-1"><ClipboardCheck className="h-3.5 w-3.5 text-primary" /> Ajustar</span>
                        <span className="flex w-20 items-center justify-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar</span>
                      </div>
                    </TableHead>
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
                      <TableCell className="text-sm">{p.priceCents > 0 ? formatPrice(p.priceCents) : "—"}</TableCell>
                      <TableCell className="text-sm">{p.costCents > 0 ? formatPrice(p.costCents) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.stock} ud</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.stockMin > 0 ? `${p.stockMin} ud` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={p.active ? "secondary" : "outline"} className={p.active ? "" : "text-muted-foreground"}>
                          {p.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <span className="flex w-20 justify-center">
                            <Button variant="ghost" size="icon" onClick={() => setAdjustTarget(p)}
                              title="Ajustar existencias tras un recuento">
                              <ClipboardCheck className="h-4 w-4 text-primary" />
                            </Button>
                          </span>
                          <span className="flex w-20 justify-center">
                            <Button variant="ghost" size="icon" onClick={() => openProductForm(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        {hayFiltros(search, supplierFilter, stockDesde, stockHasta)
                          ? "Ningún producto encaja con esos filtros."
                          : "Sin productos. Crea el primero."}
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
                    <TableHead>Activo</TableHead>
                    <TableHead className="text-right">
                      <div className="flex justify-end text-xs font-normal text-muted-foreground">
                        <span className="flex w-20 items-center justify-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar</span>
                        <span className="flex w-20 items-center justify-center gap-1"><Trash2 className="h-3.5 w-3.5 text-destructive" /> Eliminar</span>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id} className={!s.active ? "opacity-50" : undefined}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.phone ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{s.notes ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.active ? "secondary" : "outline"} className={s.active ? "" : "text-muted-foreground"}>
                          {s.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <span className="flex w-20 justify-center">
                            <Button variant="ghost" size="icon" onClick={() => { setEditingSupplier(s); setSupplierOpen(true) }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </span>
                          <span className="flex w-20 justify-center">
                            <Button variant="ghost" size="icon" onClick={() => setDeleteSupplierTarget(s)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {suppliers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Sin proveedores. Crea el primero.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Diálogo ajuste de existencias */}
        {adjustTarget && (
          <AdjustDialog
            product={adjustTarget}
            onClose={() => setAdjustTarget(null)}
            onDone={() => { setAdjustTarget(null); router.refresh() }}
          />
        )}

        {/* Diálogo producto */}
        <Dialog open={productOpen} onOpenChange={setProductOpen}>
          <DialogContent aria-describedby={undefined}>
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
                    {/* Los de baja no se ofrecen, pero el que ya tuviera el
                        producto sí: si no, editar el precio lo dejaría huérfano. */}
                    {suppliers
                      .filter((s) => s.active || s.id === editingProduct?.supplierId)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{!s.active ? " (inactivo)" : ""}
                        </SelectItem>
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
                {/* El stock de verdad no se escribe a mano en ningún sitio: sale
                    de las entradas y los consumos del mostrador. */}
                {editingProduct && (
                  <p className="text-xs text-muted-foreground">
                    Existencias ahora mismo: <strong>{editingProduct.stock} ud</strong>. Se mueven solas con
                    las entradas y los consumos del mostrador; para corregirlas tras un recuento, el botón
                    de ajustar.
                  </p>
                )}
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
          <DialogContent aria-describedby={undefined}>
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
    </div>
  )
}

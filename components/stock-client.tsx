"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, ArrowUpCircle, ArrowDownCircle, ShoppingCart, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StockFilters, hayFiltros } from "@/components/stock-filters"
import { addStockMovement, registerOrder } from "@/lib/actions"
import type { ProductRow, SupplierRow } from "@/components/products-client"

/**
 * El stock del día a día: lo que entra y lo que se gasta.
 *
 * Dar de alta un producto, cambiarle el precio o apuntar un proveedor nuevo no
 * está aquí: eso es catálogo y se hace en la gestión del centro
 * (components/products-client.tsx). Aquí solo se mueven existencias, que es lo
 * que pasa varias veces al día y con las cajas delante.
 */

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
      <DialogContent className="w-[90vw] max-w-4xl" style={{ maxWidth: "56rem" }} aria-describedby={undefined}>
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
      <DialogContent aria-describedby={undefined}>
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
  const [orderOpen, setOrderOpen] = useState(false)
  const [consumeTarget, setConsumeTarget] = useState<ProductRow | null>(null)
  const [entryTarget, setEntryTarget] = useState<ProductRow | null>(null)
  const [search, setSearch] = useState("")
  const [supplierFilter, setSupplierFilter] = useState("ALL")
  // Vacío es "sin tope", no cero: quien busca los que están por debajo de 3 no
  // quiere que al borrar el campo se le queden fuera todos los productos.
  const [stockDesde, setStockDesde] = useState("")
  const [stockHasta, setStockHasta] = useState("")

  const lowStock = products.filter((p) => p.active && p.stockMin > 0 && p.stock <= p.stockMin)
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
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-muted-foreground">{filteredProducts.length} de {products.length} productos</p>
        </div>
        <Button onClick={() => setOrderOpen(true)}>
          <ShoppingCart className="mr-2 h-4 w-4" /> Registrar pedido
        </Button>
      </div>

      <div className="p-6 space-y-6">
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

        <StockFilters
          search={search} onSearch={setSearch}
          supplierFilter={supplierFilter} onSupplierFilter={setSupplierFilter}
          suppliers={suppliers}
          desde={stockDesde} onDesde={setStockDesde}
          hasta={stockHasta} onHasta={setStockHasta}
        />

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
                <TableHead className="text-right">
                  <div className="flex justify-end text-xs font-normal text-muted-foreground">
                    <span className="flex w-20 items-center justify-center gap-1"><ArrowDownCircle className="h-3.5 w-3.5 text-green-600" /> Entrada</span>
                    <span className="flex w-20 items-center justify-center gap-1"><ArrowUpCircle className="h-3.5 w-3.5 text-orange-500" /> Consumo</span>
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
                  <TableCell>{stockBadge(p.stock, p.stockMin)}</TableCell>
                  <TableCell className="text-sm">{p.priceCents > 0 ? `${(p.priceCents / 100).toFixed(2)} €` : "—"}</TableCell>
                  <TableCell className="text-sm">{p.costCents > 0 ? `${(p.costCents / 100).toFixed(2)} €` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? "secondary" : "outline"}>{p.active ? "Sí" : "No"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <span className="flex w-20 justify-center">
                        <Button variant="ghost" size="icon" onClick={() => setEntryTarget(p)}>
                          <ArrowDownCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      </span>
                      <span className="flex w-20 justify-center">
                        <Button variant="ghost" size="icon"
                          onClick={() => setConsumeTarget(p)} disabled={p.stock === 0}>
                          <ArrowUpCircle className="h-4 w-4 text-orange-500" />
                        </Button>
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {hayFiltros(search, supplierFilter, stockDesde, stockHasta)
                      ? "Ningún producto encaja con esos filtros."
                      : "Sin productos. Se dan de alta en la gestión del centro."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

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

      </div>
    </div>
  )
}

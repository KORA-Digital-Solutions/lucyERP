"use client"

import { useState, useMemo } from "react"
import { ShoppingCart, Plus, Search, CreditCard, Banknote, Wallet, AlertCircle, Trash2, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createSale, payDebt, type SaleLineInput } from "@/lib/actions"

type Customer = { id: string; firstName: string; lastName: string | null; balanceCents: number }
type Service = { id: string; name: string; priceCents: number; pricingType: string; pricePerMinuteCents: number | null; durationMinutes: number }
type Product = { id: string; name: string; priceCents: number; stock: number }
type SaleLine = { id: string; type: string; description: string; quantity: number; unitPriceCents: number; discountPercent: number; totalCents: number; durationMinutes: number | null }
type Sale = {
  id: string
  saleType: string
  status: string
  paymentMethod: string
  totalCents: number
  paidCents: number
  createdAt: string
  notes: string | null
  customer: Customer | null
  user: { name: string; lastName: string | null }
  lines: SaleLine[]
}

interface Props {
  sales: Sale[]
  customers: Customer[]
  services: Service[]
  products: Product[]
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PAID: { label: "Pagado", cls: "bg-green-100 text-green-800 border-green-200" },
  DEBT: { label: "Debido", cls: "bg-red-100 text-red-800 border-red-200" },
  PARTIAL: { label: "Parcial", cls: "bg-orange-100 text-orange-800 border-orange-200" },
}

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Tarjeta",
  CASH: "Efectivo",
  BALANCE: "Saldo",
  DEBT: "Deuda",
}

function fmt(cents: number) {
  return (cents / 100).toFixed(2) + " €"
}

type DraftLine = {
  key: number
  type: "SERVICE" | "PRODUCT"
  itemId: string
  description: string
  quantity: number
  unitPriceCents: number
  discountPercent: number
  durationMinutes: number | null
}

function calcLineTotal(l: DraftLine) {
  const base = l.unitPriceCents * l.quantity
  return Math.round(base * (1 - l.discountPercent / 100))
}

export function SalesClient({ sales, customers, services, products }: Props) {
  const [search, setSearch] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [detailSale, setDetailSale] = useState<Sale | null>(null)
  const [payingDebt, setPayingDebt] = useState<Sale | null>(null)
  const [payDebtMethod, setPayDebtMethod] = useState<"CARD" | "CASH">("CASH")
  const [debtLoading, setDebtLoading] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return sales.filter((s) => {
      const name = s.customer ? `${s.customer.firstName} ${s.customer.lastName ?? ""}`.toLowerCase() : ""
      return !q || name.includes(q) || s.id.includes(q)
    })
  }, [sales, search])

  async function handlePayDebt() {
    if (!payingDebt) return
    setDebtLoading(true)
    const res = await payDebt(payingDebt.id, payDebtMethod)
    setDebtLoading(false)
    if (res.ok) {
      setPayingDebt(null)
    } else {
      alert(res.error)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground">Historial de ventas y cobros</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva venta
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Cliente</th>
                <th className="px-4 py-3 text-left font-medium">Tipo</th>
                <th className="px-4 py-3 text-left font-medium">Pago</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Trabajador</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No hay ventas registradas.
                  </td>
                </tr>
              )}
              {filtered.map((s) => {
                const st = STATUS_LABELS[s.status] ?? STATUS_LABELS.PAID
                const customerName = s.customer
                  ? `${s.customer.firstName} ${s.customer.lastName ?? ""}`.trim()
                  : "—"
                const workerName = `${s.user.name} ${s.user.lastName ?? ""}`.trim()
                const date = new Date(s.createdAt).toLocaleDateString("es-ES", {
                  day: "2-digit", month: "short", year: "numeric",
                })
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{date}</td>
                    <td className="px-4 py-3 font-medium">{customerName}</td>
                    <td className="px-4 py-3">
                      {s.saleType === "GIFT_CARD" ? (
                        <span className="flex items-center gap-1 text-purple-700"><Gift className="h-3 w-3" /> Tarjeta regalo</span>
                      ) : "Venta"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(s.totalCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{workerName}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setDetailSale(s)}>Ver</Button>
                        {(s.status === "DEBT" || s.status === "PARTIAL") && (
                          <Button variant="outline" size="sm" className="text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => { setPayingDebt(s); setPayDebtMethod("CASH") }}>
                            Cobrar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* NUEVA VENTA */}
      {showNew && (
        <NewSaleDialog
          customers={customers}
          services={services}
          products={products}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* DETALLE */}
      {detailSale && (
        <Dialog open onOpenChange={() => setDetailSale(null)}>
          <DialogContent style={{ maxWidth: "42rem" }}>
            <DialogHeader>
              <DialogTitle>Detalle de venta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>Cliente: <span className="text-foreground font-medium">{detailSale.customer ? `${detailSale.customer.firstName} ${detailSale.customer.lastName ?? ""}` : "—"}</span></div>
                <div>Tipo: <span className="text-foreground font-medium">{detailSale.saleType === "GIFT_CARD" ? "Tarjeta regalo" : "Venta"}</span></div>
                <div>Pago: <span className="text-foreground font-medium">{PAYMENT_LABELS[detailSale.paymentMethod]}</span></div>
                <div>Estado: <span className={`rounded-full border px-2 py-0.5 text-xs ${(STATUS_LABELS[detailSale.status] ?? STATUS_LABELS.PAID).cls}`}>{(STATUS_LABELS[detailSale.status] ?? STATUS_LABELS.PAID).label}</span></div>
              </div>
              <table className="w-full">
                <thead><tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1">Descripción</th>
                  <th className="text-right py-1">Cant.</th>
                  <th className="text-right py-1">Precio</th>
                  <th className="text-right py-1">Dto.</th>
                  <th className="text-right py-1">Total</th>
                </tr></thead>
                <tbody>
                  {detailSale.lines.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-1.5">{l.description}{l.durationMinutes ? ` (${l.durationMinutes} min)` : ""}</td>
                      <td className="text-right py-1.5">{l.quantity}</td>
                      <td className="text-right py-1.5">{fmt(l.unitPriceCents)}</td>
                      <td className="text-right py-1.5">{l.discountPercent > 0 ? `-${l.discountPercent}%` : "—"}</td>
                      <td className="text-right py-1.5 font-medium">{fmt(l.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-right space-y-1">
                <div className="text-muted-foreground">Total: <span className="text-foreground font-semibold text-base">{fmt(detailSale.totalCents)}</span></div>
                {detailSale.paidCents < detailSale.totalCents && (
                  <div className="text-red-600">Pendiente: {fmt(detailSale.totalCents - detailSale.paidCents)}</div>
                )}
              </div>
              {detailSale.notes && <p className="text-muted-foreground border-t pt-2">{detailSale.notes}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailSale(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* COBRAR DEUDA */}
      {payingDebt && (
        <Dialog open onOpenChange={() => setPayingDebt(null)}>
          <DialogContent style={{ maxWidth: "28rem" }}>
            <DialogHeader>
              <DialogTitle>Cobrar deuda pendiente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>Pendiente: <span className="font-semibold">{fmt(payingDebt.totalCents - payingDebt.paidCents)}</span></p>
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs">Método de pago</label>
                <Select value={payDebtMethod} onValueChange={(v) => setPayDebtMethod(v as "CARD" | "CASH")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                    <SelectItem value="CARD">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayingDebt(null)}>Cancelar</Button>
              <Button onClick={handlePayDebt} disabled={debtLoading}>
                {debtLoading ? "Guardando…" : "Confirmar cobro"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/* ─────────────────────────── NUEVA VENTA DIALOG ─────────────────────────── */

function NewSaleDialog({
  customers,
  services,
  products,
  onClose,
}: {
  customers: Customer[]
  services: Service[]
  products: Product[]
  onClose: () => void
}) {
  const [customerId, setCustomerId] = useState<string>("none")
  const [saleType, setSaleType] = useState<"SALE" | "GIFT_CARD">("SALE")
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "CASH" | "BALANCE" | "DEBT">("CASH")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([])
  const [lineKey, setLineKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Add line controls
  const [addType, setAddType] = useState<"SERVICE" | "PRODUCT">("SERVICE")
  const [addItemId, setAddItemId] = useState("")
  const [addQty, setAddQty] = useState(1)
  const [addDiscount, setAddDiscount] = useState(0)
  const [addDuration, setAddDuration] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")

  const selectedCustomer = customers.find((c) => c.id === customerId)

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase()
    return customers.filter((c) =>
      !q || `${c.firstName} ${c.lastName ?? ""}`.toLowerCase().includes(q)
    )
  }, [customers, customerSearch])

  function computeUnitPrice(): number {
    if (addType === "SERVICE") {
      const svc = services.find((s) => s.id === addItemId)
      if (!svc) return 0
      if (svc.pricingType === "PER_MINUTE" && svc.pricePerMinuteCents && addDuration) {
        return svc.pricePerMinuteCents * addDuration
      }
      return svc.priceCents
    } else {
      return products.find((p) => p.id === addItemId)?.priceCents ?? 0
    }
  }

  function addLine() {
    if (!addItemId) return
    const unitPriceCents = computeUnitPrice()
    let description = ""
    let durationMinutes: number | null = null

    if (addType === "SERVICE") {
      const svc = services.find((s) => s.id === addItemId)!
      description = svc.name
      if (svc.pricingType === "PER_MINUTE") {
        durationMinutes = addDuration ?? svc.durationMinutes
        description += ` (${durationMinutes} min)`
      }
    } else {
      description = products.find((p) => p.id === addItemId)!.name
    }

    const line: DraftLine = {
      key: lineKey,
      type: addType,
      itemId: addItemId,
      description,
      quantity: addQty,
      unitPriceCents,
      discountPercent: addDiscount,
      durationMinutes,
    }
    setLines((prev) => [...prev, line])
    setLineKey((k) => k + 1)
    setAddItemId("")
    setAddQty(1)
    setAddDiscount(0)
    setAddDuration(null)
  }

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)
    const discount = lines.reduce((s, l) => s + Math.round(l.unitPriceCents * l.quantity * l.discountPercent / 100), 0)
    const total = subtotal - discount
    return { subtotal, discount, total }
  }, [lines])

  async function handleSubmit() {
    if (lines.length === 0) { setError("Añade al menos una línea."); return }
    setLoading(true)
    setError("")
    const saleLines: SaleLineInput[] = lines.map((l) => ({
      type: l.type,
      serviceId: l.type === "SERVICE" ? l.itemId : undefined,
      productId: l.type === "PRODUCT" ? l.itemId : undefined,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      discountPercent: l.discountPercent,
      durationMinutes: l.durationMinutes ?? undefined,
      totalCents: calcLineTotal(l),
    }))
    const res = await createSale(
      customerId === "none" ? null : customerId,
      saleType,
      paymentMethod,
      saleLines,
      notes || null,
    )
    setLoading(false)
    if (res.ok) {
      onClose()
    } else {
      setError(res.error ?? "Error desconocido")
    }
  }

  const selectedService = addType === "SERVICE" ? services.find((s) => s.id === addItemId) : null

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: "54rem" }}>
        <DialogHeader>
          <DialogTitle>Nueva venta</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 text-sm">
          {/* LEFT: Config */}
          <div className="space-y-4">
            {/* Cliente */}
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Cliente (opcional)</label>
              <Input
                placeholder="Buscar cliente…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="mb-1"
              />
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cliente</SelectItem>
                  {filteredCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName ?? ""} {c.balanceCents > 0 ? `· Saldo: ${fmt(c.balanceCents)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de venta */}
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Tipo</label>
              <Select value={saleType} onValueChange={(v) => setSaleType(v as "SALE" | "GIFT_CARD")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALE">Venta</SelectItem>
                  <SelectItem value="GIFT_CARD">Tarjeta regalo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Método de pago */}
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Método de pago</label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH"><span className="flex items-center gap-2"><Banknote className="h-4 w-4" />Efectivo</span></SelectItem>
                  <SelectItem value="CARD"><span className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Tarjeta</span></SelectItem>
                  {selectedCustomer && selectedCustomer.balanceCents > 0 && (
                    <SelectItem value="BALANCE"><span className="flex items-center gap-2"><Wallet className="h-4 w-4" />Saldo cliente ({fmt(selectedCustomer.balanceCents)})</span></SelectItem>
                  )}
                  <SelectItem value="DEBT">Deuda (cobrar después)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notas */}
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Notas</label>
              <Input placeholder="Notas opcionales…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {/* Totales */}
            <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span>{fmt(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Descuento</span><span>-{fmt(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base border-t pt-1 mt-1">
                <span>Total</span><span>{fmt(totals.total)}</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Lines */}
          <div className="space-y-4">
            {/* Add line */}
            <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
              <div className="flex gap-2">
                <Select value={addType} onValueChange={(v) => { setAddType(v as any); setAddItemId("") }}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SERVICE">Servicio</SelectItem>
                    <SelectItem value="PRODUCT">Producto</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={addItemId} onValueChange={setAddItemId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {addType === "SERVICE"
                      ? services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                      : products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (stock: {p.stock})</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="space-y-0.5">
                  <label className="text-xs text-muted-foreground">Cant.</label>
                  <Input
                    type="number" min={1} value={addQty}
                    onChange={(e) => setAddQty(Number(e.target.value))}
                    className="w-16"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-xs text-muted-foreground">Dto. %</label>
                  <Input
                    type="number" min={0} max={100} value={addDiscount}
                    onChange={(e) => setAddDiscount(Number(e.target.value))}
                    className="w-20"
                  />
                </div>
                {selectedService?.pricingType === "PER_MINUTE" && (
                  <div className="space-y-0.5">
                    <label className="text-xs text-muted-foreground">Minutos</label>
                    <Input
                      type="number" min={1} value={addDuration ?? selectedService.durationMinutes}
                      onChange={(e) => setAddDuration(Number(e.target.value))}
                      className="w-24"
                    />
                  </div>
                )}
                <div className="flex items-end">
                  <Button size="sm" onClick={addLine} disabled={!addItemId}>
                    <Plus className="h-4 w-4 mr-1" /> Añadir
                  </Button>
                </div>
              </div>
              {addItemId && (
                <p className="text-xs text-muted-foreground">
                  Precio unitario: {fmt(computeUnitPrice())}
                  {addDiscount > 0 && ` → ${fmt(Math.round(computeUnitPrice() * (1 - addDiscount / 100)))}`}
                </p>
              )}
            </div>

            {/* Lines list */}
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {lines.length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-4">Sin líneas. Añade servicios o productos.</p>
              )}
              {lines.map((l) => (
                <div key={l.key} className="flex items-center gap-2 rounded border px-3 py-2 text-xs">
                  <span className="flex-1 truncate">{l.description}</span>
                  <span className="text-muted-foreground">×{l.quantity}</span>
                  {l.discountPercent > 0 && <span className="text-green-700">-{l.discountPercent}%</span>}
                  <span className="font-medium">{fmt(calcLineTotal(l))}</span>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || lines.length === 0}>
            {loading ? "Guardando…" : `Registrar · ${fmt(totals.total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

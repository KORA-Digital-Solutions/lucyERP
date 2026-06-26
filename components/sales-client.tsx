"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import {
  ArrowLeft, Plus, Search, CreditCard, Banknote, AlertCircle,
  Trash2, Gift, ShoppingCart, X, Clock, Wallet, Scissors, Package, Eye, CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createSale, payDebt, type SaleLineInput } from "@/lib/actions"
import { cn } from "@/lib/utils"

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Customer = { id: string; firstName: string; lastName: string | null; phone: string; balanceCents: number }
type Worker   = { id: string; name: string; lastName: string | null; color: string | null }
type Service  = { id: string; name: string; priceCents: number; pricingType: string; pricePerMinuteCents: number | null; durationMinutes: number }
type Product  = { id: string; name: string; priceCents: number; stock: number }
type SaleLine = { id: string; type: string; description: string; quantity: number; unitPriceCents: number; discountPercent: number; totalCents: number; durationMinutes: number | null }
type Sale = {
  id: string; saleType: string; status: string; paymentMethod: string
  totalCents: number; paidCents: number; createdAt: string; notes: string | null
  customer: Customer | null
  user: { name: string; lastName: string | null }
  lines: SaleLine[]
  balanceMovements: { amountCents: number }[]
}

interface Props {
  sales: Sale[]
  customers: Customer[]
  services: Service[]
  products: Product[]
  workers: Worker[]
  currentUserId: string | null
  cashOpen: boolean
}

type LineType  = "SERVICE" | "PRODUCT" | "GIFT_CARD"

type DraftLine = {
  key: number; type: LineType; itemId: string; description: string
  workerId: string | null; quantity: number; unitPriceCents: number
  discountPercent: number; durationMinutes: number | null
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function lineTotal(l: DraftLine) {
  return Math.round(l.unitPriceCents * l.quantity * (1 - l.discountPercent / 100))
}

function fmtEur(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function customerLabel(c: Customer) {
  return c.lastName ? `${c.lastName}, ${c.firstName}` : c.firstName
}

function searchCustomers(customers: Customer[], query: string): Customer[] {
  if (!query.trim()) return customers.slice(0, 8)
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  return customers.filter((c) => {
    const hay = normalize(`${c.firstName} ${c.lastName ?? ""} ${c.phone}`)
    return tokens.every((t) => hay.includes(t))
  }).slice(0, 8)
}

/* ─── Status/payment labels ──────────────────────────────────────────────── */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PAID:    { label: "Pagado",  cls: "bg-green-100 text-green-800 border-green-200" },
  DEBT:    { label: "Debido",  cls: "bg-red-100 text-red-800 border-red-200" },
  PARTIAL: { label: "Parcial", cls: "bg-orange-100 text-orange-800 border-orange-200" },
}
const PAYMENT_LABELS: Record<string, string> = { CARD: "Tarjeta", CASH: "Efectivo", BALANCE: "Saldo", DEBT: "Deuda" }

/* ═══════════════════════════════════════════════════════════════════════════
   Root — lista de ventas
═══════════════════════════════════════════════════════════════════════════ */

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function SalesClient({ sales, customers, services, products, workers, currentUserId, cashOpen }: Props) {
  const [mode, setMode] = useState<"list" | "pos">("list")
  const [showNoCashDialog, setShowNoCashDialog] = useState(false)
  const [detailSale, setDetailSale] = useState<Sale | null>(null)
  const [payingDebt, setPayingDebt] = useState<Sale | null>(null)
  const [payDebtMethod, setPayDebtMethod] = useState<"CARD" | "CASH">("CASH")
  const [debtLoading, setDebtLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState("")
  const [workerFilter, setWorkerFilter] = useState("ALL")
  const [paymentFilter, setPaymentFilter] = useState("ALL")
  const [dateMode, setDateMode] = useState<"today" | "week" | "custom">("today")
  const [customFrom, setCustomFrom] = useState(todayStr())
  const [customTo, setCustomTo] = useState(todayStr())

  // Unique workers derived from sales for filter dropdown
  const saleWorkers = useMemo(() => {
    const map = new Map<string, string>()
    sales.forEach((s) => {
      const key = `${s.user.name} ${s.user.lastName ?? ""}`.trim()
      map.set(key, key)
    })
    return Array.from(map.keys()).sort()
  }, [sales])

  const { dateFrom, dateTo } = useMemo(() => {
    const today = todayStr()
    if (dateMode === "today") return { dateFrom: today, dateTo: today }
    if (dateMode === "week") {
      const now = new Date()
      const day = now.getDay() === 0 ? 6 : now.getDay() - 1 // Mon=0
      const mon = new Date(now)
      mon.setDate(now.getDate() - day)
      return { dateFrom: localDateStr(mon), dateTo: today }
    }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [dateMode, customFrom, customTo])

  const filtered = useMemo(() => {
    const q = normalize(clientSearch)
    const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null
    const to = dateTo ? new Date(dateTo + "T23:59:59") : null
    return sales.filter((s) => {
      if (q) {
        const name = s.customer ? normalize(`${s.customer.firstName} ${s.customer.lastName ?? ""}`) : ""
        if (!name.includes(q)) return false
      }
      if (workerFilter !== "ALL") {
        const wName = `${s.user.name} ${s.user.lastName ?? ""}`.trim()
        if (wName !== workerFilter) return false
      }
      if (paymentFilter !== "ALL" && s.paymentMethod !== paymentFilter) return false
      const createdAt = new Date(s.createdAt)
      if (from && createdAt < from) return false
      if (to && createdAt > to) return false
      return true
    })
  }, [sales, clientSearch, workerFilter, paymentFilter, dateFrom, dateTo])

  if (mode === "pos") {
    return <POSView customers={customers} services={services} products={products} workers={workers} currentUserId={currentUserId} onBack={() => setMode("list")} />
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground">{sales.length} registros</p>
        </div>
        <Button size="lg" onClick={() => cashOpen ? setMode("pos") : setShowNoCashDialog(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva venta
        </Button>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 w-52" placeholder="Buscar cliente…" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={dateMode === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateMode("today")}
            >
              Hoy
            </Button>
            <Button
              variant={dateMode === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateMode("week")}
            >
              Esta semana
            </Button>
            <Button
              variant={dateMode === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateMode("custom")}
            >
              <CalendarDays className="h-3.5 w-3.5 mr-1" /> Rango
            </Button>
          </div>
          {dateMode === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              />
              <span className="text-muted-foreground text-sm">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              />
            </div>
          )}
          <span className="text-sm text-muted-foreground ml-auto">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="ALL">Todos los trabajadores</option>
            {saleWorkers.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="ALL">Todos los pagos</option>
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="DEBT">Deuda</option>
          </select>
          {(clientSearch || workerFilter !== "ALL" || paymentFilter !== "ALL" || dateMode !== "today") && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => {
              setClientSearch(""); setWorkerFilter("ALL"); setPaymentFilter("ALL"); setDateMode("today"); setCustomFrom(todayStr()); setCustomTo(todayStr())
            }}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Cliente</th>
                <th className="px-4 py-3 text-left font-medium">Pago</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Trabajador</th>
                <th className="px-4 py-3 text-right font-medium">
                  <div className="flex justify-end text-xs font-normal text-muted-foreground">
                    <span className="flex w-20 items-center justify-center gap-1"><Eye className="h-3.5 w-3.5" /> Detalle</span>
                    <span className="flex w-20 items-center justify-center gap-1"><Banknote className="h-3.5 w-3.5 text-green-600" /> Cobrar</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No hay ventas para los filtros aplicados.</td></tr>
              )}
              {filtered.map((s) => {
                const st = STATUS_META[s.status] ?? STATUS_META.PAID
                const customerName = s.customer ? customerLabel(s.customer) : "—"
                const workerName = `${s.user.name} ${s.user.lastName ?? ""}`.trim()
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 font-medium">{customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtEur(s.totalCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{workerName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <span className="flex w-20 justify-center">
                          <Button variant="ghost" size="icon" onClick={() => setDetailSale(s)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </span>
                        <span className="flex w-20 justify-center">
                          {(s.status === "DEBT" || s.status === "PARTIAL") && (
                            <Button variant="ghost" size="icon" className="text-green-700 hover:text-green-800 hover:bg-green-50"
                              onClick={() => { setPayingDebt(s); setPayDebtMethod("CASH") }}>
                              <Banknote className="h-4 w-4" />
                            </Button>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Detail */}
      {detailSale && (
        <Dialog open onOpenChange={() => setDetailSale(null)}>
          <DialogContent style={{ maxWidth: "42rem" }}>
            <DialogHeader><DialogTitle>Detalle de venta</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>Cliente: <span className="text-foreground font-medium">{detailSale.customer ? customerLabel(detailSale.customer) : "Sin cliente"}</span></div>
                <div>Pago: <span className="text-foreground font-medium">{PAYMENT_LABELS[detailSale.paymentMethod]}</span></div>
              </div>
              <table className="w-full">
                <thead><tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1">Descripción</th>
                  <th className="text-right py-1">Cant.</th>
                  <th className="text-right py-1">P.U.</th>
                  <th className="text-right py-1">Dto.</th>
                  <th className="text-right py-1">Total</th>
                </tr></thead>
                <tbody>
                  {detailSale.lines.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-1.5">{l.description}{l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}</td>
                      <td className="text-right tabular-nums py-1.5">{l.quantity}</td>
                      <td className="text-right tabular-nums py-1.5">{fmtEur(l.unitPriceCents)}</td>
                      <td className="text-right py-1.5">{l.discountPercent > 0 ? `-${l.discountPercent}%` : "—"}</td>
                      <td className="text-right tabular-nums py-1.5 font-medium">{fmtEur(l.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(() => {
                const balanceUsed = detailSale.balanceMovements.reduce((s, m) => s + Math.abs(m.amountCents), 0)
                return balanceUsed > 0 ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 flex items-center justify-between text-sm">
                    <span className="text-blue-700 font-medium flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" /> Saldo del cliente aplicado
                    </span>
                    <span className="tabular-nums font-semibold text-blue-700">−{fmtEur(balanceUsed)}</span>
                  </div>
                ) : null
              })()}
              <div className="text-right">
                <span className="text-muted-foreground mr-2">Total:</span>
                <span className="font-semibold text-base tabular-nums">{fmtEur(detailSale.totalCents)}</span>
                {detailSale.paidCents < detailSale.totalCents && (
                  <div className="text-red-600 mt-1">Pendiente: {fmtEur(detailSale.totalCents - detailSale.paidCents)}</div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* No cash register dialog */}
      {showNoCashDialog && (
        <Dialog open onOpenChange={() => setShowNoCashDialog(false)}>
          <DialogContent style={{ maxWidth: "26rem" }}>
            <DialogHeader><DialogTitle>Caja no abierta</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Para registrar una nueva venta primero debes abrir la caja del día.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNoCashDialog(false)}>Cancelar</Button>
              <Button onClick={() => { window.location.href = "/cash-register" }}>Abrir caja</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Pay debt */}
      {payingDebt && (
        <Dialog open onOpenChange={() => setPayingDebt(null)}>
          <DialogContent style={{ maxWidth: "28rem" }}>
            <DialogHeader><DialogTitle>Cobrar deuda</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <p>Pendiente: <span className="font-semibold">{fmtEur(payingDebt.totalCents - payingDebt.paidCents)}</span></p>
              <Select value={payDebtMethod} onValueChange={(v) => setPayDebtMethod(v as "CARD" | "CASH")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Efectivo</SelectItem>
                  <SelectItem value="CARD">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayingDebt(null)}>Cancelar</Button>
              <Button onClick={async () => {
                setDebtLoading(true)
                const res = await payDebt(payingDebt.id, payDebtMethod)
                setDebtLoading(false)
                if (res.ok) setPayingDebt(null); else alert(res.error)
              }} disabled={debtLoading}>{debtLoading ? "Guardando…" : "Confirmar cobro"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   POS — pantalla completa
═══════════════════════════════════════════════════════════════════════════ */

function POSView({ customers, services, products, workers, currentUserId, onBack }: {
  customers: Customer[]; services: Service[]; products: Product[]
  workers: Worker[]; currentUserId: string | null; onBack: () => void
}) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [giftRecipient, setGiftRecipient] = useState<Customer | null>(null)
  const [lines, setLines] = useState<DraftLine[]>([])
  const [lineKey, setLineKey] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "DEBT">("CASH")
  const [balanceAppliedCents, setBalanceAppliedCents] = useState(0)
  const [balanceInput, setBalanceInput] = useState("")
  const [tenderedInput, setTenderedInput] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [showCancel, setShowCancel] = useState(false)

  const now = new Date()
  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })

  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)
  const discountCents = lines.reduce((s, l) => s + (l.unitPriceCents * l.quantity - lineTotal(l)), 0)
  const totalCents = subtotalCents - discountCents
  const customerBalance = customer?.balanceCents ?? 0
  const remainingCents = Math.max(0, totalCents - balanceAppliedCents)
  const tenderedCents = Math.round(Number(tenderedInput) * 100)
  const changeCents = paymentMethod === "CASH" && tenderedCents > remainingCents ? tenderedCents - remainingCents : 0

  const hasGiftCard = lines.some((l) => l.type === "GIFT_CARD")

  // Ajustar saldo aplicado cuando cambia el cliente o el total
  useEffect(() => {
    const maxApply = Math.min(customerBalance, totalCents)
    setBalanceAppliedCents(maxApply)
    setBalanceInput(maxApply > 0 ? (maxApply / 100).toFixed(2) : "")
  }, [customer?.id, totalCents])

  function validate(): string[] {
    const errs: string[] = []
    if (lines.length === 0) errs.push("Añade al menos una línea al ticket.")
    if (paymentMethod === "CASH" && tenderedCents > 0 && tenderedCents < remainingCents)
      errs.push("El importe entregado es inferior al resto a cobrar.")
    lines.forEach((l) => {
      if (l.type === "SERVICE" && !l.workerId)
        errs.push(`Asigna un profesional a "${l.description}".`)
    })
    if (hasGiftCard && !giftRecipient)
      errs.push("Selecciona el cliente destinatario de la tarjeta regalo.")
    return errs
  }

  async function handleSubmit() {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setLoading(true)

    const saleLines: SaleLineInput[] = lines.map((l) => ({
      type: l.type,
      serviceId: l.type === "SERVICE" ? l.itemId : undefined,
      productId: l.type === "PRODUCT" ? l.itemId : undefined,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      discountPercent: l.discountPercent,
      durationMinutes: l.durationMinutes ?? undefined,
      totalCents: lineTotal(l),
    }))

    const res = await createSale(
      customer?.id ?? null,
      hasGiftCard ? "GIFT_CARD" : "SALE",
      paymentMethod,
      saleLines,
      notes || null,
      giftRecipient?.id ?? null,
      balanceAppliedCents,
    )
    setLoading(false)
    if (res.ok) onBack()
    else setErrors([res.error ?? "Error inesperado"])
  }

  function addLine(line: DraftLine) {
    setLines((prev) => [...prev, { ...line, key: lineKey }])
    setLineKey((k) => k + 1)
  }

  function handleBack() {
    if (lines.length > 0) setShowCancel(true)
    else onBack()
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Topbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b bg-background shrink-0">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <span className="font-semibold flex-1">Nueva venta</span>
        <span className="text-sm text-muted-foreground capitalize">{dateStr} · {timeStr}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT */}
        <div className="flex flex-col flex-1 overflow-y-auto px-6 py-5 space-y-5 border-r">
          {/* Cliente comprador */}
          <CustomerSelector
            label="Cliente"
            customers={customers}
            selected={customer}
            onSelect={setCustomer}
            onClear={() => setCustomer(null)}
          />

          {/* Añadir línea */}
          <AddLinePanel
            services={services}
            products={products}
            workers={workers}
            currentUserId={currentUserId}
            customers={customers}
            giftRecipient={giftRecipient}
            onGiftRecipientChange={setGiftRecipient}
            onAdd={addLine}
          />

          {/* Líneas */}
          <div className="flex-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Líneas del ticket {lines.length > 0 && <span className="text-foreground">({lines.length})</span>}
            </h3>
            {lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 text-muted-foreground text-sm gap-2">
                <ShoppingCart className="h-8 w-8 opacity-25" />
                <p>Aún no hay líneas. Elige un tipo arriba y busca un servicio, producto o tarjeta.</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">Concepto</th>
                      <th className="text-left px-3 py-2.5 font-medium w-40">Profesional</th>
                      <th className="text-center px-3 py-2.5 font-medium w-24">Cant.</th>
                      <th className="text-right px-3 py-2.5 font-medium w-24">P.U.</th>
                      <th className="text-center px-3 py-2.5 font-medium w-28">Dto. %</th>
                      <th className="text-right px-3 py-2.5 font-medium w-24">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <LineRow
                        key={l.key}
                        line={l}
                        workers={workers}
                        onUpdate={(patch) => setLines((prev) => prev.map((x) => x.key === l.key ? { ...x, ...patch } : x))}
                        onRemove={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Input placeholder="Notas (opcional)…" value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
        </div>

        {/* RIGHT */}
        <div className="w-80 shrink-0 flex flex-col overflow-y-auto px-5 py-5 space-y-4 bg-muted/20">
          {/* Resumen */}
          <div className="rounded-xl border bg-background p-4 space-y-2 text-sm">
            <h3 className="font-semibold mb-3">Resumen</h3>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span className="tabular-nums">{fmtEur(subtotalCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Descuentos</span><span className="tabular-nums">−{fmtEur(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2 mt-1">
              <span>Total</span><span className="tabular-nums">{fmtEur(totalCents)}</span>
            </div>
            {discountCents > 0 && <p className="text-xs text-green-700">Ahorro: {fmtEur(discountCents)}</p>}

            {/* Saldo del cliente */}
            {customerBalance > 0 && (
              <div className="border-t pt-3 mt-1 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Saldo del cliente</span>
                  <span className="font-medium text-blue-700 tabular-nums">{fmtEur(customerBalance)} disponible</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground shrink-0">Aplicar (€)</label>
                  <Input
                    type="number" step="0.01" min="0"
                    max={(Math.min(customerBalance, totalCents) / 100).toFixed(2)}
                    placeholder="0,00"
                    value={balanceInput}
                    onChange={(e) => {
                      setBalanceInput(e.target.value)
                      const v = Math.round(Number(e.target.value) * 100)
                      const clamped = Math.min(Math.max(0, v), Math.min(customerBalance, totalCents))
                      setBalanceAppliedCents(clamped)
                    }}
                    onBlur={() => {
                      setBalanceInput(balanceAppliedCents > 0 ? (balanceAppliedCents / 100).toFixed(2) : "")
                    }}
                    className="tabular-nums h-8 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const max = Math.min(customerBalance, totalCents)
                      setBalanceAppliedCents(max)
                      setBalanceInput((max / 100).toFixed(2))
                    }}
                    className="text-xs text-blue-700 hover:text-blue-900 shrink-0 font-medium"
                  >
                    Todo
                  </button>
                </div>
                {balanceAppliedCents > 0 && (
                  <div className="flex justify-between text-blue-700 font-medium">
                    <span>Saldo a descontar</span>
                    <span className="tabular-nums">−{fmtEur(balanceAppliedCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>A cobrar</span>
                  <span className="tabular-nums">{fmtEur(remainingCents)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pago */}
          <div className="rounded-xl border bg-background p-4 space-y-3 text-sm">
            <h3 className="font-semibold">
              {remainingCents === 0 ? "Forma de pago" : `Cobrar ${fmtEur(remainingCents)}`}
            </h3>

            {remainingCents === 0 ? (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-xs text-green-700 text-center font-medium">
                Cubierto completamente con saldo del cliente
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "CASH", Icon: Banknote,    label: "Efectivo" },
                    { id: "CARD", Icon: CreditCard,  label: "Tarjeta" },
                    { id: "DEBT", Icon: AlertCircle, label: "Deuda" },
                  ] as const).map(({ id, Icon, label }) => (
                    <button key={id} type="button" onClick={() => setPaymentMethod(id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border-2 py-3 px-1 text-xs font-medium transition-colors",
                        paymentMethod === id
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}>
                      <Icon className="h-5 w-5" />{label}
                    </button>
                  ))}
                </div>

                {paymentMethod === "CASH" && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Importe entregado (€)</label>
                    <Input
                      type="number" step="0.01" min="0"
                      placeholder={(remainingCents / 100).toFixed(2)}
                      value={tenderedInput}
                      onChange={(e) => setTenderedInput(e.target.value)}
                      className="tabular-nums"
                    />
                    {changeCents > 0 && (
                      <div className="flex justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                        <span className="text-green-700">Cambio</span>
                        <span className="font-semibold text-green-700 tabular-nums">{fmtEur(changeCents)}</span>
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === "DEBT" && (
                  <p className="text-xs text-muted-foreground">
                    {balanceAppliedCents > 0
                      ? `Se descontará ${fmtEur(balanceAppliedCents)} del saldo y ${fmtEur(remainingCents)} quedarán como deuda.`
                      : "El importe quedará como deuda del cliente y podrás cobrarlo desde el listado."}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 mt-auto pt-2">
            <Button className="w-full h-12 text-base font-semibold" onClick={handleSubmit}
              disabled={loading || lines.length === 0}>
              {loading ? "Registrando…" : remainingCents === 0 ? `Registrar · ${fmtEur(totalCents)}` : `Cobrar · ${fmtEur(remainingCents)}`}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleBack}>Cancelar</Button>
          </div>
        </div>
      </div>

      {showCancel && (
        <Dialog open onOpenChange={() => setShowCancel(false)}>
          <DialogContent style={{ maxWidth: "26rem" }}>
            <DialogHeader><DialogTitle>¿Cancelar la venta?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Se perderán las líneas añadidas.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(false)}>Seguir editando</Button>
              <Button variant="destructive" onClick={onBack}>Cancelar venta</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/* ─── Customer selector (shared) ─────────────────────────────────────────── */

function CustomerSelector({ label, customers, selected, onSelect, onClear, placeholder }: {
  label: string; customers: Customer[]; selected: Customer | null
  onSelect: (c: Customer) => void; onClear: () => void; placeholder?: string
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", out)
    return () => document.removeEventListener("mousedown", out)
  }, [])

  const results = useMemo(() => searchCustomers(customers, query), [customers, query])

  if (selected) {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{label}</label>
        <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{customerLabel(selected)}</p>
            {selected.balanceCents !== 0 && (
              <p className={cn("text-xs", selected.balanceCents > 0 ? "text-green-700" : "text-red-600")}>
                {selected.balanceCents > 0 ? "Saldo:" : "Debe:"} {fmtEur(selected.balanceCents)}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground shrink-0 h-7 w-7 p-0" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 h-11"
          placeholder={placeholder ?? "Buscar por nombre, apellidos o teléfono…"}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-xl shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Sin resultados para "{query}"</div>
          ) : (
            results.map((c) => (
              <button key={c.id} type="button"
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 text-left transition-colors"
                onClick={() => { onSelect(c); setQuery(""); setOpen(false) }}>
                <span className="text-sm font-medium truncate">{customerLabel(c)}</span>
                {c.balanceCents !== 0 && (
                  <span className={cn("text-xs ml-3 shrink-0", c.balanceCents > 0 ? "text-green-700" : "text-red-600")}>
                    {c.balanceCents > 0 ? "+" : "−"}{fmtEur(c.balanceCents)}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Add line panel ─────────────────────────────────────────────────────── */

type AddLineTab = "SERVICE" | "PRODUCT" | "GIFT_CARD"

function AddLinePanel({ services, products, workers, currentUserId, customers, giftRecipient, onGiftRecipientChange, onAdd }: {
  services: Service[]; products: Product[]; workers: Worker[]
  currentUserId: string | null
  customers: Customer[]
  giftRecipient: Customer | null
  onGiftRecipientChange: (c: Customer | null) => void
  onAdd: (line: DraftLine) => void
}) {
  const [tab, setTab] = useState<AddLineTab>("SERVICE")
  const [query, setQuery] = useState("")
  const [giftAmount, setGiftAmount] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", out)
    return () => document.removeEventListener("mousedown", out)
  }, [])

  const tabItems = useMemo(() => {
    const q = normalize(query)
    if (tab === "SERVICE") return services.filter((s) => !q || normalize(s.name).includes(q))
    return products.filter((p) => !q || normalize(p.name).includes(q))
  }, [tab, query, services, products])

  function addGiftCard() {
    const cents = Math.round(Number(giftAmount) * 100)
    if (!cents || cents <= 0) return
    const recipientName = giftRecipient ? customerLabel(giftRecipient) : ""
    onAdd({
      key: 0, type: "GIFT_CARD", itemId: "gift_card",
      description: recipientName ? `Tarjeta regalo — ${recipientName}` : "Tarjeta regalo",
      workerId: null, quantity: 1, unitPriceCents: cents, discountPercent: 0, durationMinutes: null,
    })
    setGiftAmount("")
  }

  const tabs: { id: AddLineTab; label: string; icon: React.ElementType }[] = [
    { id: "SERVICE",   label: "Servicio",      icon: Scissors },
    { id: "PRODUCT",   label: "Producto",       icon: Package },
    { id: "GIFT_CARD", label: "Tarjeta regalo", icon: Gift },
  ]

  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Añadir línea</h3>
      <div className="rounded-xl border bg-background p-4 space-y-3">
        <div className="flex gap-1">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button key={t.id} type="button"
                onClick={() => { setTab(t.id); setQuery(""); setOpen(false) }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}>
                <Icon className="h-3.5 w-3.5" />{t.label}
              </button>
            )
          })}
        </div>

        {tab === "GIFT_CARD" ? (
          <div className="space-y-3">
            {/* Destinatario */}
            <CustomerSelector
              label="Destinatario (quien recibe el saldo)"
              customers={customers}
              selected={giftRecipient}
              onSelect={onGiftRecipientChange}
              onClear={() => onGiftRecipientChange(null)}
              placeholder="Buscar cliente destinatario…"
            />
            {/* Importe */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Importe (€)</label>
                <Input
                  type="number" step="0.01" min="0" placeholder="0,00"
                  value={giftAmount}
                  onChange={(e) => setGiftAmount(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <Button onClick={addGiftCard} disabled={!giftAmount || Number(giftAmount) <= 0 || !giftRecipient}>
                <Plus className="h-4 w-4 mr-1" /> Añadir
              </Button>
            </div>
            {!giftRecipient && (
              <p className="text-xs text-muted-foreground">Selecciona primero el destinatario.</p>
            )}
          </div>
        ) : (
          <div ref={ref} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 h-11"
                placeholder={tab === "SERVICE" ? "Buscar servicio…" : "Buscar producto…"}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
              />
            </div>
            {open && tabItems.length > 0 && (
              <div className="absolute z-40 w-full mt-1 bg-background border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                {tabItems.slice(0, 10).map((item) => {
                  const isService = tab === "SERVICE"
                  const s = item as Service
                  const p = item as Product
                  return (
                    <button key={item.id} type="button"
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 text-left transition-colors text-sm"
                      onClick={() => {
                        if (isService) {
                          const defaultWorker = currentUserId
                            ? workers.find((w) => w.id === currentUserId)?.id ?? (workers.length === 1 ? workers[0].id : null)
                            : (workers.length === 1 ? workers[0].id : null)
                          onAdd({
                            key: 0, type: "SERVICE", itemId: s.id, description: s.name,
                            workerId: defaultWorker,
                            quantity: 1, unitPriceCents: s.priceCents, discountPercent: 0,
                            durationMinutes: s.pricingType === "PER_MINUTE" ? s.durationMinutes : null,
                          })
                        } else {
                          onAdd({
                            key: 0, type: "PRODUCT", itemId: p.id, description: p.name,
                            workerId: null, quantity: 1, unitPriceCents: p.priceCents, discountPercent: 0, durationMinutes: null,
                          })
                        }
                        setQuery(""); setOpen(false)
                      }}>
                      <span className="font-medium truncate">{item.name}</span>
                      <span className="text-muted-foreground tabular-nums ml-3 shrink-0">
                        {isService
                          ? (s.pricingType === "PER_MINUTE" && s.pricePerMinuteCents ? `${fmtEur(s.pricePerMinuteCents)}/min` : fmtEur(s.priceCents))
                          : <><span className={p.stock === 0 ? "text-red-500" : ""}>{p.stock} ud</span> · {fmtEur(p.priceCents)}</>
                        }
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Line row ───────────────────────────────────────────────────────────── */

function LineRow({ line, workers, onUpdate, onRemove }: {
  line: DraftLine; workers: Worker[]
  onUpdate: (p: Partial<DraftLine>) => void; onRemove: () => void
}) {
  const total = lineTotal(line)
  const [discountStr, setDiscountStr] = useState(line.discountPercent === 0 ? "" : String(line.discountPercent))

  return (
    <tr className="border-b last:border-0 group">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate max-w-[14rem]">{line.description}</span>
          {line.type === "SERVICE" && line.durationMinutes && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0">
              <Clock className="h-3 w-3" />{line.durationMinutes}m
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-2">
        {line.type === "SERVICE" ? (
          <Select value={line.workerId ?? ""} onValueChange={(v) => onUpdate({ workerId: v })}>
            <SelectTrigger className={cn("h-8 text-xs w-36", !line.workerId && "border-orange-300 text-orange-600")}>
              <SelectValue placeholder="Profesional…" />
            </SelectTrigger>
            <SelectContent>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name} {w.lastName ?? ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>

      <td className="px-3 py-2 text-center">
        {line.type === "GIFT_CARD" ? <span className="text-sm">1</span> : (
          <div className="flex items-center justify-center gap-1">
            <button type="button"
              className="h-7 w-7 rounded border text-muted-foreground hover:bg-muted flex items-center justify-center text-base leading-none"
              onClick={() => onUpdate({ quantity: Math.max(1, line.quantity - 1) })}>−</button>
            <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
            <button type="button"
              className="h-7 w-7 rounded border text-muted-foreground hover:bg-muted flex items-center justify-center text-base leading-none"
              onClick={() => onUpdate({ quantity: line.quantity + 1 })}>+</button>
          </div>
        )}
      </td>

      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{fmtEur(line.unitPriceCents)}</td>

      <td className="px-3 py-2 text-center">
        {line.type === "GIFT_CARD" ? <span className="text-muted-foreground text-xs">—</span> : (
          <div className="relative w-24">
            <Input
              type="number" min={0} max={100}
              value={discountStr}
              placeholder="0"
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const raw = e.target.value.replace(/^0+(?=\d)/, "")
                setDiscountStr(raw)
                const n = Math.min(100, Math.max(0, Number(raw) || 0))
                onUpdate({ discountPercent: n })
              }}
              className="h-8 text-center text-sm tabular-nums pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
          </div>
        )}
      </td>

      <td className="px-3 py-2.5 text-right text-sm font-medium tabular-nums">{fmtEur(total)}</td>

      <td className="px-2 py-2">
        <button type="button" onClick={onRemove}
          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

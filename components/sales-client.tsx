"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import {
  ArrowLeft, Plus, Search, CreditCard, Banknote, AlertCircle,
  Trash2, Gift, ShoppingCart, X, Clock, Wallet, Scissors, Package, CalendarDays, Receipt, UserPlus,
  FileText,
  Bell, CheckCircle2, Pin, CalendarClock, Ticket,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  useTableSort, SortableTableHead, byText, byNumber, type SortRule,
} from "@/components/sortable-table-head"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createSale, payDebt, getCustomerReminderAlerts, completeCustomerReminder,
  getBillableAppointments, forgetOperator,
  type SaleLineInput, type BillableAppointment,
} from "@/lib/actions"
import {
  getRedeemableVouchers,
  type CustomerVoucherRow, type VoucherTemplateRow,
} from "@/lib/voucher-actions"
import { sessionSavingsCents, voucherBalances, type VoucherBalance } from "@/lib/vouchers"
import { PinDialog } from "@/components/pin-dialog"
import { QuickCustomerDialog } from "@/components/quick-customer-dialog"
import { ClientProfileDialog } from "@/components/client-profile-dialog"
import { QuickReminderDialog } from "@/components/quick-reminder-dialog"
import { customerLabel, capitalizeFirst } from "@/lib/format"
import { GIFT_CARD_FAMILY, HOME_CARE_FAMILY, VOUCHER_FAMILY } from "@/lib/enums"
import {
  reminderCompleteLabel, reminderCompletedMessage, REMINDER_ACCENT, REMINDER_TONE,
} from "@/lib/reminders"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Customer = { id: string; firstName: string; lastName: string | null; lastName2: string | null; phone: string; balanceCents: number }
type Worker   = { id: string; name: string; lastName: string | null; color: string | null }
/** "Cobrar aparte": Radix no admite la cadena vacía como valor. */
const SIN_BONO = "__sin_bono__"
/** Se ha pedido el catálogo entero, en vez de una familia concreta. */
const TODAS_LAS_FAMILIAS = "__todas__"

type Service  = {
  id: string; name: string; priceCents: number; pricingType: string
  pricePerMinuteCents: number | null; durationMinutes: number
  familyId: string; familyName: string; familySortOrder: number
}
type Product  = { id: string; name: string; priceCents: number; stock: number }
type SaleLine = {
  id: string; type: string; description: string; quantity: number
  unitPriceCents: number; discountPercent: number; totalCents: number
  durationMinutes: number | null; notes: string | null
  worker: { name: string; lastName: string | null } | null
  /** Solo las líneas de servicio y las sesiones de bono la traen. */
  service: { family: { name: string } } | null
  /** Solo las sesiones de bono: de qué bono se está gastando. */
  voucherSession: { voucher: { name: string } } | null
}
type Sale = {
  id: string; saleType: string; status: string; paymentMethod: string
  subtotalCents: number; discountCents: number
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
  /** Los bonos que están a la venta hoy. */
  voucherTemplates: VoucherTemplateRow[]
  currentUserId: string | null
  cashOpen: boolean
  /** Hay PINes repartidos, así que cobrar exige identificarse. */
  pinRequired: boolean
  /** La consulta llegó a su tope: hay ventas más antiguas que no están aquí. */
  hayVentasSinCargar: boolean
  /**
   * Desde la gestión del centro esta pantalla solo se mira.
   *
   * Es la única del día a día a la que llega la gestión (ver COUNTER_ONLY_PAGES
   * en proxy.ts): aquí está la columna "Cobró", que no sale en ningún informe.
   * Pero cobrar se cobra en el mostrador, donde se sabe quién eres, así que no
   * se ofrece empezar una venta que el servidor va a rechazar al registrarla.
   *
   * El TPV no es una ruta aparte —es estado de esta pantalla—, así que el
   * proxy no puede distinguirlo: la puerta se quita aquí.
   */
  soloLectura: boolean
}

type ReminderAlert = Awaited<ReturnType<typeof getCustomerReminderAlerts>>[number]

type LineType  = "SERVICE" | "PRODUCT" | "GIFT_CARD" | "VOUCHER" | "VOUCHER_SESSION"

type DraftLine = {
  /**
   * Según el tipo de línea: el servicio (SERVICE y VOUCHER_SESSION), el
   * producto (PRODUCT) o el bono del catálogo que se vende (VOUCHER).
   */
  key: number; type: LineType; itemId: string; description: string
  workerId: string | null; quantity: number; unitPriceCents: number
  discountPercent: number; durationMinutes: number | null
  /** Solo tarjetas regalo: qué se plantea regalar. */
  notes: string | null
  /** La cita que cobra esta línea, si viene de la agenda. */
  appointmentId: string | null
  /** Solo VOUCHER_SESSION: el bono ya comprado del que sale la sesión. */
  voucherId: string | null
  /**
   * Para comprar un bono y gastarlo en el mismo ticket. La línea del bono se
   * inventa una referencia y las sesiones que salen de él la repiten, porque
   * el bono todavía no existe y no hay id que poner.
   */
  voucherRef: string | null
}

/** Un bono del que se puede gastar hoy, ya venga de antes o de este ticket. */
type BonoDisponible = VoucherBalance

/**
 * De qué bonos se puede gastar, con lo que le queda a cada servicio una vez
 * contadas las sesiones que ya lleva el ticket. Entran tanto los bonos que el
 * cliente ya tenía como los que se están comprando en esta misma venta.
 *
 * Los que ya tenía van primero y de más antiguo a más nuevo: se gasta lo que
 * lleva tiempo pagado antes que lo que se acaba de llevar hoy.
 */
function calcularBonos(
  vouchers: CustomerVoucherRow[],
  lines: DraftLine[],
  voucherTemplates: VoucherTemplateRow[],
): BonoDisponible[] {
  // Los que ya tenía van primero y de más antiguo a más nuevo (getCustomerVouchers
  // los da al revés): se gasta lo que lleva tiempo pagado antes que lo de hoy.
  const deAntes = [...vouchers].reverse().map((v) => ({
    key: `bono:${v.id}`,
    name: v.name,
    voucherId: v.id as string | null,
    voucherRef: null,
    // Aquí ya vienen descontadas las sesiones de otros días; las de este
    // ticket las descuenta voucherBalances.
    services: v.services.map((x) => ({ id: x.id, name: x.name, totalSessions: x.remainingSessions })),
  }))

  const deEsteTicket = lines
    .filter((l) => l.type === "VOUCHER" && l.voucherRef)
    .map((l) => {
      const plantilla = voucherTemplates.find((t) => t.id === l.itemId)
      return {
        key: `nuevo:${l.voucherRef}`,
        name: l.description,
        voucherId: null,
        voucherRef: l.voucherRef,
        services: (plantilla?.services ?? []).map((x) => ({
          id: x.id, name: x.name, totalSessions: x.totalSessions,
        })),
      }
    })

  const gastadas = lines
    .filter((l) => l.type === "VOUCHER_SESSION")
    .map((l) => ({ voucherId: l.voucherId, voucherRef: l.voucherRef, serviceId: l.itemId }))

  return voucherBalances([...deAntes, ...deEsteTicket], gastadas)
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Si dos líneas son en realidad la misma cosa vendida dos veces.
 *
 * En el mostrador se pincha el mismo servicio o el mismo producto varias veces
 * seguidas —porque la clienta se lleva dos cremas, o porque no se ha visto que
 * ya estaba puesto— y el ticket se llenaba de líneas repetidas de una unidad.
 * La cantidad es lo que existe para eso: se suma en la línea que ya está.
 *
 * Solo se juntan las que de verdad se pueden juntar:
 *
 *  - Servicios y productos, que son lo que se vende por unidades. Una tarjeta
 *    regalo lleva su importe y su destinatario, un bono se vende de uno en uno
 *    y una sesión gastada es una sesión concreta: ninguno se agrupa.
 *  - Con el mismo profesional y el mismo descuento. Cambiada cualquiera de las
 *    dos cosas ya no es la misma línea, y sumarle una unidad le aplicaría a la
 *    nueva un descuento que nadie ha pedido.
 *  - Ninguna que venga de una cita: la línea guarda de cuál sale y una cita se
 *    cobra una sola vez, así que no puede acabar mezclada con otra.
 */
function mismaLinea(a: DraftLine, b: DraftLine): boolean {
  if (a.type !== b.type) return false
  if (a.type !== "SERVICE" && a.type !== "PRODUCT") return false
  if (a.appointmentId !== null || b.appointmentId !== null) return false
  return a.itemId === b.itemId
    && a.workerId === b.workerId
    && a.discountPercent === b.discountPercent
    && a.unitPriceCents === b.unitPriceCents
}

function lineTotal(l: DraftLine) {
  // Una sesión de bono ya se pagó el día que se compró el bono: entra en el
  // ticket para dejar constancia de quién la dio, pero no suma. La línea
  // conserva la tarifa del servicio, que se enseña tachada.
  if (l.type === "VOUCHER_SESSION") return 0
  return Math.round(l.unitPriceCents * l.quantity * (1 - l.discountPercent / 100))
}

function fmtEur(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function searchCustomers(customers: Customer[], query: string): Customer[] {
  if (!query.trim()) return customers.slice(0, 8)
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  return customers.filter((c) => {
    const hay = normalize(`${c.firstName} ${c.lastName ?? ""} ${c.lastName2 ?? ""} ${c.phone}`)
    return tokens.every((t) => hay.includes(t))
  }).slice(0, 8)
}

/* ─── Status/payment labels ──────────────────────────────────────────────── */

/**
 * Debe cubrir todo lo que puede haber en Sale.paymentMethod: lo que falte se
 * pinta crudo, en mayúsculas y en inglés. GIFT_CARD faltaba, y por eso en el
 * listado salía "GIFT_CARD" donde los informes ya decían "Saldo de tarjeta
 * regalo" (ETIQUETA_DE_COBRO en lib/reports.ts, que es la lista buena).
 */
const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Tarjeta", CASH: "Efectivo", BALANCE: "Saldo",
  GIFT_CARD: "Saldo de tarjeta regalo", DEBT: "Deuda",
}

/* ─── Familias de las líneas ─────────────────────────────────────────────── */

/**
 * La familia de una línea, con el mismo criterio que el histórico del cliente
 * y el informe de personal: lo que no es un servicio se agrupa en su familia
 * de siempre —el producto en tratamiento domiciliario, la tarjeta y el bono en
 * la suya— para que en un mismo desplegable se pueda pedir cualquier cosa.
 */
function familiaDeLinea(l: SaleLine): string {
  if (l.type === "PRODUCT") return HOME_CARE_FAMILY
  if (l.type === "GIFT_CARD") return GIFT_CARD_FAMILY
  if (l.type === "VOUCHER") return VOUCHER_FAMILY
  return l.service?.family.name ?? "Sin familia"
}

const TODAS_LAS_FAMILIAS_FILTRO = "ALL"

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

/** Cuántas líneas caben en una pantalla del histórico sin marear. */
const LINEAS_POR_PAGINA = 25

/**
 * Una línea de venta con todo lo que hace falta para leerla suelta: lo suyo
 * —qué se hizo, a qué precio, con qué descuento y quién lo hizo— y lo de su
 * ticket —cuándo, a quién, cómo se pagó y quién lo cobró—.
 *
 * El listado enseña líneas, no tickets. Lo que se pregunta mirando ventas es
 * qué se le ha hecho a la clienta, cuánto se le cobró por ello y quién se lo
 * hizo, y eso vive en la línea; el ticket es solo la forma en que se cobraron
 * varias cosas a la vez. Los datos del ticket se repiten en cada una de sus
 * líneas para que la fila se entienda sola, se pueda ordenar por cualquier
 * columna y no dependa de la fila de arriba.
 */
type LineaDeVenta = {
  key: string
  saleId: string
  line: SaleLine
  fechaMs: number
  cliente: string
  concepto: string
  familia: string
  /** Quien hizo el servicio. Vacío en bonos y tarjetas, que no los da nadie. */
  atendio: string
  /** Quien hizo el movimiento de la venta, es decir, quien cobró el ticket. */
  cobro: string
  paymentMethod: string
  status: string
  totalCents: number
  /** Su ticket lleva más líneas: se marcan para que se vean como lo que son. */
  enTicketCompartido: boolean
}

const LINEA_SORTERS = {
  fecha:    byNumber<LineaDeVenta>((r) => r.fechaMs),
  cliente:  byText<LineaDeVenta>((r) => r.cliente),
  concepto: byText<LineaDeVenta>((r) => r.concepto),
  atendio:  byText<LineaDeVenta>((r) => r.atendio),
  cobro:    byText<LineaDeVenta>((r) => r.cobro),
  total:    byNumber<LineaDeVenta>((r) => r.totalCents),
}
type LineaSortKey = keyof typeof LINEA_SORTERS

/** Lo último vendido primero, que es por donde se empieza a mirar. */
const LINEA_SORT_INICIAL: SortRule<LineaSortKey>[] = [{ key: "fecha", dir: "desc" }]

function nombreDe(p: { name: string; lastName: string | null } | null): string {
  return p ? `${p.name} ${p.lastName ?? ""}`.trim() : ""
}

export function SalesClient({ sales, customers, services, products, workers, voucherTemplates, currentUserId, cashOpen, pinRequired, hayVentasSinCargar, soloLectura }: Props) {
  const [mode, setMode] = useState<"list" | "pos">("list")
  const [showNoCashDialog, setShowNoCashDialog] = useState(false)
  const [search, setSearch] = useState("")
  /** Quien cobró el ticket. */
  const [cobroFilter, setCobroFilter] = useState("ALL")
  /** Quien hizo el servicio de la línea, que muchas veces no es la misma. */
  const [atendioFilter, setAtendioFilter] = useState("ALL")
  const [paymentFilter, setPaymentFilter] = useState("ALL")
  const [familyFilter, setFamilyFilter] = useState<string>(TODAS_LAS_FAMILIAS_FILTRO)
  const [dateMode, setDateMode] = useState<"today" | "week" | "custom">("today")
  const [customFrom, setCustomFrom] = useState(todayStr())
  const [customTo, setCustomTo] = useState(todayStr())
  // El ticket que se está mirando entero. La fila ya cuenta lo suyo; esto es
  // para lo que solo existe en el ticket y no se puede repartir por líneas:
  // qué más se cobró a la vez, el saldo que se aplicó y lo que quedó a deber.
  const [ticketAbierto, setTicketAbierto] = useState<string | null>(null)
  const [pagina, setPagina] = useState(0)

  // Las ventas llegan por tickets, con sus líneas dentro; aquí se estiran a
  // una fila por línea, cada una con lo suyo y lo de su ticket ya resuelto.
  const lineas = useMemo<LineaDeVenta[]>(() => sales.flatMap((s) => {
    const cliente = s.customer ? customerLabel(s.customer) : ""
    const cobro = nombreDe(s.user)
    const fechaMs = new Date(s.createdAt).getTime()
    const compartido = s.lines.length > 1
    return s.lines.map((l) => ({
      key: l.id,
      saleId: s.id,
      line: l,
      fechaMs,
      cliente,
      concepto: l.description,
      familia: familiaDeLinea(l),
      atendio: nombreDe(l.worker),
      cobro,
      paymentMethod: s.paymentMethod,
      status: s.status,
      totalCents: l.totalCents,
      enTicketCompartido: compartido,
    }))
  }), [sales])

  // Quién sale en cada desplegable lo dice lo vendido, no la plantilla:
  // ofrecer gente que no ha tocado ninguna de estas ventas es mandar a un
  // listado vacío. Y son dos listas distintas porque son dos preguntas
  // distintas: en el mostrador cobra una y atiende otra.
  const cobradoPor = useMemo(
    () => [...new Set(lineas.map((r) => r.cobro).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [lineas],
  )
  const atendidoPor = useMemo(
    () => [...new Set(lineas.map((r) => r.atendio).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [lineas],
  )
  const saleFamilies = useMemo(
    () => [...new Set(lineas.map((r) => r.familia))].sort((a, b) => a.localeCompare(b, "es")),
    [lineas],
  )

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
    const q = normalize(search)
    const desde = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null
    const hasta = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null
    return lineas.filter((r) => {
      // Una sola caja para cliente y concepto: en un listado de líneas se
      // busca igual "García" que "láser", y con dos cajas hay que acertar en
      // cuál se teclea cada cosa.
      if (q && !normalize(`${r.cliente} ${r.concepto} ${r.familia}`).includes(q)) return false
      if (cobroFilter !== "ALL" && r.cobro !== cobroFilter) return false
      if (atendioFilter !== "ALL" && r.atendio !== atendioFilter) return false
      if (paymentFilter !== "ALL" && r.paymentMethod !== paymentFilter) return false
      // La familia ahora filtra la fila, no el ticket: se pide "Depilación" y
      // salen las líneas de depilación, no los tickets que llevaban algo de
      // depilación con todo lo demás detrás.
      if (familyFilter !== TODAS_LAS_FAMILIAS_FILTRO && r.familia !== familyFilter) return false
      if (desde !== null && r.fechaMs < desde) return false
      if (hasta !== null && r.fechaMs > hasta) return false
      return true
    })
  }, [lineas, search, cobroFilter, atendioFilter, paymentFilter, familyFilter, dateFrom, dateTo])

  const { sort, sorted, toggleSort } = useTableSort<LineaDeVenta, LineaSortKey>(
    filtered, LINEA_SORTERS, LINEA_SORT_INICIAL,
  )

  // De cuántos tickets salen estas líneas y cuánto suman. La suma es la de las
  // líneas que se están viendo: coincide con la de los tickets cuando entran
  // enteros, y con un filtro puesto dice lo que de verdad se ha filtrado.
  const resumen = useMemo(() => ({
    tickets: new Set(filtered.map((r) => r.saleId)).size,
    importeCents: filtered.reduce((a, r) => a + r.totalCents, 0),
  }), [filtered])

  // Al cambiar cualquier filtro se vuelve a la primera página: quedarse en la
  // cuarta de un listado que ahora tiene dos deja la pantalla en blanco.
  useEffect(() => {
    setPagina(0)
  }, [search, cobroFilter, atendioFilter, paymentFilter, familyFilter, dateFrom, dateTo])

  const paginas = Math.max(1, Math.ceil(sorted.length / LINEAS_POR_PAGINA))
  const paginaActual = Math.min(pagina, paginas - 1)
  const desdeFila = paginaActual * LINEAS_POR_PAGINA
  const visibles = sorted.slice(desdeFila, desdeFila + LINEAS_POR_PAGINA)

  const hayFiltro = search !== "" || cobroFilter !== "ALL" || atendioFilter !== "ALL"
    || paymentFilter !== "ALL" || familyFilter !== TODAS_LAS_FAMILIAS_FILTRO
    || dateMode !== "today"

  function limpiarFiltros() {
    setSearch(""); setCobroFilter("ALL"); setAtendioFilter("ALL"); setPaymentFilter("ALL")
    setFamilyFilter(TODAS_LAS_FAMILIAS_FILTRO)
    setDateMode("today"); setCustomFrom(todayStr()); setCustomTo(todayStr())
  }

  // La venta más antigua que se ha traído: hasta ahí llega lo que se puede
  // mirar, y hay que decirlo si se pide un rango que se sale por debajo.
  const masAntigua = sales.length > 0 ? sales[sales.length - 1].createdAt : null
  const filtroFueraDeAlcance = hayVentasSinCargar && masAntigua !== null
    && dateFrom < localDateStr(new Date(masAntigua))

  const saleAbierta = ticketAbierto ? sales.find((s) => s.id === ticketAbierto) ?? null : null

  if (mode === "pos") {
    return <POSView sales={sales} customers={customers} services={services} products={products} workers={workers} voucherTemplates={voucherTemplates} currentUserId={currentUserId} pinRequired={pinRequired} onBack={() => setMode("list")} />
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        {/* Sin subtítulo: lo que ponía era cuántas ventas se habían traído de
            la base (el tope de la consulta), un número que no contesta ninguna
            pregunta y que además se confundía con "ventas que hay". Lo que
            sale con los filtros puestos se dice junto a los filtros, y de que
            hay más antiguas sin cargar avisa el aviso de debajo. */}
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        {!soloLectura && (
          <Button size="lg" onClick={() => cashOpen ? setMode("pos") : setShowNoCashDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva venta
          </Button>
        )}
      </div>

      <div className="p-8 space-y-6">
        {/* Filtros */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 w-64" placeholder="Buscar cliente o concepto…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            {/* Qué hay delante, dicho de una vez: cuántas líneas, de cuántos
                tickets salen y cuánto suman. Antes solo se decía el número de
                ventas, que no contesta a "cuánto se ha hecho hoy". */}
            <span className="ml-auto flex items-baseline gap-2 text-sm text-muted-foreground">
              <span>
                {filtered.length} {filtered.length === 1 ? "línea" : "líneas"}
                {" · "}
                {resumen.tickets} {resumen.tickets === 1 ? "ticket" : "tickets"}
              </span>
              <span className="font-semibold tabular-nums text-foreground">{fmtEur(resumen.importeCents)}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Por qué se vendió va primero: es la pregunta que más se hace y
                la que más recorta el listado. Ya no hay filtro de tipo aparte,
                porque la familia lo dice igual —el producto, el bono y la
                tarjeta regalo tienen la suya— y eran dos desplegables para
                partir lo mismo. */}
            <select
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value={TODAS_LAS_FAMILIAS_FILTRO}>Todas las familias</option>
              {saleFamilies.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {/* Las dos personas de una venta, cada una con su filtro y los dos
                iguales: quien hizo el servicio y quien hizo el movimiento.
                Antes solo se podía pedir por la segunda, que es la que menos
                se pregunta. */}
            <select
              value={atendioFilter}
              onChange={(e) => setAtendioFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="ALL">Atendido por: todas</option>
              {atendidoPor.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <select
              value={cobroFilter}
              onChange={(e) => setCobroFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="ALL">Cobrado por: todas</option>
              {cobradoPor.map((w) => <option key={w} value={w}>{w}</option>)}
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
            {hayFiltro && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            )}
          </div>

          {/* Un rango que se sale de lo cargado devolvería menos ventas de las
              que hubo, y sin avisar parecería que esos días no se vendió. */}
          {filtroFueraDeAlcance && masAntigua && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              El histórico llega hasta el{" "}
              {new Date(masAntigua).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}.
              Las ventas anteriores a esa fecha no salen en esta pantalla.
            </p>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="fecha" sort={sort} onToggle={toggleSort}>Fecha</SortableTableHead>
                  <SortableTableHead sortKey="cliente" sort={sort} onToggle={toggleSort}>Cliente</SortableTableHead>
                  <SortableTableHead sortKey="concepto" sort={sort} onToggle={toggleSort}>Concepto</SortableTableHead>
                  {/* El informe de personal mide por quien atiende, no por
                      quien cobra: aquí se ven las dos, una al lado de la otra. */}
                  <SortableTableHead sortKey="atendio" sort={sort} onToggle={toggleSort}>Atendió</SortableTableHead>
                  <TableHead className="px-2 py-3 text-right font-medium text-muted-foreground">Precio</TableHead>
                  <TableHead className="px-2 py-3 text-right font-medium text-muted-foreground">Dto.</TableHead>
                  <SortableTableHead sortKey="total" sort={sort} onToggle={toggleSort} className="text-right">Total</SortableTableHead>
                  <SortableTableHead sortKey="cobro" sort={sort} onToggle={toggleSort}>Cobró</SortableTableHead>
                  <TableHead className="px-2 py-3 font-medium text-muted-foreground">Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((r, i) => {
                  const l = r.line
                  const brutoCents = l.unitPriceCents * l.quantity
                  const fecha = new Date(r.fechaMs)
                  // La de debajo es del mismo ticket: se les quita la raya de
                  // en medio y las dos quedan como un bloque. Se mira la fila
                  // que de verdad va debajo, así que sigue valiendo con
                  // cualquier ordenación.
                  const sigueElTicket = visibles[i + 1]?.saleId === r.saleId
                  return (
                    <TableRow
                      key={r.key}
                      // Toda la fila abre su ticket: solo hay una cosa que
                      // pueda pasar al pinchar, así que no hace falta botón.
                      onClick={() => setTicketAbierto(r.saleId)}
                      title="Ver el ticket completo"
                      className={cn("cursor-pointer", sigueElTicket && "border-b-0")}
                    >
                      <TableCell className={cn(
                        "whitespace-nowrap px-2 text-muted-foreground border-l-2",
                        // Las líneas que se cobraron juntas llevan una barra
                        // fina a la izquierda: puestas seguidas se unen y se
                        // ve de un vistazo que son el mismo ticket. El borde
                        // transparente de las demás mantiene la alineación.
                        //
                        // Va en la celda y no en la fila porque la tabla apaga
                        // los bordes de la última fila entera, y ahí la barra
                        // desaparecía justo en la de abajo.
                        r.enTicketCompartido ? "border-l-primary/30" : "border-l-transparent",
                      )}>
                        {fecha.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                        {/* La hora debajo y no al lado: la fila ya tiene dos
                            renglones por la familia, así que ahí no estorba y
                            la columna ocupa la mitad. */}
                        <span className="block text-xs tabular-nums">
                          {fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 font-medium">{r.cliente || "—"}</TableCell>
                      <TableCell className="px-2">
                        {l.description}
                        {/* Las unidades pegadas al concepto y solo cuando hay
                            varias: una columna entera de unos no dice nada. */}
                        {l.quantity > 1 && <span className="text-muted-foreground"> ×{l.quantity}</span>}
                        <span className="block text-xs text-muted-foreground">
                          {r.familia}
                          {l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}
                          {etiquetaDeLinea(l) && ` · ${etiquetaDeLinea(l)}`}
                          {l.notes && ` · ${l.notes}`}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2">
                        {/* El bono y la tarjeta regalo no los da nadie: se
                            cuentan a quien cobró, dos columnas más allá. */}
                        {r.atendio || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 text-right tabular-nums text-muted-foreground">
                        {/* La sesión de bono no tiene tarifa propia guardada:
                            se apunta a 0 EUR porque ya se pagó en su día. Un
                            0,00 EUR aquí la haría pasar por un servicio
                            regalado. */}
                        {esSesionDeBono(l) ? "—" : fmtEur(l.unitPriceCents)}
                      </TableCell>
                      {/* El descuento, en su columna: el porcentaje y lo que
                          son en euros, que es lo que se acaba preguntando. */}
                      <TableCell className="whitespace-nowrap px-2 text-right tabular-nums">
                        {l.discountPercent > 0
                          ? <span className="text-primary">
                              −{l.discountPercent} %
                              {/* Lo que son en euros debajo del porcentaje, no
                                  al lado: es la mitad de columna y la fila ya
                                  tiene dos renglones. */}
                              <span className="block text-xs">−{fmtEur(brutoCents - l.totalCents)}</span>
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="px-2 text-right font-medium tabular-nums">
                        {esSesionDeBono(l)
                          ? <span className="font-normal text-muted-foreground">Bono</span>
                          : fmtEur(l.totalCents)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 text-muted-foreground">{r.cobro}</TableCell>
                      {/* Solo la forma de pago. Aquí iba además una etiqueta
                          roja "Debido", y decía dos veces lo mismo: el estado
                          DEBT solo se da cuando la forma de pago ya es Deuda
                          (ver createSale en lib/actions.ts), así que la
                          columna ya lo contaba. Y era la única fila con
                          adorno, lo que la hacía saltar más que su contenido. */}
                      <TableCell className="whitespace-nowrap px-2 text-muted-foreground">
                        {PAYMENT_LABELS[r.paymentMethod] ?? r.paymentMethod}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                      No hay ventas para los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Paginación. El histórico entero no cabe de una vez. */}
        {sorted.length > LINEAS_POR_PAGINA && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Líneas {desdeFila + 1}–{Math.min(desdeFila + LINEAS_POR_PAGINA, sorted.length)} de {sorted.length}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={paginaActual === 0}
                onClick={() => setPagina(paginaActual - 1)}>
                Anteriores
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {paginaActual + 1} / {paginas}
              </span>
              <Button variant="outline" size="sm" disabled={paginaActual >= paginas - 1}
                onClick={() => setPagina(paginaActual + 1)}>
                Siguientes
              </Button>
            </div>
          </div>
        )}

        {/* El ticket entero, para lo que no cabe en una fila: qué más se cobró
            en el mismo movimiento, el saldo que se aplicó y lo que quedó a
            deber. */}
        {saleAbierta && (
          <Dialog open onOpenChange={() => setTicketAbierto(null)}>
            <DialogContent style={{ maxWidth: "46rem" }}>
              <DialogHeader>
                <DialogTitle>
                  Ticket del {new Date(saleAbierta.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                  {", "}
                  {new Date(saleAbierta.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </DialogTitle>
                <DialogDescription>
                  {saleAbierta.customer ? customerLabel(saleAbierta.customer) : "Sin cliente"}
                  {" · "}
                  {PAYMENT_LABELS[saleAbierta.paymentMethod] ?? saleAbierta.paymentMethod}
                  {" · "}
                  Cobrado por {nombreDe(saleAbierta.user)}
                </DialogDescription>
              </DialogHeader>
              <TicketDetalle sale={saleAbierta} />
            </DialogContent>
          </Dialog>
        )}

        {/* No cash register dialog */}
        {showNoCashDialog && (
          <Dialog open onOpenChange={() => setShowNoCashDialog(false)}>
            <DialogContent style={{ maxWidth: "26rem" }}>
              <DialogHeader>
                <DialogTitle>Caja no abierta</DialogTitle>
                <DialogDescription>
                  Para registrar una nueva venta primero debes abrir la caja del día.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNoCashDialog(false)}>Cancelar</Button>
                <Button onClick={() => { window.location.href = "/cash-register" }}>Abrir caja</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}

/* ─── Detalle de un ticket ───────────────────────────────────────────────── */

/**
 * Solo la sesión de bono se etiqueta. El bono vendido y la tarjeta regalo ya
 * llevan su familia —"Bono", "Tarjeta regalo"—, así que ponerles encima una
 * etiqueta que dice lo mismo repetía la palabra dos veces seguidas. La sesión,
 * en cambio, va en la familia del servicio que se da, y sin esto no se
 * distingue de un servicio cobrado suelto a 0 EUR.
 *
 * Y se dice de qué bono sale, que es la otra mitad de la explicación: no es
 * que no se cobrara, es que ya estaba pagado en ese bono.
 */
function etiquetaDeLinea(l: SaleLine): string | null {
  if (l.type !== "VOUCHER_SESSION") return null
  const bono = l.voucherSession?.voucher.name
  return bono ? `Sesión de bono: ${bono}` : "Sesión de bono"
}

/**
 * Lo que va en la columna del importe. Una sesión de bono no se cobra —ya se
 * pagó el día que se compró el bono—, así que su línea no lleva ni tarifa ni
 * descuento y su total es cero. Escribirlo con números la hacía parecer un
 * servicio regalado; con la palabra queda dicho por qué no hay dinero.
 */
function esSesionDeBono(l: SaleLine): boolean {
  return l.type === "VOUCHER_SESSION"
}

/**
 * Todo lo que hay dentro de una venta, debajo de su fila.
 *
 * Antes esto era un diálogo que había que abrir ticket a ticket, y para
 * comparar dos ventas había que abrir y cerrar. Aquí se ve de corrido: qué se
 * vendió, quién hizo cada cosa, qué descuento llevó y qué queda a deber.
 *
 * Las dos personas del ticket no son la misma pregunta y por eso se leen en
 * dos sitios: quien lo cobró —una sola por venta— está en la fila de arriba, y
 * quién hizo o vendió cada cosa, en la columna Profesional. El informe de
 * personal mide por esta segunda.
 */
function TicketDetalle({ sale }: { sale: Sale }) {
  // Se calculan sobre las líneas que se están enseñando, no sobre los totales
  // guardados en la venta: así lo que suma es exactamente lo que se lee.
  const subtotalCents = sale.lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0)
  const lineasCents = sale.lines.reduce((a, l) => a + l.totalCents, 0)
  const descuentoCents = subtotalCents - lineasCents
  const saldoCents = sale.balanceMovements.reduce((a, m) => a + Math.abs(m.amountCents), 0)
  const pendienteCents = Math.max(0, sale.totalCents - sale.paidCents)

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1 text-left font-medium">Concepto</th>
            <th className="py-1 text-left font-medium">Profesional</th>
            <th className="py-1 text-right font-medium">Uds</th>
            <th className="py-1 text-right font-medium">Precio</th>
            <th className="py-1 text-right font-medium">Dto.</th>
            <th className="py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((l) => {
            const brutoCents = l.unitPriceCents * l.quantity
            return (
              <tr key={l.id} className="border-t border-border/60">
                <td className="py-1.5 pr-3">
                  {l.description}
                  {l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}
                  <span className="block text-xs text-muted-foreground">
                    {/* La familia va en cada línea: es por lo que se filtra
                        arriba, y sin verla no se sabe por qué salió el ticket. */}
                    {familiaDeLinea(l)}
                    {etiquetaDeLinea(l) && ` · ${etiquetaDeLinea(l)}`}
                    {l.notes && ` · ${l.notes}`}
                  </span>
                </td>
                <td className="py-1.5 pr-3">
                  {l.worker
                    ? `${l.worker.name} ${l.worker.lastName ?? ""}`.trim()
                    // El bono y la tarjeta regalo no los presta nadie: se
                    // cuentan a quien cobró, que ya está en la fila de arriba.
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">{l.quantity}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {esSesionDeBono(l) ? "—" : fmtEur(l.unitPriceCents)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {l.discountPercent > 0
                    ? <span className="text-primary">
                        −{l.discountPercent} % · −{fmtEur(brutoCents - l.totalCents)}
                      </span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-1.5 text-right font-medium tabular-nums">
                  {esSesionDeBono(l)
                    ? <span className="font-normal text-muted-foreground">Bono</span>
                    : fmtEur(l.totalCents)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-md text-xs text-muted-foreground">
          {sale.notes || ""}
        </p>
        <div className="ml-auto space-y-0.5 text-right text-sm">
          {/* El subtotal solo dice algo si hubo descuento: sin él repetiría el
              total una línea más arriba. */}
          {descuentoCents > 0 && (
            <>
              <div className="text-muted-foreground">
                Subtotal <span className="ml-2 tabular-nums">{fmtEur(subtotalCents)}</span>
              </div>
              {/* En azul y no en rojo: el rojo de esta pantalla es lo que se
                  debe —"Pendiente", aquí debajo—, y un descuento leído en rojo
                  parecía un descubierto. */}
              <div className="text-primary">
                Descuento <span className="ml-2 tabular-nums">−{fmtEur(descuentoCents)}</span>
              </div>
            </>
          )}
          {saldoCents > 0 && (
            <div className="flex items-center justify-end gap-1.5 text-blue-700">
              <Wallet className="h-3.5 w-3.5" /> Saldo del cliente
              <span className="ml-1 tabular-nums">−{fmtEur(saldoCents)}</span>
            </div>
          )}
          <div className="font-semibold">
            Total <span className="ml-2 text-base tabular-nums">{fmtEur(sale.totalCents)}</span>
          </div>
          {pendienteCents > 0 && (
            <div className="text-[#B31412]">
              Pendiente <span className="ml-2 tabular-nums">{fmtEur(pendienteCents)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   POS — pantalla completa
═══════════════════════════════════════════════════════════════════════════ */

function POSView({ sales, customers, services, products, workers, voucherTemplates, currentUserId, pinRequired, onBack }: {
  sales: Sale[]; customers: Customer[]; services: Service[]; products: Product[]
  workers: Worker[]; voucherTemplates: VoucherTemplateRow[]
  currentUserId: string | null; pinRequired: boolean; onBack: () => void
}) {
  // Clientes dados de alta sin salir del TPV: se añaden a la lista en memoria
  // para poder seleccionarlos al momento (el servidor ya los tiene guardados).
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([])
  const allCustomers = useMemo(() => {
    const known = new Set(customers.map((c) => c.id))
    return [...createdCustomers.filter((c) => !known.has(c.id)), ...customers]
  }, [customers, createdCustomers])

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [giftRecipient, setGiftRecipient] = useState<Customer | null>(null)
  // Recordatorios del cliente: saltan solos al elegirlo y se pueden volver a
  // abrir desde el aviso que queda bajo el selector.
  const [alerts, setAlerts] = useState<ReminderAlert[]>([])
  const [alertsOpen, setAlertsOpen] = useState(false)
  // Una vez por cliente y por venta: si cierras el aviso y vuelves a elegir al
  // mismo cliente en el mismo ticket, no vuelve a saltar. Al terminar la venta
  // se sale del TPV y el componente se desmonta, así que empieza de cero.
  const shownAlertsFor = useRef<Set<string>>(new Set())
  // La carga es asíncrona: si da tiempo a cambiar de cliente antes de que
  // conteste, la respuesta vieja no debe pisar los avisos del nuevo.
  const alertsRequestFor = useRef<string | null>(null)
  // Citas hechas y sin cobrar del cliente elegido. Mismo cuidado que con los
  // recordatorios: si se cambia de cliente antes de que conteste, la respuesta
  // vieja no puede pisar a la nueva.
  const [billable, setBillable] = useState<BillableAppointment[]>([])
  const billableRequestFor = useRef<string | null>(null)
  // Los bonos con sesiones libres del cliente elegido, con el mismo cuidado.
  const [vouchers, setVouchers] = useState<CustomerVoucherRow[]>([])
  const vouchersRequestFor = useRef<string | null>(null)
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
  const [pinOpen, setPinOpen] = useState(false)
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(new Set())
  // Ficha del cliente sobre el TPV: se consulta el historial sin perder el
  // ticket que se está montando.
  const [profileCustomerId, setProfileCustomerId] = useState<string | null>(null)
  const [newReminderOpen, setNewReminderOpen] = useState(false)

  // Deuda pendiente (pendiente de cobro) por cliente, derivada de las ventas DEBT.
  const debtByCustomer = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sales) {
      if (s.status === "DEBT" && s.customer) {
        m.set(s.customer.id, (m.get(s.customer.id) ?? 0) + (s.totalCents - s.paidCents))
      }
    }
    return m
  }, [sales])

  // Deudas pendientes del cliente seleccionado
  const customerDebts = useMemo(() => {
    if (!customer) return []
    return sales.filter(
      (s) => s.customer?.id === customer.id && s.status === "DEBT"
    )
  }, [customer, sales])

  // Al cambiar de cliente: autoseleccionar sus deudas pendientes y resetear el saldo aplicado a 0.
  useEffect(() => {
    setSelectedDebtIds(new Set(customerDebts.map((d) => d.id)))
    setBalanceAppliedCents(0)
    setBalanceInput("")
  }, [customer?.id])

  // El método "Deuda" no aplica si no hay líneas nuevas o si es una venta de tarjeta regalo.
  useEffect(() => {
    if (paymentMethod === "DEBT" && (lines.length === 0 || lines.some((l) => l.type === "GIFT_CARD"))) {
      setPaymentMethod("CASH")
    }
  }, [lines])

  // Al seleccionar método DEBT, deseleccionar todas las deudas pendientes
  useEffect(() => {
    if (paymentMethod === "DEBT") {
      setSelectedDebtIds(new Set())
    }
  }, [paymentMethod])

  const now = new Date()
  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  const dateStr = capitalizeFirst(now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }))

  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)
  const discountCents = lines.reduce((s, l) => s + (l.unitPriceCents * l.quantity - lineTotal(l)), 0)
  const totalCents = subtotalCents - discountCents
  const customerBalance = customer?.balanceCents ?? 0
  const remainingCents = Math.max(0, totalCents - balanceAppliedCents)
  // Saldo a favor que aún podría aplicarse a esta venta
  const maxApplicableBalance = Math.min(Math.max(0, customerBalance), totalCents)
  // No se permite generar deuda mientras quede saldo a favor sin aplicar
  const debtBlockedByBalance = balanceAppliedCents < maxApplicableBalance
  // Total de deudas anteriores seleccionadas para cobrar junto con la venta
  const debtsTotalCents = paymentMethod === "DEBT"
    ? 0
    : customerDebts.filter((d) => selectedDebtIds.has(d.id)).reduce((s, d) => s + (d.totalCents - d.paidCents), 0)
  // Importe total a cobrar en efectivo/tarjeta (venta + deudas)
  const chargeCents = remainingCents + debtsTotalCents
  const tenderedCents = Math.round(Number(tenderedInput) * 100)
  const changeCents = paymentMethod === "CASH" && tenderedCents > chargeCents ? tenderedCents - chargeCents : 0

  const hasGiftCard = lines.some((l) => l.type === "GIFT_CARD")

  // Si la deuda deja de ser válida (queda saldo a favor sin aplicar), volver a Efectivo.
  useEffect(() => {
    if (paymentMethod === "DEBT" && debtBlockedByBalance) {
      setPaymentMethod("CASH")
    }
  }, [paymentMethod, debtBlockedByBalance])

  function validate(): string[] {
    const errs: string[] = []
    if (!customer)
      errs.push("Selecciona un cliente antes de registrar la venta.")
    if (lines.length === 0 && selectedDebtIds.size === 0)
      errs.push("Añade al menos una línea al ticket o selecciona una deuda a cobrar.")
    lines.forEach((l) => {
      // Todas las líneas, también el producto: sin saber quién vende qué no
      // hay trazabilidad del ticket ni informe de personal que valga. Se
      // libran las dos que no presta nadie: la venta de un bono —lo que se
      // atribuye es cada sesión que se gaste— y la tarjeta regalo, que va sola
      // en su ticket y se cuenta a quien lo cobró.
      if (l.type !== "VOUCHER" && l.type !== "GIFT_CARD" && !l.workerId)
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
    // Cada venta pide el PIN. No se hereda la identificación de la venta
    // anterior: aquí no hay recepción, cada una viene a cobrar lo suyo, y una
    // identificación que sobreviva al ticket acaba apuntando el cobro a quien
    // pasó antes por el ordenador.
    if (pinRequired) { setPinOpen(true); return }
    await registrar()
  }

  async function registrar() {
    setErrors([])
    setLoading(true)

    // Sólo se crea una venta nueva si hay líneas en el ticket
    if (lines.length > 0) {
      const saleLines: SaleLineInput[] = lines.map((l) => ({
        type: l.type,
        serviceId: l.type === "SERVICE" || l.type === "VOUCHER_SESSION" ? l.itemId : undefined,
        productId: l.type === "PRODUCT" ? l.itemId : undefined,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        discountPercent: l.discountPercent,
        durationMinutes: l.durationMinutes ?? undefined,
        totalCents: lineTotal(l),
        workerId: l.workerId,
        notes: l.notes,
        appointmentId: l.appointmentId,
        voucherTemplateId: l.type === "VOUCHER" ? l.itemId : undefined,
        voucherId: l.voucherId ?? undefined,
        newVoucherRef: l.voucherRef ?? undefined,
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

      if (!res.ok) {
        setLoading(false)
        // La ventana de identidad puede haber caducado entre el clic y el
        // envío: se pide el PIN otra vez en vez de soltar un error seco.
        if (res.needsPin) { setPinOpen(true); return }
        setErrors([res.error ?? "Error inesperado"])
        return
      }
    }

    // Pagar deudas seleccionadas (sólo si el método no es DEBT)
    if (selectedDebtIds.size > 0 && paymentMethod !== "DEBT") {
      const debtPayMethod = paymentMethod as "CASH" | "CARD"
      for (const debtId of selectedDebtIds) {
        const debtRes = await payDebt(debtId, debtPayMethod)
        if (!debtRes.ok) {
          setLoading(false)
          if (debtRes.needsPin) { setPinOpen(true); return }
          setErrors([`Error al cobrar deuda: ${debtRes.error ?? "Error inesperado"}`])
          return
        }
      }
    }

    // La identificación muere con la venta: la siguiente que llegue teclea su
    // PIN, no hereda el de la anterior.
    if (pinRequired) await forgetOperator()

    setLoading(false)
    onBack()
  }

  async function selectCustomer(c: Customer) {
    setCustomer(c)
    setErrors([])
    setAlerts([])
    alertsRequestFor.current = c.id
    try {
      const found = await getCustomerReminderAlerts(c.id)
      if (alertsRequestFor.current !== c.id) return
      setAlerts(found)
      if (found.length > 0 && !shownAlertsFor.current.has(c.id)) {
        shownAlertsFor.current.add(c.id)
        setAlertsOpen(true)
      }
    } catch {
      toast.error("No se han podido cargar los recordatorios de este cliente.")
    }
  }

  function clearCustomer() {
    setCustomer(null)
    setAlerts([])
    setAlertsOpen(false)
    alertsRequestFor.current = null
  }

  async function completeAlert(id: string) {
    const dueDate = alerts.find((a) => a.id === id)?.dueDate ?? null
    const res = await completeCustomerReminder(id)
    if (!res.ok) {
      toast.error(res.error ?? "Error al completar el recordatorio.")
      return
    }
    toast.success(reminderCompletedMessage(dueDate))
    const quedan = alerts.filter((a) => a.id !== id)
    setAlerts(quedan)
    if (quedan.length === 0) setAlertsOpen(false)
  }

  // Tras apuntar un recordatorio nuevo se recargan los avisos por si el recién
  // creado ya avisa (permanente, o con fecha dentro del plazo). No se abre el
  // diálogo de avisos: acaba de escribirlo ella, no hace falta enseñárselo.
  async function reloadAlerts() {
    if (!customer) return
    alertsRequestFor.current = customer.id
    try {
      const found = await getCustomerReminderAlerts(customer.id)
      if (alertsRequestFor.current !== customer.id) return
      setAlerts(found)
      shownAlertsFor.current.add(customer.id)
    } catch {
      toast.error("No se han podido cargar los recordatorios de este cliente.")
    }
  }

  useEffect(() => {
    const id = customer?.id ?? null
    billableRequestFor.current = id
    setBillable([])
    if (!id) return
    getBillableAppointments(id).then((rows) => {
      if (billableRequestFor.current !== id) return
      setBillable(rows)
    })
  }, [customer])

  useEffect(() => {
    const id = customer?.id ?? null
    vouchersRequestFor.current = id
    setVouchers([])
    if (!id) return
    getRedeemableVouchers(id).then((rows) => {
      if (vouchersRequestFor.current !== id) return
      setVouchers(rows)
    })
  }, [customer])

  // Las que ya están en el ticket salen de la lista: si siguieran, se
  // añadirían dos veces y la venta se caería al registrar.
  const citasEnTicket = useMemo(
    () => new Set(lines.map((l) => l.appointmentId).filter(Boolean)),
    [lines],
  )
  const citasPendientes = billable.filter((c) => !citasEnTicket.has(c.id))

  /**
   * De qué bonos se puede gastar: los que ya tenía el cliente y los que se
   * están comprando en este mismo ticket. A los dos se les restan las sesiones
   * que ya lleva el ticket, para que la pantalla no ofrezca gastar más de las
   * que hay. El servidor lo vuelve a comprobar antes de guardar.
   */
  /**
   * Qué bonos podrían pagar cada línea del ticket.
   *
   * El saldo de cada una se calcula como si ella no estuviera: si no, el bono
   * que la propia línea está gastando aparecería sin sesiones y no habría forma
   * ni de verlo ni de dejarlo puesto.
   */
  const bonosPorLinea = useMemo(() => {
    const m = new Map<number, BonoDisponible[]>()
    for (const l of lines) {
      if (l.type !== "SERVICE" && l.type !== "VOUCHER_SESSION") continue
      const otras = lines.filter((x) => x.key !== l.key)
      m.set(l.key, calcularBonos(vouchers, otras, voucherTemplates)
        .filter((b) => b.services.some((x) => x.id === l.itemId)))
    }
    return m
  }, [vouchers, lines, voucherTemplates])

  /**
   * Pasa una línea a pagarse con un bono, o la devuelve a cobrarse aparte.
   *
   * La línea guarda siempre la tarifa del servicio, gástese o no del bono, así
   * que ir y volver no pierde el precio: lo único que cambia es de qué tipo es
   * la línea y de qué bono cuelga.
   */
  function setBonoDeLinea(key: number, bono: BonoDisponible | null) {
    setLines((prev) => prev.map((l) => l.key !== key ? l : bono
      ? {
          ...l, type: "VOUCHER_SESSION", quantity: 1, discountPercent: 0,
          voucherId: bono.voucherId, voucherRef: bono.voucherRef,
        }
      : { ...l, type: "SERVICE", voucherId: null, voucherRef: null }))
  }

  function addAppointmentLine(c: BillableAppointment) {
    addLine({
      key: 0, type: "SERVICE", itemId: c.serviceId, description: c.serviceName,
      // La profesional sale de la cita, que es quien de verdad atendió.
      workerId: c.workerId, quantity: 1, unitPriceCents: c.priceCents,
      discountPercent: 0, durationMinutes: c.durationMinutes, notes: null,
      appointmentId: c.id, voucherId: null, voucherRef: null,
    })
  }

  /**
   * Mete la línea en el ticket, o le suma una unidad a la que ya estaba.
   *
   * El bono se mira primero: un servicio que un bono cubre entra como sesión
   * gastada, y las sesiones no se agrupan —cada una consume la suya, y así
   * pinchar dos veces gasta dos sesiones, que es lo que se quiere—.
   */
  function addLine(line: DraftLine) {
    setLines((prev) => {
      const nueva = conBonoSiLoCubre(line, prev)
      const yaEsta = prev.findIndex((l) => mismaLinea(l, nueva))
      if (yaEsta === -1) return [...prev, { ...nueva, key: lineKey }]
      return prev.map((l, i) => i === yaEsta
        ? { ...l, quantity: l.quantity + nueva.quantity }
        : l)
    })
    setLineKey((k) => k + 1)
  }

  /**
   * Si el cliente tiene un bono con sesiones libres de ese servicio, la línea
   * entra ya gastándolo.
   *
   * Se hace solo a propósito: cobrarle otra vez algo que ya tiene pagado es el
   * error que la clienta nota, y en el mostrador es facilísimo olvidarse de
   * mirar. La línea lo dice y se puede pasar a cobrar aparte con un clic.
   */
  function conBonoSiLoCubre(line: DraftLine, actuales: DraftLine[]): DraftLine {
    if (line.type !== "SERVICE") return line
    const bono = calcularBonos(vouchers, actuales, voucherTemplates)
      .find((b) => b.services.some((x) => x.id === line.itemId))
    if (!bono) return line
    return {
      ...line, type: "VOUCHER_SESSION", quantity: 1, discountPercent: 0,
      voucherId: bono.voucherId, voucherRef: bono.voucherRef,
    }
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
        <span className="text-sm text-muted-foreground">{dateStr} · {timeStr}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT */}
        <div className="flex flex-col flex-1 overflow-y-auto px-6 py-5 space-y-5 border-r">
          {/* Cliente comprador */}
          <CustomerSelector
            label="Cliente"
            customers={allCustomers}
            selected={customer}
            onSelect={selectCustomer}
            onClear={clearCustomer}
            onCreated={(c) => setCreatedCustomers((prev) => [c, ...prev])}
            onOpenProfile={(c) => setProfileCustomerId(c.id)}
            debtByCustomerId={debtByCustomer}
          />
          {customer && (
            <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {alerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAlertsOpen(true)}
                  className={cn("flex items-center gap-1.5 text-xs font-medium hover:underline", REMINDER_ACCENT)}
                >
                  <Bell className="h-3.5 w-3.5 shrink-0" />
                  {alerts.length === 1
                    ? "1 recordatorio de este cliente"
                    : `${alerts.length} recordatorios de este cliente`}
                </button>
              )}
              <button
                type="button"
                onClick={() => setNewReminderOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" /> Añadir recordatorio
              </button>
            </div>
          )}
          {!customer && (
            <p className="text-xs text-destructive flex items-center gap-1.5 -mt-3">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Debes seleccionar un cliente para poder registrar la venta.
            </p>
          )}

          {/* Deudas pendientes del cliente */}
          {customerDebts.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-red-500" />
                Deudas pendientes
                <span className="ml-1 rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold">{customerDebts.length}</span>
              </h3>
              <div className="rounded-xl border border-red-200 bg-red-50/40 overflow-hidden">
                {customerDebts.map((debt, i) => {
                  const pending = debt.totalCents - debt.paidCents
                  const checked = selectedDebtIds.has(debt.id)
                  return (
                    <label
                      key={debt.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                        i > 0 && "border-t border-red-100",
                        checked ? "bg-red-100/60" : "hover:bg-red-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-red-600 shrink-0"
                        checked={checked}
                        disabled={paymentMethod === "DEBT"}
                        onChange={(e) => {
                          setSelectedDebtIds((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(debt.id)
                            else next.delete(debt.id)
                            return next
                          })
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800">
                          {new Date(debt.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        <p className="text-xs text-red-600 truncate">
                          {debt.lines.map((l) => l.description).join(", ")}
                        </p>
                      </div>
                      <span className="tabular-nums text-sm font-semibold text-red-700 shrink-0">{fmtEur(pending)}</span>
                    </label>
                  )
                })}
                {paymentMethod === "DEBT" && (
                  <p className="px-4 py-2 text-xs text-muted-foreground border-t border-red-100 bg-white/60">
                    No se pueden cobrar deudas anteriores con método "Deuda".
                  </p>
                )}
                {selectedDebtIds.size > 0 && paymentMethod !== "DEBT" && (
                  <div className="px-4 py-2.5 border-t border-red-200 bg-red-100/50 flex justify-between items-center text-sm font-medium text-red-800">
                    <span>{selectedDebtIds.size} deuda{selectedDebtIds.size !== 1 ? "s" : ""} seleccionada{selectedDebtIds.size !== 1 ? "s" : ""}</span>
                    <span className="tabular-nums">
                      {fmtEur(customerDebts.filter((d) => selectedDebtIds.has(d.id)).reduce((s, d) => s + d.totalCents - d.paidCents, 0))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Citas hechas y sin cobrar: el camino corto para montar el ticket.
              El de teclearlo a mano sigue estando justo debajo, para lo que se
              vende sin cita. */}
          {citasPendientes.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Citas pendientes de cobrar ({citasPendientes.length})
              </h3>
              <div className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5">
                {citasPendientes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addAppointmentLine(c)}
                    className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-primary/10"
                  >
                    <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.serviceName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(c.startAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                        {" · "}
                        {new Date(c.startAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{c.workerName}
                        {" · "}{c.durationMinutes} min
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtEur(c.priceCents)}</span>
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Al cobrarlas quedan marcadas como hechas en la agenda.
              </p>
            </div>
          )}

          {/* Añadir línea */}
          <AddLinePanel
            services={services}
            products={products}
            workers={workers}
            currentUserId={currentUserId}
            customers={allCustomers}
            giftRecipient={giftRecipient}
            onGiftRecipientChange={setGiftRecipient}
            onCustomerCreated={(c) => setCreatedCustomers((prev) => [c, ...prev])}
            onAdd={addLine}
            hasGiftCard={hasGiftCard}
            hasRegularLines={lines.some((l) => l.type !== "GIFT_CARD")}
            voucherTemplates={voucherTemplates}
            hasCustomer={!!customer}
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
                        bonos={bonosPorLinea.get(l.key) ?? []}
                        onSetBono={(bono) => setBonoDeLinea(l.key, bono)}
                        bonoVendido={l.type === "VOUCHER"
                          ? voucherTemplates.find((t) => t.id === l.itemId) ?? null
                          : null}
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

            {/* Desglose de descuentos: solo si hay descuento (si no, Subtotal = Total) */}
            {discountCents > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span className="tabular-nums">{fmtEur(subtotalCents)}</span>
                </div>
                <div className="flex justify-between text-green-700">
                  <span>Descuentos</span><span className="tabular-nums">−{fmtEur(discountCents)}</span>
                </div>
              </>
            )}

            {/* Línea de la venta nueva: "Venta" si además hay deudas, "Total" si va sola */}
            {(debtsTotalCents === 0 || totalCents > 0) && (
              <div className={cn(
                "flex justify-between",
                debtsTotalCents > 0 ? "text-muted-foreground" : "font-bold text-lg border-t pt-2 mt-1"
              )}>
                <span>{debtsTotalCents > 0 ? "Venta" : "Total"}</span>
                <span className="tabular-nums">{fmtEur(totalCents)}</span>
              </div>
            )}

            {/* Deudas anteriores incluidas en el cobro */}
            {debtsTotalCents > 0 && (
              <>
                <div className="flex justify-between text-red-700">
                  <span className="flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> Deudas pendientes</span>
                  <span className="tabular-nums">+{fmtEur(debtsTotalCents)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2 mt-1">
                  <span>A cobrar ahora</span><span className="tabular-nums">{fmtEur(chargeCents)}</span>
                </div>
              </>
            )}

            {discountCents > 0 && <p className="text-xs text-green-700">Ahorro: {fmtEur(discountCents)}</p>}

            {/* Saldo del cliente (no aplica al vender una tarjeta regalo) */}
            {customerBalance > 0 && !hasGiftCard && (
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
              {chargeCents === 0 ? "Forma de pago" : `Cobrar ${fmtEur(chargeCents)}`}
            </h3>

            {chargeCents === 0 ? (
              totalCents > 0 && remainingCents === 0 ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-xs text-green-700 text-center font-medium">
                  Cubierto completamente con saldo del cliente
                </div>
              ) : (
                <div className="rounded-lg bg-muted/40 border px-3 py-2.5 text-xs text-muted-foreground text-center">
                  Añade líneas al ticket o selecciona deudas para cobrar.
                </div>
              )
            ) : (
              <>
                <div className={cn("grid gap-2", hasGiftCard ? "grid-cols-2" : "grid-cols-3")}>
                  {([
                    { id: "CASH", Icon: Banknote,    label: "Efectivo" },
                    { id: "CARD", Icon: CreditCard,  label: "Tarjeta" },
                    // Una tarjeta regalo no se vende a crédito: sin método "Deuda".
                    // El `as const` de fuera no atraviesa el spread, así que el
                    // array del ternario lleva el suyo o `id` se ensancha a string.
                    ...(hasGiftCard ? [] : [{ id: "DEBT", Icon: AlertCircle, label: "Deuda" }] as const),
                  ] as const).map(({ id, Icon, label }) => {
                    const debtDisabled = id === "DEBT" && (
                      (lines.length === 0 && selectedDebtIds.size > 0) || debtBlockedByBalance
                    )
                    return (
                      <button key={id} type="button"
                        onClick={() => !debtDisabled && setPaymentMethod(id)}
                        disabled={debtDisabled}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border-2 py-3 px-1 text-xs font-medium transition-colors",
                          debtDisabled
                            ? "border-border text-muted-foreground/40 cursor-not-allowed opacity-40"
                            : paymentMethod === id
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        )}>
                        <Icon className="h-5 w-5" />{label}
                      </button>
                    )
                  })}
                </div>

                {debtBlockedByBalance && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    No se puede dejar a deuda mientras el cliente tenga saldo a favor sin aplicar. Aplica el saldo disponible primero.
                  </p>
                )}

                {paymentMethod === "CASH" && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Importe entregado (€)</label>
                    <Input
                      type="number" step="0.01" min="0"
                      placeholder={(chargeCents / 100).toFixed(2)}
                      value={tenderedInput}
                      onChange={(e) => { setTenderedInput(e.target.value); setErrors([]) }}
                      className={cn("tabular-nums", tenderedInput !== "" && tenderedCents < chargeCents && "border-destructive focus-visible:ring-destructive")}
                    />
                    {tenderedInput !== "" && tenderedCents < chargeCents && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        El importe entregado es inferior al total a cobrar.
                      </p>
                    )}
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
            {/* A nombre de quién va a quedar la venta. Solo aparece si el
                centro usa PIN; si no, no hay nada que elegir. */}
            {pinRequired && (
              <p className="text-center text-xs text-muted-foreground">
                Se pedirá tu PIN al registrar. La venta quedará a tu nombre.
              </p>
            )}
            <Button className="w-full h-12 text-base font-semibold" onClick={handleSubmit}
              disabled={loading || !customer || (lines.length === 0 && selectedDebtIds.size === 0) || (paymentMethod === "CASH" && tenderedInput !== "" && tenderedCents < chargeCents)}>
              {loading ? "Registrando…" : `Registrar · ${fmtEur(chargeCents > 0 ? chargeCents : totalCents)}`}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleBack}>Cancelar</Button>
          </div>
        </div>
      </div>

      {customer && (
        <QuickReminderDialog
          open={newReminderOpen}
          onOpenChange={setNewReminderOpen}
          customerId={customer.id}
          customerName={customerLabel(customer)}
          onCreated={reloadAlerts}
        />
      )}

      <ClientProfileDialog
        customerId={profileCustomerId}
        open={profileCustomerId !== null}
        onOpenChange={(o) => { if (!o) setProfileCustomerId(null) }}
      />

      <ReminderAlertsDialog
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        customerName={customer ? customerLabel(customer) : ""}
        alerts={alerts}
        onComplete={completeAlert}
      />

      <PinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        onIdentified={() => {
          setPinOpen(false)
          // Identificarse era el último paso que faltaba: se sigue con el
          // cobro sin obligar a volver a pulsar "Registrar".
          void registrar()
        }}
      />

      {showCancel && (
        <Dialog open onOpenChange={() => setShowCancel(false)}>
          <DialogContent style={{ maxWidth: "26rem" }}>
            <DialogHeader>
              <DialogTitle>¿Cancelar la venta?</DialogTitle>
              <DialogDescription>Se perderán las líneas añadidas.</DialogDescription>
            </DialogHeader>
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

/* ─── Recordatorios del cliente ──────────────────────────────────────────── */

/* Salta al elegir cliente en el TPV, que es el momento en el que el cliente
   está delante y todavía se le puede decir. Solo trae lo que avisa hoy: los
   permanentes siempre y los que vencen, cuando toca (ver lib/reminders.ts).

   Desde aquí solo se leen y se completan. Crear y borrar se hacen en la ficha:
   en mitad de un cobro no es sitio para ponerse a redactar. */
function ReminderAlertsDialog({ open, onOpenChange, customerName, alerts, onComplete }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerName: string
  alerts: ReminderAlert[]
  onComplete: (id: string) => Promise<void>
}) {
  const [completing, setCompleting] = useState<string | null>(null)

  async function complete(id: string) {
    setCompleting(id)
    await onComplete(id)
    setCompleting(null)
  }

  // Al completar el último, el TPV cierra el diálogo; mientras tanto no se
  // pinta un modal vacío.
  if (alerts.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: "30rem" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className={cn("h-5 w-5 shrink-0", REMINDER_ACCENT)} />
            {alerts.length === 1 ? "Recordatorio" : `Recordatorios (${alerts.length})`}
          </DialogTitle>
          <DialogDescription>{customerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {alerts.map((a) => {
            const permanente = a.dueDate === null
            return (
              <div
                key={a.id}
                className={cn(
                  "rounded-xl border px-4 py-3",
                  REMINDER_TONE[permanente ? "permanent" : a.overdue ? "overdue" : "due"].card,
                )}
              >
                <div className="flex items-start gap-2">
                  {permanente
                    ? <Pin className={cn("h-4 w-4 shrink-0 mt-0.5", REMINDER_TONE.permanent.accent)} />
                    : <Bell className={cn("h-4 w-4 shrink-0 mt-0.5", REMINDER_TONE[a.overdue ? "overdue" : "due"].accent)} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {permanente
                        ? "Aviso permanente"
                        : `${a.overdue ? "Venció el" : "Vence el"} ${new Date(a.dueDate!).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}`}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost" size="sm" className="gap-1.5 h-7 text-xs"
                    disabled={completing === a.id}
                    onClick={() => complete(a.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {reminderCompleteLabel(a.dueDate)}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Customer selector (shared) ─────────────────────────────────────────── */

function CustomerSelector({ label, customers, selected, onSelect, onClear, onCreated, onOpenProfile, placeholder, debtByCustomerId }: {
  label: string; customers: Customer[]; selected: Customer | null
  onSelect: (c: Customer) => void; onClear: () => void; placeholder?: string
  // Si se pasa, se ofrece dar de alta un cliente nuevo sin salir de la venta.
  onCreated?: (c: Customer) => void
  // Si se pasa, el cliente elegido lleva un botón para abrir su ficha.
  onOpenProfile?: (c: Customer) => void
  debtByCustomerId?: Map<string, number>
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", out)
    return () => document.removeEventListener("mousedown", out)
  }, [])

  const results = useMemo(() => searchCustomers(customers, query), [customers, query])
  const canCreate = Boolean(onCreated)

  function openCreate() {
    setOpen(false)
    setCreating(true)
  }

  function handleCreated(c: Customer) {
    onCreated?.(c)
    onSelect(c)
    setQuery("")
    setOpen(false)
  }

  const dialog = canCreate ? (
    <QuickCustomerDialog
      open={creating}
      query={query}
      customers={customers}
      onOpenChange={setCreating}
      onCreated={handleCreated}
      onSelectExisting={(c) => { onSelect(c); setQuery(""); setOpen(false) }}
    />
  ) : null

  if (selected) {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{label}</label>
        <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{customerLabel(selected)}</p>
            <div className="flex gap-3 text-xs">
              {selected.balanceCents > 0 && (
                <span className="text-green-700">Saldo: {fmtEur(selected.balanceCents)}</span>
              )}
              {(debtByCustomerId?.get(selected.id) ?? 0) > 0 && (
                <span className="text-red-600">Debe: {fmtEur(debtByCustomerId!.get(selected.id)!)}</span>
              )}
            </div>
          </div>
          {onOpenProfile && (
            <Button
              variant="outline" size="sm" className="shrink-0 h-8 gap-1.5"
              onClick={() => onOpenProfile(selected)}
            >
              <FileText className="h-3.5 w-3.5" /> Ver ficha
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground shrink-0 h-7 w-7 p-0" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {dialog}
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
          onKeyDown={(e) => {
            // Enter sobre una búsqueda sin resultados: dar de alta directamente.
            if (e.key === "Enter" && canCreate && query.trim() && results.length === 0) {
              e.preventDefault()
              openCreate()
            }
          }}
        />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-xl shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {query.trim() ? `Sin resultados para "${query}"` : "No hay clientes."}
            </div>
          ) : (
            results.map((c) => (
              <button key={c.id} type="button"
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 text-left transition-colors"
                onClick={() => { onSelect(c); setQuery(""); setOpen(false) }}>
                <span className="text-sm font-medium truncate">{customerLabel(c)}</span>
                <span className="flex gap-2 ml-3 shrink-0 text-xs">
                  {c.balanceCents > 0 && <span className="text-green-700">+{fmtEur(c.balanceCents)}</span>}
                  {(debtByCustomerId?.get(c.id) ?? 0) > 0 && (
                    <span className="text-red-600">−{fmtEur(debtByCustomerId!.get(c.id)!)}</span>
                  )}
                </span>
              </button>
            ))
          )}
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/5",
                results.length > 0 && "border-t"
              )}
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              {query.trim() ? <>Crear cliente «<span className="truncate">{query.trim()}</span>»</> : "Crear cliente nuevo"}
            </button>
          )}
        </div>
      )}
      {dialog}
    </div>
  )
}

/* ─── Add line panel ─────────────────────────────────────────────────────── */

type AddLineTab = "SERVICE" | "PRODUCT" | "GIFT_CARD" | "VOUCHER"

function AddLinePanel({ services, products, workers, currentUserId, customers, giftRecipient, onGiftRecipientChange, onCustomerCreated, onAdd, hasGiftCard, hasRegularLines, voucherTemplates, hasCustomer }: {
  services: Service[]; products: Product[]; workers: Worker[]
  currentUserId: string | null
  customers: Customer[]
  giftRecipient: Customer | null
  onGiftRecipientChange: (c: Customer | null) => void
  onCustomerCreated: (c: Customer) => void
  onAdd: (line: DraftLine) => void
  hasGiftCard: boolean
  hasRegularLines: boolean
  voucherTemplates: VoucherTemplateRow[]
  /** Un bono va siempre a nombre de alguien; sin cliente no se puede vender. */
  hasCustomer: boolean
}) {
  const [tab, setTab] = useState<AddLineTab>("SERVICE")
  const [query, setQuery] = useState("")
  // null = todavía no se ha elegido, y el desplegable enseña las familias.
  // TODAS_LAS_FAMILIAS = se ha pedido el catálogo entero a propósito.
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [giftAmount, setGiftAmount] = useState("")
  const [giftNote, setGiftNote] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", out)
    return () => document.removeEventListener("mousedown", out)
  }, [])

  const defaultWorkerId = useMemo(
    () => (currentUserId ? workers.find((w) => w.id === currentUserId)?.id : undefined)
      ?? (workers.length === 1 ? workers[0].id : null),
    [currentUserId, workers],
  )

  // Las familias que tienen algo que ofrecer, en el orden del catálogo: una
  // familia vacía en el desplegable es un callejón sin salida.
  const families = useMemo(() => {
    const acc = new Map<string, { id: string; name: string; sortOrder: number; count: number }>()
    for (const s of services) {
      const prev = acc.get(s.familyId)
      if (prev) prev.count++
      else acc.set(s.familyId, { id: s.familyId, name: s.familyName, sortOrder: s.familySortOrder, count: 1 })
    }
    return [...acc.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"),
    )
  }, [services])

  const activeFamily = familyId && familyId !== TODAS_LAS_FAMILIAS
    ? families.find((f) => f.id === familyId) ?? null
    : null

  const tabItems = useMemo(() => {
    const q = normalize(query)
    if (tab === "SERVICE") {
      return services.filter((s) =>
        (!familyId || familyId === TODAS_LAS_FAMILIAS || s.familyId === familyId) &&
        (!q || normalize(s.name).includes(q)),
      )
    }
    if (tab === "VOUCHER") {
      // Se busca por el nombre del pack y por los servicios que lleva dentro:
      // en el mostrador se pregunta "¿tenéis bono de láser?", no por el nombre
      // que le pusimos al bono.
      return voucherTemplates.filter((t) => !q
        || normalize(t.name).includes(q)
        || t.services.some((x) => normalize(x.name).includes(q)))
    }
    return products.filter((p) => !q || normalize(p.name).includes(q))
  }, [tab, query, services, products, voucherTemplates, familyId])

  // Sin familia elegida y sin teclear, el desplegable enseña las familias: es
  // la entrada para quien no se sabe el nombre del servicio de memoria. En
  // cuanto se teclea, se busca en el catálogo entero — quien se lo sabe no
  // tiene por qué pasar por la familia.
  const mostrarFamilias = tab === "SERVICE" && !familyId && query.trim() === ""

  function addGiftCard() {
    const cents = Math.round(Number(giftAmount) * 100)
    if (!cents || cents <= 0) return
    const recipientName = giftRecipient ? customerLabel(giftRecipient) : ""
    onAdd({
      key: 0, type: "GIFT_CARD", itemId: "gift_card",
      description: recipientName ? `Tarjeta regalo — ${recipientName}` : "Tarjeta regalo",
      // La tarjeta no la presta nadie, y va sola en su ticket: quien la vende
      // ya queda guardado en la venta, que es quien se identificó para cobrar.
      // Pedir además un profesional en la línea era preguntar dos veces lo
      // mismo, y permitía contestar dos cosas distintas.
      workerId: null, quantity: 1, unitPriceCents: cents, discountPercent: 0,
      durationMinutes: null, notes: giftNote.trim() || null, appointmentId: null,
      voucherId: null, voucherRef: null,
    })
    setGiftAmount("")
    setGiftNote("")
  }

  function addVoucher(t: VoucherTemplateRow) {
    onAdd({
      key: 0, type: "VOUCHER", itemId: t.id, description: t.name,
      // La venta del bono no la presta nadie: el profesional va en la sesión.
      workerId: null, quantity: 1,
      // Entra ya a su precio, no a tarifa con un porcentaje: el descuento vive
      // en cada servicio del bono y puede ser distinto en cada uno, así que no
      // hay un porcentaje único que poner en la línea sin mentir. Lo que se
      // ahorra se ve al elegirlo, y la casilla de descuento del ticket sigue
      // libre por si en el mostrador se quiere hacer un precio aparte.
      unitPriceCents: t.finalPriceCents, discountPercent: 0,
      durationMinutes: null, notes: null, appointmentId: null,
      voucherId: null,
      // Para poder gastarlo en este mismo ticket, antes de que exista.
      voucherRef: crypto.randomUUID(),
    })
  }

  const tabs: { id: AddLineTab; label: string; icon: React.ElementType }[] = [
    { id: "SERVICE",   label: "Servicio",      icon: Scissors },
    { id: "PRODUCT",   label: "Producto",       icon: Package },
    { id: "VOUCHER",   label: "Bono",           icon: Ticket },
    { id: "GIFT_CARD", label: "Tarjeta regalo", icon: Gift },
  ]

  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Añadir línea</h3>
      <div className="rounded-xl border bg-background p-4 space-y-3">
        <div className="flex gap-1">
          {tabs.map((t) => {
            const Icon = t.icon
            // Una tarjeta regalo se vende sola: no se mezcla con servicios/productos.
            const disabled = t.id === "GIFT_CARD" ? hasRegularLines : hasGiftCard
            return (
              <button key={t.id} type="button"
                disabled={disabled}
                onClick={() => { if (disabled) return; setTab(t.id); setQuery(""); setFamilyId(null); setOpen(false) }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  disabled
                    ? "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
                    : tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}>
                <Icon className="h-3.5 w-3.5" />{t.label}
              </button>
            )
          })}
        </div>
        {(hasGiftCard || hasRegularLines) && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {hasGiftCard
              ? "Una tarjeta regalo se vende en un ticket aparte. Quita la tarjeta para añadir servicios o productos."
              : "No se puede añadir una tarjeta regalo a una venta con servicios o productos."}
          </p>
        )}

        {tab === "GIFT_CARD" ? (
          <div className="space-y-3">
            {/* Destinatario */}
            <CustomerSelector
              label="Destinatario (quien recibe el saldo)"
              customers={customers}
              selected={giftRecipient}
              onSelect={onGiftRecipientChange}
              onClear={() => onGiftRecipientChange(null)}
              onCreated={onCustomerCreated}
              placeholder="Buscar cliente destinatario…"
            />
            {/* Importe. Quién la vende no se pregunta: va en la venta. */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Importe (€)</label>
              <Input
                type="number" step="0.01" min="0" placeholder="0,00"
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value)}
                className="tabular-nums"
              />
            </div>

            {/* La tarjeta es saldo suelto, sin servicio ni producto detrás, así
                que lo que se plantea regalar solo queda escrito si se apunta. */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Para qué se la regala (opcional)</label>
              <Input
                maxLength={120}
                placeholder="Ej. Un tratamiento facial por su cumpleaños"
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={addGiftCard}
              disabled={!giftAmount || Number(giftAmount) <= 0 || !giftRecipient}
            >
              <Plus className="h-4 w-4 mr-1" /> Añadir
            </Button>
            {!giftRecipient && (
              <p className="text-xs text-muted-foreground">Selecciona primero el destinatario.</p>
            )}
          </div>
        ) : (
          <div ref={ref} className="relative">
            {tab === "VOUCHER" && !hasCustomer && (
              <p className="mb-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Elige primero el cliente: un bono va siempre a su nombre.
              </p>
            )}
            {/* Dónde estás dentro del catálogo. Sin esto, al filtrar por una
                familia parece que faltan servicios. */}
            {tab === "SERVICE" && familyId && (
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Buscando en</span>
                <button
                  type="button"
                  onClick={() => { setFamilyId(null); setQuery(""); setOpen(true) }}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 font-medium hover:bg-muted/70"
                  title="Volver a las familias"
                >
                  {activeFamily ? activeFamily.name : "Todos los servicios"}
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 h-11"
                placeholder={
                  tab === "PRODUCT" ? "Buscar producto…"
                    : tab === "VOUCHER" ? "Buscar bono por nombre o servicio…"
                    : activeFamily ? `Buscar en ${activeFamily.name}…`
                    : "Buscar servicio por nombre…"
                }
                // Un bono va a nombre de alguien: sin cliente no hay nada que
                // buscar, y dejar teclear para luego no dejar añadir engaña.
                disabled={tab === "VOUCHER" && !hasCustomer}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
              />
            </div>

            {/* Nivel 1: las familias. */}
            {open && mostrarFamilias && families.length > 0 && (
              <div className="absolute z-40 w-full mt-1 bg-background border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                <p className="px-4 pt-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Familias
                </p>
                {families.map((f) => (
                  <button key={f.id} type="button"
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 text-left transition-colors text-sm"
                    onClick={() => setFamilyId(f.id)}>
                    <span className="font-medium truncate">{f.name}</span>
                    <span className="text-muted-foreground ml-3 shrink-0">
                      {f.count} {f.count === 1 ? "servicio" : "servicios"}
                    </span>
                  </button>
                ))}
                <button type="button"
                  className="w-full border-t px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
                  onClick={() => setFamilyId(TODAS_LAS_FAMILIAS)}>
                  Ver todos los servicios ({services.length})
                </button>
              </div>
            )}
            {open && !mostrarFamilias && tabItems.length === 0 && (
              <div className="absolute z-40 w-full mt-1 rounded-xl border bg-background p-4 text-sm text-muted-foreground shadow-lg">
                {tab === "VOUCHER" && voucherTemplates.length === 0
                  ? "No hay bonos a la venta. Se dan de alta en la gestión del centro."
                  : activeFamily
                    ? <>Nada en {activeFamily.name} con ese nombre. <button type="button" className="underline" onClick={() => setFamilyId(TODAS_LAS_FAMILIAS)}>Buscar en todas</button>.</>
                    : "Sin resultados."}
              </div>
            )}
            {open && !mostrarFamilias && tabItems.length > 0 && (
              <div className="absolute z-40 w-full mt-1 bg-background border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                {tabItems.slice(0, 10).map((item) => {
                  if (tab === "VOUCHER") {
                    const b = item as VoucherTemplateRow
                    return (
                      <button key={b.id} type="button"
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 text-left transition-colors text-sm"
                        onClick={() => { addVoucher(b); setQuery(""); setOpen(false) }}>
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{b.name}</span>
                          {/* Qué lleva dentro y cuántas sesiones de cada cosa.
                              Lo demás —descuentos, precio por sesión, ahorro—
                              sale en la línea del ticket, ya elegido. */}
                          <span className="block truncate text-xs text-muted-foreground">
                            {bonoLoQueIncluye(b)}
                          </span>
                        </span>
                        <span className="text-muted-foreground tabular-nums ml-3 shrink-0">
                          {fmtEur(b.finalPriceCents)}
                        </span>
                      </button>
                    )
                  }
                  const isService = tab === "SERVICE"
                  const s = item as Service
                  const p = item as Product
                  return (
                    <button key={item.id} type="button"
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 text-left transition-colors text-sm"
                      onClick={() => {
                        if (isService) {
                          onAdd({
                            key: 0, type: "SERVICE", itemId: s.id, description: s.name,
                            workerId: defaultWorkerId, notes: null, appointmentId: null,
                            voucherId: null, voucherRef: null,
                            quantity: 1, unitPriceCents: s.priceCents, discountPercent: 0,
                            durationMinutes: s.pricingType === "PER_MINUTE" ? s.durationMinutes : null,
                          })
                        } else {
                          onAdd({
                            key: 0, type: "PRODUCT", itemId: p.id, description: p.name,
                            workerId: defaultWorkerId, quantity: 1, unitPriceCents: p.priceCents, discountPercent: 0,
                            durationMinutes: null, notes: null, appointmentId: null,
                            voucherId: null, voucherRef: null,
                          })
                        }
                        setQuery(""); setOpen(false)
                      }}>
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{item.name}</span>
                        {/* La familia va en cada fila cuando se busca por
                            nombre: si no, el resultado sale sin contexto y no
                            se sabe de dónde ha salido. */}
                        {isService && !activeFamily && (
                          <span className="block text-xs text-muted-foreground">{s.familyName}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground tabular-nums ml-3 shrink-0">
                        {isService
                          ? (s.pricingType === "PER_MINUTE" && s.pricePerMinuteCents ? `${fmtEur(s.pricePerMinuteCents)}/min` : fmtEur(s.priceCents))
                          : <><span className={p.stock === 0 ? "text-red-500" : ""}>{p.stock} ud</span> · {fmtEur(p.priceCents)}</>
                        }
                      </span>
                    </button>
                  )
                })}
                {tabItems.length > 10 && (
                  <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                    Y {tabItems.length - 10} más. Sigue escribiendo para afinar.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Qué lleva el bono, en una línea: lo justo para elegirlo en el buscador. */
function bonoLoQueIncluye(bono: VoucherTemplateRow): string {
  return bono.services.map((x) => `${x.name} ×${x.totalSessions}`).join(" · ")
}

/**
 * El detalle del bono ya elegido, en su línea del ticket: qué descuento lleva
 * cada servicio y a cuánto le sale la sesión frente a pagarla suelta.
 *
 * Vive aquí y no en el buscador a propósito. En el buscador es ruido —se está
 * eligiendo entre varios— y en cambio hace falta tenerlo delante justo cuando
 * el bono ya está en el ticket y toca explicárselo a la clienta.
 */
function BonoDetalle({ bono }: { bono: VoucherTemplateRow }) {
  // Lo que costarían esas mismas sesiones sueltas, que es contra lo que se
  // vende. No es la tarifa del bono: esa se puede haber tocado al darlo de alta.
  const sueltoCents = bono.services.reduce((n, x) => n + x.servicePriceCents * x.totalSessions, 0)
  const ahorroCents = sueltoCents - bono.finalPriceCents

  return (
    <div className="mt-1 space-y-0.5">
      {bono.services.map((x) => {
        const ahorroPorSesion = sessionSavingsCents(x.servicePriceCents, x.pricePerSessionCents)
        return (
          <p key={x.id} className="text-xs text-muted-foreground">
            {x.name} ×{x.totalSessions}
            {/* El descuento es el de este servicio, el que se le puso al dar de
                alta el bono: cada uno lleva el suyo y no hay uno del pack. */}
            {x.discountPercent > 0 && (
              <> · <span className="font-medium text-primary">{x.discountPercent}% dto.</span></>
            )}
            {" · "}
            {ahorroPorSesion > 0 ? (
              <>
                de <span className="line-through">{fmtEur(x.servicePriceCents)}</span> a{" "}
                <span className="font-medium text-primary">{fmtEur(x.pricePerSessionCents)}</span> la sesión
              </>
            ) : (
              <>{fmtEur(x.pricePerSessionCents)} la sesión</>
            )}
          </p>
        )
      })}
      {ahorroCents > 0 && (
        <p className="text-xs font-medium text-primary">
          Se ahorra {fmtEur(ahorroCents)} sobre pagarlas sueltas
        </p>
      )}
    </div>
  )
}

/* ─── Line row ───────────────────────────────────────────────────────────── */

function LineRow({ line, workers, onUpdate, onRemove, bonos, onSetBono, bonoVendido }: {
  line: DraftLine; workers: Worker[]
  onUpdate: (p: Partial<DraftLine>) => void; onRemove: () => void
  /** Los bonos que podrían pagar esta línea, con el que ya la paga incluido. */
  bonos: BonoDisponible[]
  onSetBono: (bono: BonoDisponible | null) => void
  /** Solo en la línea que vende un bono: el bono del catálogo que es. */
  bonoVendido: VoucherTemplateRow | null
}) {
  const total = lineTotal(line)
  const [discountStr, setDiscountStr] = useState(line.discountPercent === 0 ? "" : String(line.discountPercent))
  const bonoDeLaLinea = line.type === "VOUCHER_SESSION"
    ? bonos.find((b) => line.voucherId ? b.voucherId === line.voucherId : b.voucherRef === line.voucherRef) ?? null
    : null

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
        {line.notes && (
          <p className="text-xs text-muted-foreground truncate max-w-[14rem]">{line.notes}</p>
        )}
        {bonoVendido && <BonoDetalle bono={bonoVendido} />}
        {/* Un servicio que un bono cubre entra pagado con él, y aquí se ve de
            cuál sale y se puede pasar a cobrar aparte. Solo aparece cuando hay
            algún bono que pueda pagarlo: en el resto de líneas no estorba. */}
        {bonos.length > 0 && (
          <Select
            value={bonoDeLaLinea?.key ?? SIN_BONO}
            onValueChange={(v) => onSetBono(v === SIN_BONO ? null : bonos.find((b) => b.key === v) ?? null)}
          >
            <SelectTrigger className={cn(
              "mt-1 h-7 w-[14rem] text-xs",
              bonoDeLaLinea && "border-primary/40 text-primary",
            )}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_BONO}>Cobrar aparte</SelectItem>
              {bonos.map((b) => (
                <SelectItem key={b.key} value={b.key}>
                  Del bono: {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>

      <td className="px-3 py-2">
        {/* También en el producto: quien lo vende queda guardado en la línea,
            que es lo que permite seguir el ticket entero y medir a cada una.
            Las excepciones son las dos cosas que no presta nadie: el bono
            —quien atiende se apunta en cada sesión que se gaste— y la tarjeta
            regalo, que se vende sola en su ticket y se cuenta a quien lo
            cobró. */}
        {line.type === "VOUCHER" || line.type === "GIFT_CARD" ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : (
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
        )}
      </td>

      <td className="px-3 py-2 text-center">
        {line.type === "GIFT_CARD" || line.type === "VOUCHER" || line.type === "VOUCHER_SESSION"
          ? <span className="text-sm">1</span> : (
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

      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
        <span className={cn(line.type === "VOUCHER_SESSION" && "line-through")}>
          {fmtEur(line.unitPriceCents)}
        </span>
      </td>

      <td className="px-3 py-2 text-center">
        {line.type === "GIFT_CARD" || line.type === "VOUCHER_SESSION"
          ? <span className="text-muted-foreground text-xs">—</span> : (
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
          className="h-7 w-7 rounded flex items-center justify-center text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

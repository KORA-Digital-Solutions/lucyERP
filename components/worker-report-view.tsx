"use client"

/**
 * Informe de personal: qué ha hecho una empleada.
 *
 * Es el mismo informe que "Total Servicios" de la ficha del cliente, pero
 * mirando por el otro lado: allí se ve todo lo que se le ha cobrado a una
 * persona, y aquí todo lo que ha hecho una empleada. Se mantienen a propósito
 * la misma disposición (filtros arriba, tabla que ordena por cabeceras, total
 * de lo que se está viendo abajo) y una línea por concepto cobrado, no por
 * ticket, que es como se leen los listados de servicios realizados de siempre.
 *
 * Es el contenido de la pestaña "Actividad" de la ficha de empleada: quién es
 * y cómo se vuelve atrás lo pone la ficha, así que aquí no hay ni cabecera ni
 * botón de volver. Antes esto se abría a pantalla completa desde un icono de
 * la tabla de usuarios y quedaba fuera de todo contexto.
 */

import { useEffect, useMemo, useState } from "react"
import { Info, Search, ShoppingCart, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fmtEur } from "@/components/client-profile-view"
import {
  useTableSort, SortableTableHead, byText, byNumber, byDate,
  type SortRule,
} from "@/components/sortable-table-head"
import { getWorkerReport, type WorkerReportLine } from "@/lib/actions"
import { normalizeSearch } from "@/lib/format"
import type { WorkerRow } from "@/components/workers-client"

type ReportData = Awaited<ReturnType<typeof getWorkerReport>>

const TYPE_LABEL: Record<string, string> = {
  SERVICE: "Servicio",
  PRODUCT: "Producto",
  GIFT_CARD: "Tarjeta regalo",
}

const SORTERS = {
  fecha: byDate<WorkerReportLine>((r) => r.date),
  tipo: byText<WorkerReportLine>((r) => TYPE_LABEL[r.type] ?? r.type),
  familia: byText<WorkerReportLine>((r) => r.family),
  descripcion: byText<WorkerReportLine>((r) => r.description),
  cliente: byText<WorkerReportLine>((r) => r.customerName),
  uds: byNumber<WorkerReportLine>((r) => r.quantity),
  dto: byNumber<WorkerReportLine>((r) => r.discountPercent),
  total: byNumber<WorkerReportLine>((r) => r.totalCents),
}

type SortKey = keyof typeof SORTERS

// Lo más reciente primero, que es lo que se mira al abrir el informe.
const SORT_INICIAL: SortRule<SortKey>[] = [{ key: "fecha", dir: "desc" }]

const TODOS_TIPOS = "__todos__"
const TODAS_FAMILIAS = "__todas__"

export function WorkerReportView({ worker }: { worker: WorkerRow }) {
  const [data, setData] = useState<ReportData | null>(null)
  const [search, setSearch] = useState("")
  const [type, setType] = useState(TODOS_TIPOS)
  const [family, setFamily] = useState(TODAS_FAMILIAS)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  useEffect(() => {
    setData(null)
    getWorkerReport(worker.id).then(setData)
  }, [worker.id])

  const rows = useMemo(() => data?.lines ?? [], [data])

  // Las familias del desplegable salen de lo que esta empleada ha hecho, no
  // del catálogo entero: no tiene sentido ofrecer filtrar por algo que nunca
  // ha tocado.
  const familyCounts = useMemo(() => {
    const acc = new Map<string, number>()
    for (const r of rows) acc.set(r.family, (acc.get(r.family) ?? 0) + 1)
    return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"))
  }, [rows])

  const typeCounts = useMemo(() => {
    const acc = new Map<string, number>()
    for (const r of rows) acc.set(r.type, (acc.get(r.type) ?? 0) + 1)
    return acc
  }, [rows])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return rows.filter((r) => {
      const day = r.date.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (type !== TODOS_TIPOS && r.type !== type) return false
      if (family !== TODAS_FAMILIAS && r.family !== family) return false
      if (q && !normalizeSearch(`${r.description} ${r.family} ${r.customerName ?? ""}`).includes(q)) return false
      return true
    })
  }, [rows, search, type, family, from, to])

  const { sort, sorted, toggleSort } = useTableSort<WorkerReportLine, SortKey>(
    filtered, SORTERS, SORT_INICIAL,
  )

  // Los totales de arriba son los de lo filtrado, no los de siempre: si se
  // pide "agosto" y el número que se lee es el del año, engaña.
  const totals = useMemo(() => {
    let services = 0, products = 0, giftCards = 0
    for (const r of filtered) {
      if (r.type === "SERVICE") services += r.totalCents
      else if (r.type === "PRODUCT") products += r.totalCents
      else if (r.type === "GIFT_CARD") giftCards += r.totalCents
    }
    return { services, products, giftCards, total: services + products + giftCards }
  }, [filtered])

  const hayFiltro = search !== "" || type !== TODOS_TIPOS || family !== TODAS_FAMILIAS || from !== "" || to !== ""
  // El aviso solo sale si hay a la vista alguna línea antigua sin profesional:
  // en un informe de ventas nuevas no pinta nada.
  const hayProductoAproximado = filtered.some((r) => r.attributedByTicket)

  function limpiarFiltros() {
    setSearch(""); setType(TODOS_TIPOS); setFamily(TODAS_FAMILIAS); setFrom(""); setTo("")
  }

  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Servicios realizados y productos vendidos
      </p>
      <div>
        {!data ? (
          <p className="text-sm text-muted-foreground">Cargando informe…</p>
        ) : rows.length === 0 ? (
          <div className="max-w-xl rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" />
            <p className="font-medium">Sin actividad registrada</p>
            <p className="mt-1 text-sm">
              Aquí aparecerán los servicios que realice y los productos que venda.
            </p>
          </div>
        ) : (
          <div className="max-w-[1400px] space-y-3">

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[14rem] max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  placeholder="Buscar servicio, producto o cliente…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS_TIPOS}>Todo ({rows.length})</SelectItem>
                  {Object.entries(TYPE_LABEL).map(([key, label]) => {
                    const n = typeCounts.get(key)
                    return n ? <SelectItem key={key} value={key}>{label} ({n})</SelectItem> : null
                  })}
                </SelectContent>
              </Select>
              <Select value={family} onValueChange={setFamily}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Familia" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS_FAMILIAS}>Todas las familias ({rows.length})</SelectItem>
                  {familyCounts.map(([f, n]) => (
                    <SelectItem key={f} value={f}>{f} ({n})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Label htmlFor="inf-desde" className="text-xs font-normal text-muted-foreground">Desde</Label>
                <Input id="inf-desde" type="date" className="h-9 w-[9.5rem]" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Label htmlFor="inf-hasta" className="text-xs font-normal text-muted-foreground">Hasta</Label>
                <Input id="inf-hasta" type="date" className="h-9 w-[9.5rem]" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              {hayFiltro && (
                <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Quitar filtros
                </Button>
              )}
            </div>

            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="fecha" sort={sort} onToggle={toggleSort}>Fecha</SortableTableHead>
                    <SortableTableHead sortKey="tipo" sort={sort} onToggle={toggleSort}>Tipo</SortableTableHead>
                    <SortableTableHead sortKey="familia" sort={sort} onToggle={toggleSort}>Familia</SortableTableHead>
                    <SortableTableHead sortKey="descripcion" sort={sort} onToggle={toggleSort}>Descripción</SortableTableHead>
                    <SortableTableHead sortKey="cliente" sort={sort} onToggle={toggleSort}>Cliente</SortableTableHead>
                    <SortableTableHead sortKey="uds" sort={sort} onToggle={toggleSort} className="text-right">Uds</SortableTableHead>
                    <SortableTableHead sortKey="dto" sort={sort} onToggle={toggleSort} className="text-right">Dto</SortableTableHead>
                    <SortableTableHead sortKey="total" sort={sort} onToggle={toggleSort} className="text-right">Total</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(r.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                        {r.ticketStatus === "DEBT" && (
                          <span className="ml-2 text-xs text-[#B31412]">sin cobrar</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {TYPE_LABEL[r.type] ?? r.type}
                        {/* Producto antiguo sin profesional en la línea: se
                            cuenta a quien cobró, y hay que decirlo donde se
                            lee, no solo en la nota de abajo. */}
                        {r.attributedByTicket && (
                          <span className="ml-1 text-xs text-[#92400E]" title="Atribuido a quien cobró el ticket">≈</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.family}</TableCell>
                      <TableCell>
                        {r.description}
                        {/* Solo las tarjetas regalo la traen: es lo único que
                            dice para qué se compró. */}
                        {r.notes && <span className="block text-xs text-muted-foreground">{r.notes}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.customerName ?? <span className="text-muted-foreground/50">Sin cliente</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.quantity}</TableCell>
                      {/* El descuento solo se enseña cuando lo hay, como en los
                          listados de servicios realizados de siempre. */}
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.discountPercent > 0 ? `${r.discountPercent}%` : ""}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtEur(r.totalCents)}</TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Sin resultados con estos filtros.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            {/* Total de lo que se está viendo, separando servicios de producto,
                que es la pregunta del informe. Cuando hay filtros se recuerda
                además el total de todo, para no perder la referencia. */}
            <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 rounded-xl border bg-muted/20 px-4 py-3">
              {/* Los tickets solo se pueden contar sobre el informe entero:
                  la línea no guarda de qué ticket viene, así que con filtros
                  puestos el número mentiría y se calla. */}
              <span className="mr-auto text-xs text-muted-foreground">
                {sorted.length} {sorted.length === 1 ? "línea" : "líneas"}
                {!hayFiltro && ` · ${data.ticketCount} tickets`}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Servicios</span>
                <span className="text-lg font-semibold tabular-nums">{fmtEur(totals.services)}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Producto</span>
                <span className="text-lg font-semibold tabular-nums">{fmtEur(totals.products)}</span>
              </span>
              {totals.giftCards > 0 && (
                <span className="flex items-baseline gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tarjetas regalo</span>
                  <span className="text-lg font-semibold tabular-nums">{fmtEur(totals.giftCards)}</span>
                </span>
              )}
              {hayFiltro && (
                <span className="text-xs text-muted-foreground">
                  de {fmtEur(data.totalCents)} en total
                </span>
              )}
              <span className="flex items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {hayFiltro ? "Total filtrado" : "Total"}
                </span>
                <span className="text-2xl font-bold tabular-nums">{fmtEur(totals.total)}</span>
              </span>
            </div>

            {hayProductoAproximado && (
              <div className="flex max-w-3xl gap-3 rounded-lg border border-[#F59E0B]/40 bg-[#FEF3E2] p-3 text-sm text-[#92400E]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Las líneas marcadas con <strong>≈</strong> son producto de ventas antiguas,
                  de antes de que el TPV pidiera la profesional en cada línea: se cuentan a
                  quien cobró el ticket. Las ventas nuevas llevan la profesional guardada
                  línea a línea, así que no aparecen marcadas.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

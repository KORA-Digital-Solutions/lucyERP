"use client"

/**
 * Informes del centro.
 *
 * La mitad de arriba ya son datos de verdad: resumen del período, facturación
 * por empleada, lo más vendido, ingresos por familia, formas de cobro,
 * descuentos y la evolución mensual. Abajo sigue el catálogo de lo que falta,
 * que es lo que se acordó con la propietaria antes de ponerse, y que sirve de
 * mapa de por dónde seguir.
 *
 * Qué cuenta como facturación y por qué las tarjetas regalo van aparte está
 * explicado en lib/reports.ts, que es donde se calcula. Aquí solo se pinta.
 *
 * El período viaja en la URL (?periodo=…) y no en un useState: así la página
 * se recalcula en el servidor —que es quien tiene la base— y un informe
 * concreto se puede guardar en marcadores o mandar por chat.
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  Users,
  Package,
  Wallet,
  CalendarClock,
  TrendingUp,
  ChevronRight,
  Star,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import {
  PERIODOS,
  type FilaDeCobro, type FilaDeConcepto, type FilaDeFamilia, type MesDeEvolucion,
  type PeriodoId, type ResumenDeDescuentos, type Totales,
} from "@/lib/reports"
import { cn } from "@/lib/utils"

/**
 * En esta pantalla no se pincha en ninguna fila, así que ninguna se ilumina al
 * pasar por encima: el resalte del ratón promete que algo va a pasar, y aquí no
 * pasa nada. Es lo que trae `TableRow` de serie y hay que quitarlo a mano.
 */
const SIN_HOVER = "hover:bg-transparent"

/* ─── Lo que recibe de la página ─────────────────────────────────────────── */

export type FilaDeEmpleadaConNombre = {
  workerId: string | null
  nombre: string
  color: string
  activa: boolean
  servicesCents: number
  productsCents: number
  totalCents: number
  tickets: number
}

export interface ReportsClientProps {
  periodo: {
    id: PeriodoId
    etiqueta: string
    etiquetaAnterior: string
    desde: string
    hasta: string
  }
  resumen: Totales
  /** Porcentaje contra el tramo anterior, o null si antes no había nada. */
  variacion: number | null
  empleadas: FilaDeEmpleadaConNombre[]
  servicios: FilaDeConcepto[]
  productos: FilaDeConcepto[]
  familias: FilaDeFamilia[]
  cobros: FilaDeCobro[]
  descuentos: Omit<ResumenDeDescuentos, "filas"> & {
    filas: (ResumenDeDescuentos["filas"][number] & { nombre: string })[]
  }
  evolucion: MesDeEvolucion[]
}

/* ─── Catálogo de lo que falta ───────────────────────────────────────────── */

type Availability = "DONE" | "READY" | "PARTIAL" | "BLOCKED"

const AVAILABILITY_META: Record<Availability, { label: string; className: string }> = {
  DONE:    { label: "Ya en esta pantalla",   className: "bg-[#E5E9F7] border-[#3C54A4] text-[#274775]" },
  READY:   { label: "Con los datos actuales", className: "bg-[#E6F4EA] border-[#34A853] text-[#1E6B34]" },
  PARTIAL: { label: "Aproximado",             className: "bg-[#FEF3E2] border-[#F59E0B] text-[#92400E]" },
  BLOCKED: { label: "Falta guardar el dato",  className: "bg-[#FCE8E6] border-[#EA4335] text-[#B31412]" },
}

interface ReportDef {
  title: string
  question: string
  availability: Availability
  note?: string
}

interface ReportGroup {
  id: string
  title: string
  description: string
  icon: typeof BarChart3
  reports: ReportDef[]
}

const GROUPS: ReportGroup[] = [
  {
    id: "ingresos",
    title: "Ingresos",
    description: "Qué entra en el centro, de quién viene y por qué concepto.",
    icon: TrendingUp,
    reports: [
      {
        title: "Facturación por empleada",
        question: "¿Cuánto factura cada una en servicios y cuánto en producto?",
        availability: "DONE",
      },
      {
        title: "Evolución de la facturación",
        question: "¿Vamos mejor o peor que el mes/año pasado?",
        availability: "DONE",
      },
      {
        title: "Lo más vendido",
        question: "¿Qué servicios y qué productos se venden más en el período?",
        availability: "DONE",
      },
      {
        title: "Ingresos por familia",
        question: "¿Qué familias sostienen el centro y cuáles no compensan?",
        availability: "DONE",
      },
      {
        title: "Margen de la venta de producto",
        question: "¿Con qué margen se vende cada producto?",
        availability: "READY",
        note: "Unidades e importe ya salen arriba. El margen sale de precio − coste actual del producto; si cambia el coste, el histórico se recalcula.",
      },
      {
        title: "Formas de cobro",
        question: "¿Cuánto entra en efectivo, tarjeta, saldo de tarjeta regalo o queda a deber?",
        availability: "DONE",
      },
      {
        title: "Descuentos aplicados",
        question: "¿Cuánto dejamos de ingresar en descuentos y quién los hace?",
        availability: "DONE",
      },
    ],
  },
  {
    id: "gastos",
    title: "Gastos y márgenes",
    description: "Qué sale del centro y qué queda realmente después.",
    icon: Package,
    reports: [
      {
        title: "Compras a proveedores",
        question: "¿Cuánto he gastado en producto este mes y con qué proveedor?",
        availability: "READY",
        note: "Se calcula con las entradas de stock valoradas a coste.",
      },
      {
        title: "Consumo interno de producto",
        question: "¿Cuánto producto se gasta en cabina y qué coste tiene?",
        availability: "READY",
      },
      {
        title: "Gastos fijos y generales",
        question: "¿Cuánto se va en alquiler, nóminas, luz, seguros…?",
        availability: "BLOCKED",
        note: "Hoy no existe ningún sitio donde anotar estos gastos. Haría falta una pantalla de gastos.",
      },
      {
        title: "Margen por servicio",
        question: "¿Cuánto deja de verdad cada tratamiento, descontando lo que cuesta darlo?",
        availability: "BLOCKED",
        note: "Pendiente de definir el coste de cabina: consumibles de stock, consumibles no inventariados, mano de obra por minuto y uso de aparatología.",
      },
      {
        title: "Resultado del período",
        question: "Ingresos − gastos: ¿cuánto ha quedado de verdad?",
        availability: "BLOCKED",
        note: "Depende del informe de gastos generales.",
      },
      {
        title: "Valor del inventario",
        question: "¿Cuánto dinero tengo parado en estanterías y qué rota poco?",
        availability: "READY",
      },
    ],
  },
  {
    id: "clientes",
    title: "Clientes",
    description: "De dónde viene la facturación y qué clientes se están perdiendo.",
    icon: Users,
    reports: [
      {
        title: "Nuevas vs. recurrentes",
        question: "¿Estoy captando clientes nuevos o vivo de los de siempre?",
        availability: "READY",
      },
      {
        title: "Ticket medio y frecuencia",
        question: "¿Cuánto se deja cada cliente y cada cuánto vuelve?",
        availability: "READY",
        note: "El ticket medio del centro ya está arriba; falta abrirlo por cliente y cruzarlo con cada cuánto vuelve.",
      },
      {
        title: "Clientes inactivos",
        question: "¿Quién lleva meses sin venir y habría que recuperar?",
        availability: "READY",
        note: "Usa el umbral de inactividad que ya está en Configuración.",
      },
      {
        title: "Ranking de clientes",
        question: "¿Quiénes son mis mejores clientes por gasto acumulado?",
        availability: "READY",
      },
      {
        title: "Deuda pendiente",
        question: "¿Quién debe dinero y desde cuándo?",
        availability: "READY",
      },
      {
        title: "Tarjetas regalo",
        question: "¿Cuánto saldo he vendido y cuánto está sin consumir?",
        availability: "READY",
        note: "Lo vendido en el período ya sale arriba; falta cuánto queda sin gastar.",
      },
    ],
  },
  {
    id: "actividad",
    title: "Actividad del centro",
    description: "Cómo se está usando la agenda, las cabinas y las horas de trabajo.",
    icon: CalendarClock,
    reports: [
      {
        title: "Ocupación de agenda",
        question: "¿Qué porcentaje de las horas disponibles se llena?",
        availability: "READY",
        note: "Por empleada mide carga de trabajo; por cabina, si hacen falta más puestos. Las cabinas son puestos calientes, así que no dicen nada del rendimiento de nadie.",
      },
      {
        title: "Cancelaciones y ausencias",
        question: "¿Cuántas citas se caen, cuándo y con qué servicio?",
        availability: "PARTIAL",
        note: "Se registra la cancelación; el «no asistió» depende de que se marque en la agenda.",
      },
      {
        title: "Horas trabajadas y ausencias",
        question: "¿Cuántas horas ha hecho cada empleada y cuántos días libres le quedan?",
        availability: "READY",
      },
    ],
  },
]

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Sin céntimos: en las tarjetas de cabecera estorban más de lo que informan. */
function eurRedondo(cents: number) {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  })
}

function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}

/* ─── Componente ─────────────────────────────────────────────────────────── */

export function ReportsClient({
  periodo, resumen, variacion, empleadas, servicios, productos,
  familias, cobros, descuentos, evolucion,
}: ReportsClientProps) {
  const [group, setGroup] = useState<string>("ingresos")
  const activeGroup = GROUPS.find((g) => g.id === group) ?? GROUPS[0]
  const sinDatos = resumen.tickets === 0

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
            <p className="text-sm text-muted-foreground">
              Cómo va el centro: ingresos, gastos, clientes y ocupación
            </p>
          </div>
        </div>
      </div>

      <SelectorDePeriodo periodo={periodo} />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          {sinDatos ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <p className="font-medium text-foreground">No hay ventas en este período.</p>
                <p className="mt-1 text-sm">
                  Prueba con otro período, o cobra algo en el mostrador y vuelve.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  label="Facturación" value={eurRedondo(resumen.totalCents)} icon={TrendingUp}
                  hint={
                    variacion === null
                      ? `Sin nada que comparar en ${periodo.etiquetaAnterior}`
                      : `${variacion > 0 ? "+" : ""}${variacion} % sobre el período anterior`
                  }
                />
                <SummaryCard
                  label="Servicios" value={eurRedondo(resumen.servicesCents)} icon={CalendarClock}
                  hint={`${porcentaje(resumen.servicesCents, resumen.totalCents)} % del total`}
                />
                <SummaryCard
                  label="Producto" value={eurRedondo(resumen.productsCents)} icon={Package}
                  hint={`${porcentaje(resumen.productsCents, resumen.totalCents)} % del total`}
                />
                <SummaryCard
                  label="Ticket medio" value={eurRedondo(resumen.ticketMedioCents)} icon={Wallet}
                  hint={`${resumen.tickets} ${resumen.tickets === 1 ? "ticket" : "tickets"}`}
                />
              </div>

              <FacturacionPorEmpleada
                filas={empleadas}
                totalCents={resumen.totalCents}
                saldoVendidoCents={resumen.saldoVendidoCents}
                periodo={periodo.etiqueta}
              />

              <LoMasVendido servicios={servicios} productos={productos} />

              <IngresosPorFamilia filas={familias} totalCents={resumen.totalCents} />

              <div className="grid gap-4 lg:grid-cols-2">
                <FormasDeCobro filas={cobros} />
                <Descuentos resumen={descuentos} />
              </div>

              <Evolucion meses={evolucion} />
            </>
          )}

          {/* Catálogo de informes propuestos */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Informes propuestos</h2>
              <p className="text-sm text-muted-foreground">
                Lo que falta por hacer, y de lo que falta, qué se puede ya y qué no.
              </p>
            </div>

            <div className="flex flex-wrap gap-1 border-b">
              {GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroup(g.id)}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                    group === g.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <g.icon className="h-4 w-4" />
                  {g.title}
                </button>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">{activeGroup.description}</p>

            <div className="grid gap-4 md:grid-cols-2">
              {activeGroup.reports.map((r) => {
                const meta = AVAILABILITY_META[r.availability]
                return (
                  <Card key={r.title} className={cn(r.availability === "DONE" && "border-primary/40")}>
                    <CardContent className="space-y-2 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{r.title}</p>
                        <Badge variant="outline" className={cn("shrink-0 text-[11px]", meta.className)}>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{r.question}</p>
                      {r.note && <p className="text-xs text-muted-foreground/80">{r.note}</p>}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Selector de período ────────────────────────────────────────────────── */

function SelectorDePeriodo({ periodo }: { periodo: ReportsClientProps["periodo"] }) {
  const router = useRouter()
  const [desde, setDesde] = useState(periodo.desde.slice(0, 10))
  const [hasta, setHasta] = useState(periodo.hasta.slice(0, 10))
  const personalizado = periodo.id === "personalizado"

  return (
    <div className="border-b bg-background px-6 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Período</span>
        <div className="flex flex-wrap gap-1">
          {PERIODOS.map((p) => (
            <Link
              key={p.id}
              href={
                p.id === "personalizado"
                  ? `/reports?periodo=personalizado&desde=${desde}&hasta=${hasta}`
                  : `/reports?periodo=${p.id}`
              }
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                periodo.id === p.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{periodo.etiqueta}</span>
      </div>

      {personalizado && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="desde" className="text-xs">Desde</Label>
            <Input
              id="desde" type="date" value={desde} className="h-8 w-40"
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hasta" className="text-xs">Hasta</Label>
            <Input
              id="hasta" type="date" value={hasta} className="h-8 w-40"
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => router.push(`/reports?periodo=personalizado&desde=${desde}&hasta=${hasta}`)}
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  )
}

/* ─── Facturación por empleada ───────────────────────────────────────────── */

function FacturacionPorEmpleada({
  filas, totalCents, saldoVendidoCents, periodo,
}: {
  filas: FilaDeEmpleadaConNombre[]
  totalCents: number
  saldoVendidoCents: number
  periodo: string
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.totalCents))

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Star className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Facturación por empleada</CardTitle>
            <p className="text-xs text-muted-foreground">
              Servicios y venta de producto · {periodo}
            </p>
          </div>
        </div>
        {/* El detalle de qué ha hecho cada una vive en su ficha, y es una
            pantalla entera: se va allí a propósito y no de un clic al vuelo. */}
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href="/workers">
            Para ver el detalle, ir a Usuarios <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <TableHead>Empleada</TableHead>
              <TableHead className="text-right">Servicios</TableHead>
              <TableHead className="text-right">Producto</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="w-56">Peso sobre el total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((w) => {
              return (
                <TableRow key={w.workerId ?? "sin-asignar"} className={SIN_HOVER}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: w.color }}
                      />
                      {w.nombre}
                      {!w.activa && w.workerId && (
                        <Badge variant="secondary" className="py-0 text-[10px]">Baja</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(w.servicesCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(w.productsCents)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(w.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{w.tickets}</TableCell>
                  <TableCell>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="bg-[#3C54A4]"
                        style={{ width: `${(w.servicesCents / maximo) * 100}%` }}
                        title="Servicios"
                      />
                      <div
                        className="bg-[#A8B4DE]"
                        style={{ width: `${(w.productsCents / maximo) * 100}%` }}
                        title="Producto"
                      />
                    </div>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {porcentaje(w.totalCents, totalCents)} % de la facturación
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#3C54A4]" /> Servicios
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#A8B4DE]" /> Producto
          </span>
        </div>

        {saldoVendidoCents > 0 && (
          <p className="text-xs text-muted-foreground">
            Las tarjetas regalo no cuentan aquí: se facturan cuando se gastan, no cuando se
            venden. En este período se vendieron {fmtEur(saldoVendidoCents)} en tarjetas.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/* ─── Lo más vendido ─────────────────────────────────────────────────────── */

const TOP = 10

function LoMasVendido({ servicios, productos }: { servicios: FilaDeConcepto[]; productos: FilaDeConcepto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Lo más vendido</CardTitle>
        <p className="text-xs text-muted-foreground">
          Por número de veces que se ha hecho o despachado · los {TOP} primeros de cada lista
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <TablaDeRanking titulo="Servicios" filas={servicios} />
        <TablaDeRanking titulo="Productos" filas={productos} />
      </CardContent>
    </Card>
  )
}

function TablaDeRanking({ titulo, filas }: { titulo: string; filas: FilaDeConcepto[] }) {
  // El porcentaje se calcula sobre TODAS las unidades vendidas, no sobre las de
  // los diez que se enseñan: si no, el décimo de la lista parecería más
  // importante de lo que es. Vienen ya ordenadas por unidades desde lib.
  const totalUnidades = filas.reduce((a, f) => a + f.unidades, 0)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Nada vendido en este período.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Uds.</TableHead>
              <TableHead className="w-16 text-right">%</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.slice(0, TOP).map((f) => (
              <TableRow key={f.id} className={SIN_HOVER}>
                <TableCell className="font-medium">
                  {f.nombre}
                  {f.grupo && (
                    <span className="block text-[11px] font-normal text-muted-foreground">{f.grupo}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{f.unidades}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {porcentaje(f.unidades, totalUnidades)} %
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(f.totalCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {filas.length > TOP && (
        <p className="text-[11px] text-muted-foreground">
          y {filas.length - TOP} más, que suman{" "}
          {filas.slice(TOP).reduce((a, f) => a + f.unidades, 0)} unidades.
        </p>
      )}
    </div>
  )
}

/* ─── Ingresos por familia ───────────────────────────────────────────────── */

function IngresosPorFamilia({ filas, totalCents }: { filas: FilaDeFamilia[]; totalCents: number }) {
  const maximo = Math.max(1, ...filas.map((f) => f.totalCents))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Ingresos por familia</CardTitle>
        <p className="text-xs text-muted-foreground">
          Qué sostiene el centro. Los productos van como una familia más, «Tto. domiciliario»,
          que es como se listan en la casa.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <TableHead>Familia</TableHead>
              <TableHead className="text-right">Uds.</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="w-56">Peso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.nombre} className={SIN_HOVER}>
                <TableCell className="font-medium">{f.nombre}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{f.unidades}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.totalCents)}</TableCell>
                <TableCell>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-[#3C54A4]" style={{ width: `${(f.totalCents / maximo) * 100}%` }} />
                  </div>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {porcentaje(f.totalCents, totalCents)} % de la facturación
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/* ─── Formas de cobro ────────────────────────────────────────────────────── */

function FormasDeCobro({ filas }: { filas: FilaDeCobro[] }) {
  const total = filas.reduce((a, f) => a + f.totalCents, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Formas de cobro</CardTitle>
        <p className="text-xs text-muted-foreground">Por dónde ha entrado el dinero, ticket a ticket</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <TableHead>Vía</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="w-16 text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.metodo} className={SIN_HOVER}>
                <TableCell className={cn("font-medium", f.metodo === "DEBT" && "text-[#B31412]")}>
                  {f.etiqueta}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{f.ventas}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.totalCents)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {porcentaje(f.totalCents, total)} %
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {/* Sin esto, la primera pregunta al ver la tarjeta es por qué no cuadra
            con la facturación de arriba. */}
        <p className="text-[11px] text-muted-foreground">
          Aquí va el ticket entero, tarjetas regalo incluidas, así que el total no coincide con
          la facturación: son dos preguntas distintas. Y «queda a deber» todavía no ha entrado.
        </p>
      </CardContent>
    </Card>
  )
}

/* ─── Descuentos ─────────────────────────────────────────────────────────── */

function Descuentos({ resumen }: { resumen: ReportsClientProps["descuentos"] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Descuentos aplicados</CardTitle>
        <p className="text-xs text-muted-foreground">
          Lo que se ha dejado de ingresar, repartido por quien cobró el ticket
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-2xl font-bold tabular-nums">{fmtEur(resumen.descuentoCents)}</p>
            <p className="text-xs text-muted-foreground">
              {resumen.porcentaje} % sobre {fmtEur(resumen.brutoCents)} a precio de tarifa
            </p>
          </div>
        </div>

        {resumen.filas.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Ningún descuento en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Quien cobra</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Descuento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumen.filas.map((f) => (
                <TableRow key={f.userId ?? "sin-asignar"} className={SIN_HOVER}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.lineas}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.descuentoCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/* ─── Evolución ──────────────────────────────────────────────────────────── */

function Evolucion({ meses }: { meses: MesDeEvolucion[] }) {
  const maximo = Math.max(1, ...meses.map((m) => m.cents))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Evolución de la facturación</CardTitle>
        <p className="text-xs text-muted-foreground">
          Últimos {meses.length} meses, hasta el final del período elegido
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex h-44 items-end gap-4">
          {meses.map((m) => (
            <div key={m.clave} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">{eurRedondo(m.cents)}</span>
              <div
                className="w-full rounded-t-md bg-[#3C54A4]/85"
                style={{ height: `${(m.cents / maximo) * 100}%` }}
                title={m.clave}
              />
              <span className="text-xs capitalize text-muted-foreground">{m.etiqueta}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ─── Tarjeta de resumen ─────────────────────────────────────────────────── */

function SummaryCard({
  label, value, hint, icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: typeof BarChart3
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-accent p-2">
            <Icon className="h-4 w-4 text-accent-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

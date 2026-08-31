"use client"

/**
 * Informes del centro.
 *
 * La pantalla va por pestañas, una por categoría —ingresos, gastos, clientes y
 * actividad—, que son las cuatro preguntas que se hace la propietaria y el
 * mismo reparto que tenía el catálogo de informes propuestos. Encima de las
 * pestañas se quedan las cifras de cabecera y el selector de período, porque
 * mandan sobre todas ellas.
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
  Boxes,
  Gift,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Clock,
  DoorOpen,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import {
  PERIODOS, horasLegibles,
  type FilaDeCliente, type FilaDeCobro, type FilaDeConcepto, type FilaDeDeuda,
  type FilaDeFamilia, type FilaDeHoras, type FilaDeInactivo, type FilaDeOcupacion,
  type MesDeEvolucion, type PeriodoId, type ResumenDeCaptacion, type ResumenDeCitas,
  type ResumenDeClientes, type ResumenDeConsumo, type ResumenDeDescuentos,
  type ResumenDeDeuda, type ResumenDeInactivos, type ResumenDeInventario,
  type ResumenDeTarjetas, type Totales,
} from "@/lib/reports"
import { cn } from "@/lib/utils"

/**
 * En esta pantalla no se pincha en ninguna fila, así que ninguna se ilumina al
 * pasar por encima: el resalte del ratón promete que algo va a pasar, y aquí no
 * pasa nada. Es lo que trae `TableRow` de serie y hay que quitarlo a mano.
 */
const SIN_HOVER = "hover:bg-transparent"

/** Azul de la casa, y su versión clara para la segunda serie de las barras. */
const AZUL = "#3C54A4"
const AZUL_CLARO = "#A8B4DE"

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

/* Las fechas cruzan del servidor al cliente como texto ISO: se formatean aquí,
   con la configuración regional del navegador que las va a leer. */
export type FilaDeClienteEnPantalla =
  Omit<FilaDeCliente, "primeraCompra" | "ultimaCompra"> & {
    nombre: string
    primeraCompra: string
    ultimaCompra: string
  }

export type FilaDeInactivoEnPantalla =
  Omit<FilaDeInactivo, "ultimaCita"> & { ultimaCita: string | null }

export type FilaDeDeudaEnPantalla =
  Omit<FilaDeDeuda, "desde"> & { nombre: string; desde: string }

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
  ingresos: {
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
  gastos: {
    consumo: ResumenDeConsumo
    inventario: ResumenDeInventario
  }
  clientes: Omit<ResumenDeClientes, "filas"> & {
    ranking: FilaDeClienteEnPantalla[]
    captacion: ResumenDeCaptacion
    inactivos: Omit<ResumenDeInactivos, "filas"> & { filas: FilaDeInactivoEnPantalla[] }
    deuda: Omit<ResumenDeDeuda, "filas"> & { filas: FilaDeDeudaEnPantalla[] }
    tarjetas: ResumenDeTarjetas
  }
  actividad: {
    empleadas: FilaDeOcupacion[]
    cabinas: FilaDeOcupacion[]
    citas: ResumenDeCitas
    jornadas: FilaDeHoras[]
    minutosCentro: number
    diasAbiertos: number
    /** El año del que se cuenta el cupo de vacaciones. */
    anio: number
    /** Días del período que ya han pasado: sin ellos no hay nada que medir. */
    diasContados: number
  }
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

type GroupId = "ingresos" | "gastos" | "clientes" | "actividad"

interface ReportGroup {
  id: GroupId
  title: string
  description: string
  icon: typeof BarChart3
  reports: ReportDef[]
}

/**
 * El acuerdo con la propietaria de qué informes tenía que haber, y en qué
 * estado está cada uno. Los que están hechos ya se ven en su pestaña, así que
 * de aquí solo se pinta lo que falta: si el catálogo repitiera lo que ya está
 * arriba, la pantalla diría dos veces lo mismo.
 */
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
        availability: "DONE",
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
        availability: "DONE",
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
        availability: "DONE",
      },
      {
        title: "Ticket medio y frecuencia",
        question: "¿Cuánto se deja cada cliente y cada cuánto vuelve?",
        availability: "DONE",
      },
      {
        title: "Clientes inactivos",
        question: "¿Quién lleva meses sin venir y habría que recuperar?",
        availability: "DONE",
      },
      {
        title: "Ranking de clientes",
        question: "¿Quiénes son mis mejores clientes por gasto acumulado?",
        availability: "DONE",
      },
      {
        title: "Deuda pendiente",
        question: "¿Quién debe dinero y desde cuándo?",
        availability: "DONE",
      },
      {
        title: "Tarjetas regalo",
        question: "¿Cuánto saldo he vendido y cuánto está sin consumir?",
        availability: "DONE",
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
        availability: "DONE",
      },
      {
        title: "Cancelaciones y ausencias",
        question: "¿Cuántas citas se caen, cuándo y con qué servicio?",
        availability: "DONE",
      },
      {
        title: "Horas trabajadas y ausencias",
        question: "¿Cuántas horas ha hecho cada empleada y cuántos días libres le quedan?",
        availability: "DONE",
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

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  })
}

/** "hace 3 meses", "hace 2 años": los días sueltos dejan de decir nada pronto. */
function tiempoLargo(dias: number) {
  if (dias < 60) return `${dias} días`
  const meses = Math.round(dias / 30)
  if (meses < 24) return `${meses} meses`
  return `${Math.floor(dias / 365)} años`
}

/* ─── Componente ─────────────────────────────────────────────────────────── */

export function ReportsClient({
  periodo, resumen, variacion, ingresos, gastos, clientes, actividad,
}: ReportsClientProps) {
  const [group, setGroup] = useState<GroupId>("ingresos")
  const activeGroup = GROUPS.find((g) => g.id === group) ?? GROUPS[0]
  const pendientes = activeGroup.reports.filter((r) => r.availability !== "DONE")

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
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Las cifras de cabecera se quedan fuera de las pestañas: son el
              pulso del centro y valen para leer cualquiera de las cuatro. */}
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

          {group === "ingresos" && (
            <PestanaIngresos periodo={periodo} resumen={resumen} datos={ingresos} />
          )}
          {group === "gastos" && (
            <PestanaGastos datos={gastos} facturacionCents={resumen.totalCents} periodo={periodo.etiqueta} />
          )}
          {group === "clientes" && <PestanaClientes datos={clientes} />}
          {group === "actividad" && <PestanaActividad datos={actividad} />}

          {pendientes.length > 0 && (
            <div className="space-y-4 pt-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Pendiente en {activeGroup.title.toLowerCase()}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Lo que falta de esta categoría, y de lo que falta, qué se puede ya y qué no.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {pendientes.map((r) => {
                  const meta = AVAILABILITY_META[r.availability]
                  return (
                    <Card key={r.title}>
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
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Pestaña: ingresos ──────────────────────────────────────────────────── */

function PestanaIngresos({
  periodo, resumen, datos,
}: {
  periodo: ReportsClientProps["periodo"]
  resumen: Totales
  datos: ReportsClientProps["ingresos"]
}) {
  if (resumen.tickets === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          <p className="font-medium text-foreground">No hay ventas en este período.</p>
          <p className="mt-1 text-sm">
            Prueba con otro período, o cobra algo en el mostrador y vuelve.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <FacturacionPorEmpleada
        filas={datos.empleadas}
        totalCents={resumen.totalCents}
        saldoVendidoCents={resumen.saldoVendidoCents}
        periodo={periodo.etiqueta}
      />
      <LoMasVendido servicios={datos.servicios} productos={datos.productos} />
      <IngresosPorFamilia filas={datos.familias} totalCents={resumen.totalCents} />
      <div className="grid gap-4 lg:grid-cols-2">
        <FormasDeCobro filas={datos.cobros} />
        <Descuentos resumen={datos.descuentos} />
      </div>
      <Evolucion meses={datos.evolucion} />
    </div>
  )
}

/* ─── Pestaña: gastos ────────────────────────────────────────────────────── */

function PestanaGastos({
  datos, facturacionCents, periodo,
}: {
  datos: ReportsClientProps["gastos"]
  facturacionCents: number
  periodo: string
}) {
  return (
    <div className="space-y-6">
      <ConsumoInterno resumen={datos.consumo} facturacionCents={facturacionCents} periodo={periodo} />
      <ValorDelInventario resumen={datos.inventario} periodo={periodo} />
    </div>
  )
}

const TOP_INVENTARIO = 15

function ConsumoInterno({
  resumen, facturacionCents, periodo,
}: {
  resumen: ResumenDeConsumo
  facturacionCents: number
  periodo: string
}) {
  const maximo = Math.max(1, ...resumen.filas.map((f) => f.costeCents))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Boxes className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Consumo interno de producto</CardTitle>
            <p className="text-xs text-muted-foreground">
              Lo que se ha gastado en cabina · {periodo}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumen.filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No se ha registrado ningún consumo de cabina en este período. Se apunta desde
            Stock, con el botón de consumo interno de cada producto.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Cifra label="Coste del consumo" valor={fmtEur(resumen.costeCents)}
                pie={`${porcentaje(resumen.costeCents, facturacionCents)} % de la facturación`} />
              <Cifra label="Unidades gastadas" valor={String(resumen.unidades)}
                pie={`${resumen.referencias} ${resumen.referencias === 1 ? "referencia" : "referencias"} distintas`} />
              <Cifra label="Coste medio por unidad"
                valor={fmtEur(resumen.unidades ? Math.round(resumen.costeCents / resumen.unidades) : 0)}
                pie="Sobre el coste actual de tarifa" />
            </div>

            <Table>
              <TableHeader>
                <TableRow className={SIN_HOVER}>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Uds.</TableHead>
                  <TableHead className="text-right">Coste ud.</TableHead>
                  <TableHead className="text-right">Coste</TableHead>
                  <TableHead className="w-48">Peso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.filas.map((f) => (
                  <TableRow key={f.productId} className={SIN_HOVER}>
                    <TableCell className="font-medium">
                      {f.nombre}
                      {f.proveedor && (
                        <span className="block text-[11px] font-normal text-muted-foreground">{f.proveedor}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{f.unidades}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(f.costeUnitarioCents)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.costeCents)}</TableCell>
                    <TableCell>
                      <Barra parte={f.costeCents} maximo={maximo} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {/* Sin esto, el primer recuento que no cuadre con la factura del
            proveedor parece un error de la aplicación. */}
        <p className="text-[11px] text-muted-foreground">
          Se valora al coste que tiene hoy cada producto, porque el movimiento de stock no
          guarda importe: si el proveedor cambia la tarifa, este histórico se recalcula. Lo
          que sale por venta no cuenta aquí, que eso ya está en la facturación.
        </p>
      </CardContent>
    </Card>
  )
}

function ValorDelInventario({ resumen, periodo }: { resumen: ResumenDeInventario; periodo: string }) {
  const maximo = Math.max(1, ...resumen.filas.map((f) => f.valorCents))
  const visibles = resumen.filas.slice(0, TOP_INVENTARIO)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Package className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Valor del inventario</CardTitle>
            <p className="text-xs text-muted-foreground">
              Foto de hoy · la rotación se mide sobre {periodo}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumen.filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay ningún producto con existencias.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cifra label="Valor a coste" valor={fmtEur(resumen.valorCents)}
                pie={`${resumen.unidades} uds. en ${resumen.referencias} referencias`} />
              <Cifra label="Valor a precio de venta" valor={fmtEur(resumen.valorDeVentaCents)}
                pie="Si se vendiera todo lo que hay" />
              <Cifra label="Parado en el período" valor={fmtEur(resumen.paradoCents)}
                pie={`${resumen.paradoReferencias} ${resumen.paradoReferencias === 1 ? "referencia sin una sola salida" : "referencias sin una sola salida"}`}
                alerta={resumen.paradoCents > 0} />
              <Cifra label="Bajo mínimo" valor={String(resumen.bajoMinimo)}
                pie="Referencias en el mínimo o por debajo"
                alerta={resumen.bajoMinimo > 0} />
            </div>

            <Table>
              <TableHeader>
                <TableRow className={SIN_HOVER}>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Coste ud.</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Salidas</TableHead>
                  <TableHead className="w-48">Peso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((f) => (
                  <TableRow key={f.productId} className={SIN_HOVER}>
                    <TableCell className="font-medium">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {f.nombre}
                        {f.parado && (
                          <Badge variant="outline" className="py-0 text-[10px] bg-[#FEF3E2] border-[#F59E0B] text-[#92400E]">
                            Parado
                          </Badge>
                        )}
                        {f.bajoMinimo && (
                          <Badge variant="outline" className="py-0 text-[10px] bg-[#FCE8E6] border-[#EA4335] text-[#B31412]">
                            Bajo mínimo
                          </Badge>
                        )}
                      </span>
                      {f.proveedor && (
                        <span className="block text-[11px] font-normal text-muted-foreground">{f.proveedor}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{f.stock}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(f.costeUnitarioCents)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.valorCents)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{f.salidas}</TableCell>
                    <TableCell>
                      <Barra parte={f.valorCents} maximo={maximo} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {resumen.filas.length > TOP_INVENTARIO && (
              <p className="text-[11px] text-muted-foreground">
                y {resumen.filas.length - TOP_INVENTARIO} referencias más, que suman{" "}
                {fmtEur(resumen.filas.slice(TOP_INVENTARIO).reduce((a, f) => a + f.valorCents, 0))}.
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          El stock es el de ahora mismo, no el que había al empezar el período: de las
          existencias no se guarda histórico. «Salidas» son las unidades vendidas más las
          gastadas en cabina dentro del período, y es lo que dice qué rota y qué no.
        </p>
      </CardContent>
    </Card>
  )
}

/* ─── Pestaña: clientes ──────────────────────────────────────────────────── */

const TOP_CLIENTES = 15

function PestanaClientes({ datos }: { datos: ReportsClientProps["clientes"] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Clientes atendidos" value={String(datos.ranking.length)} icon={Users}
          hint={`${datos.repiten} ${datos.repiten === 1 ? "ha venido" : "han venido"} más de una vez`}
        />
        <SummaryCard
          label="Gasto medio por cliente" value={eurRedondo(datos.gastoMedioCents)} icon={Wallet}
          hint="En todo el período, no por visita"
        />
        <SummaryCard
          label="Cada cuánto vuelven"
          value={datos.frecuenciaMediaDias === null ? "—" : `${datos.frecuenciaMediaDias} días`}
          icon={CalendarClock}
          hint={
            datos.frecuenciaMediaDias === null
              ? "Nadie ha repetido todavía en este período"
              : "Media de quienes han repetido"
          }
        />
        <SummaryCard
          label="Clientes nuevos" value={String(datos.captacion.nuevos.clientes)} icon={UserPlus}
          hint={`${datos.captacion.porcentajeNuevos} % de la facturación con ficha`}
        />
      </div>

      <NuevasVsRecurrentes captacion={datos.captacion} />

      <RankingDeClientes
        filas={datos.ranking}
        sinClienteCents={datos.sinClienteCents}
        sinClienteTickets={datos.sinClienteTickets}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <TarjetasRegalo resumen={datos.tarjetas} />
        <DeudaPendiente resumen={datos.deuda} />
      </div>

      <ClientesInactivos resumen={datos.inactivos} />
    </div>
  )
}

function NuevasVsRecurrentes({ captacion }: { captacion: ResumenDeCaptacion }) {
  const total = captacion.nuevos.totalCents + captacion.recurrentes.totalCents

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Nuevas vs. recurrentes</CardTitle>
        <p className="text-xs text-muted-foreground">
          Es «nuevo» quien compró por primera vez dentro del período, mirando toda su historia
          y no solo este tramo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay ventas con ficha de cliente en este período.</p>
        ) : (
          <>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                style={{ width: `${porcentaje(captacion.nuevos.totalCents, total)}%`, backgroundColor: AZUL }}
                title="Clientes nuevos"
              />
              <div
                style={{ width: `${porcentaje(captacion.recurrentes.totalCents, total)}%`, backgroundColor: AZUL_CLARO }}
                title="Clientes de siempre"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TramoDeCaptacion
                titulo="Clientes nuevos" color={AZUL} icon={UserPlus}
                clientes={captacion.nuevos.clientes}
                tickets={captacion.nuevos.tickets}
                totalCents={captacion.nuevos.totalCents}
                cuota={porcentaje(captacion.nuevos.totalCents, total)}
              />
              <TramoDeCaptacion
                titulo="Clientes de siempre" color={AZUL_CLARO} icon={Users}
                clientes={captacion.recurrentes.clientes}
                tickets={captacion.recurrentes.tickets}
                totalCents={captacion.recurrentes.totalCents}
                cuota={porcentaje(captacion.recurrentes.totalCents, total)}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TramoDeCaptacion({
  titulo, color, icon: Icon, clientes, tickets, totalCents, cuota,
}: {
  titulo: string
  color: string
  icon: typeof Users
  clientes: number
  tickets: number
  totalCents: number
  cuota: number
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">{titulo}</p>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{fmtEur(totalCents)}</p>
      <p className="text-xs text-muted-foreground">
        {cuota} % de la facturación con ficha · {clientes}{" "}
        {clientes === 1 ? "cliente" : "clientes"} · {tickets}{" "}
        {tickets === 1 ? "ticket" : "tickets"}
      </p>
    </div>
  )
}

function RankingDeClientes({
  filas, sinClienteCents, sinClienteTickets,
}: {
  filas: FilaDeClienteEnPantalla[]
  sinClienteCents: number
  sinClienteTickets: number
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.totalCents))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Star className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Ranking de clientes</CardTitle>
            <p className="text-xs text-muted-foreground">
              Quién más deja, cuánto se gasta cada vez y cada cuánto vuelve · los {TOP_CLIENTES} primeros
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Ningún cliente con ficha ha comprado en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Visitas</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Ticket medio</TableHead>
                <TableHead className="text-right">Cada</TableHead>
                <TableHead className="text-right">Última</TableHead>
                <TableHead className="w-40">Peso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.slice(0, TOP_CLIENTES).map((f) => (
                <TableRow key={f.customerId} className={SIN_HOVER}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.tickets}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(f.ticketMedioCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {f.diasEntreVisitas === null ? "—" : `${f.diasEntreVisitas} días`}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{fechaCorta(f.ultimaCompra)}</TableCell>
                  <TableCell>
                    <Barra parte={f.totalCents} maximo={maximo} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {filas.length > TOP_CLIENTES && (
          <p className="text-[11px] text-muted-foreground">
            y {filas.length - TOP_CLIENTES} clientes más, que suman{" "}
            {fmtEur(filas.slice(TOP_CLIENTES).reduce((a, f) => a + f.totalCents, 0))}.
          </p>
        )}

        {/* Se lleva aparte en vez de repartirlo: así se ve cuánto se cobra sin
            saber a quién, que es un dato en sí mismo. */}
        {sinClienteTickets > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Además, {sinClienteTickets} {sinClienteTickets === 1 ? "ticket" : "tickets"} sin ficha
            de cliente por {fmtEur(sinClienteCents)}: son ventas de mostrador y no cuentan en el
            ranking porque no se sabe de quién son.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          «Cada» es la media de días entre visitas dentro del período; con una sola visita no
          hay dos fechas que restar y se deja en blanco.
        </p>
      </CardContent>
    </Card>
  )
}

function TarjetasRegalo({ resumen }: { resumen: ResumenDeTarjetas }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Gift className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Tarjetas regalo</CardTitle>
            <p className="text-xs text-muted-foreground">Saldo vendido, gastado y por gastar</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-bold tabular-nums">{fmtEur(resumen.saldoVivoCents)}</p>
          <p className="text-xs text-muted-foreground">
            sin consumir hoy, repartido entre {resumen.clientesConSaldo}{" "}
            {resumen.clientesConSaldo === 1 ? "cliente" : "clientes"}
          </p>
        </div>

        <Table>
          <TableBody>
            <TableRow className={SIN_HOVER}>
              <TableCell className="font-medium">Vendido en el período</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {resumen.tarjetas} {resumen.tarjetas === 1 ? "tarjeta" : "tarjetas"}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmtEur(resumen.vendidoCents)}</TableCell>
            </TableRow>
            <TableRow className={SIN_HOVER}>
              <TableCell className="font-medium">Gastado en el período</TableCell>
              <TableCell />
              <TableCell className="text-right font-medium tabular-nums">{fmtEur(resumen.consumidoCents)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <p className="text-[11px] text-muted-foreground">
          El saldo sin consumir es dinero ya cobrado por un servicio que todavía no se ha
          dado: está en la caja, pero es un compromiso pendiente y por eso no suma con la
          facturación. El saldo vivo es de siempre, no solo del período.
        </p>
      </CardContent>
    </Card>
  )
}

const TOP_DEUDA = 10

function DeudaPendiente({
  resumen,
}: {
  resumen: ReportsClientProps["clientes"]["deuda"]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <AlertTriangle className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Deuda pendiente</CardTitle>
            <p className="text-xs text-muted-foreground">Todo lo que sigue sin cobrar, sea de cuando sea</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className={cn("text-2xl font-bold tabular-nums", resumen.deudaCents > 0 && "text-[#B31412]")}>
            {fmtEur(resumen.deudaCents)}
          </p>
          <p className="text-xs text-muted-foreground">
            {resumen.tickets} {resumen.tickets === 1 ? "ticket" : "tickets"} de {resumen.clientes}{" "}
            {resumen.clientes === 1 ? "cliente" : "clientes"}
          </p>
        </div>

        {resumen.filas.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No hay nada pendiente de cobro.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Desde</TableHead>
                <TableHead className="text-right">Debe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumen.filas.slice(0, TOP_DEUDA).map((f) => (
                <TableRow key={f.customerId ?? "sin-ficha"} className={SIN_HOVER}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.tickets}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fechaCorta(f.desde)}
                    <span className="block text-[11px]">hace {tiempoLargo(f.diasDesde)}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.deudaCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {resumen.filas.length > TOP_DEUDA && (
          <p className="text-[11px] text-muted-foreground">
            y {resumen.filas.length - TOP_DEUDA} clientes más, que deben{" "}
            {fmtEur(resumen.filas.slice(TOP_DEUDA).reduce((a, f) => a + f.deudaCents, 0))}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const TOP_INACTIVOS = 15

function ClientesInactivos({
  resumen,
}: {
  resumen: ReportsClientProps["clientes"]["inactivos"]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <UserMinus className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Clientes inactivos</CardTitle>
            <p className="text-xs text-muted-foreground">
              Más de {resumen.umbralDias} días sin pasar por la agenda · el umbral se cambia en Configuración
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {resumen.filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Ningún cliente activo lleva más de {resumen.umbralDias} días sin venir.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Cifra label="Clientes perdidos" valor={String(resumen.filas.length)}
                pie={`${resumen.sinNingunaCita} nunca han llegado a venir`} alerta />
              <Cifra label="Lo que dejaban" valor={fmtEur(resumen.gastoPerdidoCents)}
                pie="Gasto acumulado de toda su historia" />
              <Cifra label="Umbral" valor={`${resumen.umbralDias} días`} pie="El mismo que avisa en Clientes" />
            </div>

            <Table>
              <TableHeader>
                <TableRow className={SIN_HOVER}>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-right">Última cita</TableHead>
                  <TableHead className="text-right">Sin venir</TableHead>
                  <TableHead className="text-right">Ha dejado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.filas.slice(0, TOP_INACTIVOS).map((f) => (
                  <TableRow key={f.id} className={SIN_HOVER}>
                    <TableCell className="font-medium">{f.nombre}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{f.telefono ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {f.ultimaCita ? fechaCorta(f.ultimaCita) : "Nunca ha venido"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {tiempoLargo(f.diasSinVenir)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.gastoHistoricoCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {resumen.filas.length > TOP_INACTIVOS && (
              <p className="text-[11px] text-muted-foreground">
                y {resumen.filas.length - TOP_INACTIVOS} clientes más.
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          Ordenados por lo que dejaban y no por el tiempo que llevan fuera: de una lista
          larga interesa llamar primero a quien más gastaba. Quien ya tiene una cita futura
          no sale, aunque hace meses que no aparezca. Las fichas desactivadas tampoco.
        </p>
      </CardContent>
    </Card>
  )
}

/* ─── Pestaña: actividad ─────────────────────────────────────────────────── */

function PestanaActividad({ datos }: { datos: ReportsClientProps["actividad"] }) {
  if (datos.diasContados === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Este período todavía no ha empezado.</p>
          <p className="mt-1 text-sm">
            La actividad se cuenta sobre días que ya han pasado. Prueba con otro período.
          </p>
        </CardContent>
      </Card>
    )
  }

  const { citas } = datos

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Horas de apertura" value={horasLegibles(datos.minutosCentro)} icon={DoorOpen}
          hint={`${datos.diasAbiertos} ${datos.diasAbiertos === 1 ? "día abierto" : "días abiertos"}`}
        />
        <SummaryCard
          label="Citas del período" value={String(citas.total)} icon={CalendarClock}
          hint={`${citas.realizadas} realizadas · ${citas.abiertas} sin cerrar`}
        />
        <SummaryCard
          label="Citas caídas" value={`${citas.porcentajeCaida} %`} icon={AlertTriangle}
          hint={`${citas.canceladas} canceladas · ${citas.noAsistio} sin avisar`}
        />
        <SummaryCard
          label="Agenda perdida" value={horasLegibles(citas.minutosPerdidos)} icon={Clock}
          hint="Horas reservadas a las que no vino nadie"
        />
      </div>

      <Ocupacion
        titulo="Ocupación por empleada"
        pie="Cuánto de su horario ha tenido la agenda llena. Mide carga de trabajo."
        filas={datos.empleadas}
        vacio="Ninguna empleada tenía horario ni citas en este período."
      />

      <Ocupacion
        titulo="Ocupación por cabina"
        pie="Sobre las horas que el centro ha estado abierto. Dice si hacen falta más puestos, no cómo trabaja nadie: las cabinas son puestos calientes."
        filas={datos.cabinas}
        vacio="No hay cabinas activas."
      />

      <CancelacionesYAusencias resumen={citas} />

      <HorasTrabajadas filas={datos.jornadas} anio={datos.anio} />
    </div>
  )
}

function Ocupacion({
  titulo, pie, filas, vacio,
}: {
  titulo: string
  pie: string
  filas: FilaDeOcupacion[]
  vacio: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">{pie}</p>
      </CardHeader>
      <CardContent>
        {filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Citas</TableHead>
                <TableHead className="text-right">Ocupado</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="w-56">Ocupación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id} className={SIN_HOVER}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.citas}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{horasLegibles(f.minutosOcupados)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {f.minutosDisponibles > 0 ? horasLegibles(f.minutosDisponibles) : "Sin horario"}
                  </TableCell>
                  <TableCell>
                    {f.minutosDisponibles === 0 ? (
                      // Sin horario no hay porcentaje que enseñar: una barra al
                      // 0 % diría que estuvo de brazos cruzados, y lo que pasa
                      // es que no tenía que estar.
                      <span className="text-[11px] text-muted-foreground">
                        Atendió sin tener horario asignado
                      </span>
                    ) : (
                      <>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.min(100, f.porcentaje)}%`,
                              backgroundColor: f.porcentaje >= 85 ? "#B31412" : AZUL,
                            }}
                          />
                        </div>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {f.porcentaje} % de su horario
                        </span>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

const TOP_CAIDAS = 10

function CancelacionesYAusencias({ resumen }: { resumen: ResumenDeCitas }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Cancelaciones y ausencias</CardTitle>
        <p className="text-xs text-muted-foreground">
          La cancelada avisa y deja el hueco libre; el «no asistió» se come la hora. Van
          separadas porque no son el mismo problema.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumen.total === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay citas en este período.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Cifra label="Realizadas" valor={String(resumen.realizadas)}
                pie={`${porcentaje(resumen.realizadas, resumen.total)} % de las citas`} />
              <Cifra label="Canceladas" valor={String(resumen.canceladas)}
                pie={`${porcentaje(resumen.canceladas, resumen.total)} % de las citas`} />
              <Cifra label="No asistió" valor={String(resumen.noAsistio)}
                pie={`${porcentaje(resumen.noAsistio, resumen.total)} % de las citas`}
                alerta={resumen.noAsistio > 0} />
              <Cifra label="Sin cerrar" valor={String(resumen.abiertas)}
                pie="Ni marcadas como hechas ni caídas" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <TablaDeCaidas
                titulo="Por servicio"
                filas={resumen.porServicio.slice(0, TOP_CAIDAS)}
                columna="Servicio"
              />
              <TablaDeCaidas
                titulo="Por día de la semana"
                filas={resumen.porDiaDeSemana}
                columna="Día"
              />
            </div>
          </>
        )}

        {/* El número es un suelo y hay que decirlo, o se lee como si fuera el
            recuento cerrado de las ausencias del mes. */}
        <p className="text-[11px] text-muted-foreground">
          El «no asistió» solo existe si alguien lo marca en la agenda. Lo que nadie marca se
          queda en «sin cerrar», así que las ausencias reales son estas o más, nunca menos.
        </p>
      </CardContent>
    </Card>
  )
}

function TablaDeCaidas({
  titulo, filas, columna,
}: {
  titulo: string
  filas: ResumenDeCitas["porServicio"]
  columna: string
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Nada que contar.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <TableHead>{columna}</TableHead>
              <TableHead className="text-right">Citas</TableHead>
              <TableHead className="text-right">Canc.</TableHead>
              <TableHead className="text-right">No vino</TableHead>
              <TableHead className="w-16 text-right">% caída</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.nombre} className={SIN_HOVER}>
                <TableCell className="font-medium">{f.nombre}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{f.total}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{f.canceladas}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{f.noAsistio}</TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", f.porcentaje >= 20 && "text-[#B31412]")}>
                  {f.porcentaje} %
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function HorasTrabajadas({ filas, anio }: { filas: FilaDeHoras[]; anio: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Clock className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Horas trabajadas y ausencias</CardTitle>
            <p className="text-xs text-muted-foreground">
              Horario efectivo del período · el saldo de días libres es del año {anio}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Ninguna empleada tenía horario ni ausencias en este período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Empleada</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="text-right">Vacaciones</TableHead>
                <TableHead className="text-right">Asuntos</TableHead>
                <TableHead className="text-right">Otras</TableHead>
                <TableHead className="w-40">Le quedan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.workerId} className={SIN_HOVER}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{horasLegibles(f.minutos)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.diasTrabajados}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.vacaciones}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.asuntosPropios}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.otrasAusencias}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {f.vacacionesRestantes === null ? (
                      "Sin cupo asignado"
                    ) : (
                      <>
                        <span className="block">{f.vacacionesRestantes} días de vacaciones</span>
                        <span className="block">{f.asuntosRestantes} de asuntos propios</span>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <p className="text-[11px] text-muted-foreground">
          Las horas son las de su horario, no las que tuvo citas: el centro paga la jornada
          entera con la agenda llena o vacía. Lo llena que estuvo es la tarjeta de ocupación.
          Las bajas y las ausencias justificadas van en «otras» y no descuentan cupo.
        </p>
      </CardContent>
    </Card>
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
                        style={{ width: `${(w.servicesCents / maximo) * 100}%`, backgroundColor: AZUL }}
                        title="Servicios"
                      />
                      <div
                        style={{ width: `${(w.productsCents / maximo) * 100}%`, backgroundColor: AZUL_CLARO }}
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
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: AZUL }} /> Servicios
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: AZUL_CLARO }} /> Producto
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
                  <Barra parte={f.totalCents} maximo={maximo} />
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

function Descuentos({ resumen }: { resumen: ReportsClientProps["ingresos"]["descuentos"] }) {
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

/**
 * La altura de la zona de barras, en píxeles.
 *
 * Va en su propia caja de altura fija y no en la columna entera con los rótulos
 * dentro. Cuando la barra compartía caja con las etiquetas, todo lo que pasaba
 * del alto disponible se encogía hasta el mismo tope, y los meses buenos salían
 * todos exactamente igual de altos: la gráfica dejaba de enseñar nada.
 */
const ALTO_DE_BARRAS = 160

function Evolucion({ meses }: { meses: MesDeEvolucion[] }) {
  const maximo = Math.max(1, ...meses.map((m) => m.cents))
  const conVentas = meses.filter((m) => m.cents > 0)
  const media = conVentas.length
    ? conVentas.reduce((a, m) => a + m.cents, 0) / conVentas.length
    : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Evolución de la facturación</CardTitle>
        <p className="text-xs text-muted-foreground">
          Últimos {meses.length} meses, hasta el final del período elegido
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3">
          {meses.map((m, i) => {
            const anterior = i > 0 ? meses[i - 1].cents : 0
            const delta = anterior > 0 ? Math.round(((m.cents - anterior) / anterior) * 100) : null
            return (
              <div key={m.clave} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[11px] font-medium tabular-nums">{eurRedondo(m.cents)}</span>
                <div
                  className="relative flex w-full items-end"
                  style={{ height: ALTO_DE_BARRAS }}
                >
                  {/* La media del período: sin una referencia, unas barras que
                      se parecen entre sí no dicen si el mes va bien o mal. */}
                  {media > 0 && (
                    <div
                      className="absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
                      style={{ bottom: `${(media / maximo) * 100}%` }}
                    />
                  )}
                  <div
                    className="relative w-full rounded-t-md"
                    style={{
                      // El eje arranca en cero y no en el mínimo del tramo:
                      // recortarlo haría parecer un desplome lo que es una
                      // bajada del 3 %.
                      height: m.cents > 0 ? `${Math.max(2, (m.cents / maximo) * 100)}%` : 0,
                      backgroundColor: m.cents >= media ? AZUL : AZUL_CLARO,
                    }}
                    title={`${m.clave} · ${eurRedondo(m.cents)}`}
                  />
                </div>
                <span className="text-xs capitalize text-muted-foreground">{m.etiqueta}</span>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    delta === null ? "text-muted-foreground/60"
                      : delta > 0 ? "text-[#1E6B34]"
                        : delta < 0 ? "text-[#B31412]"
                          : "text-muted-foreground",
                  )}
                >
                  {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta} %`}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: AZUL }} /> Por encima de la media
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: AZUL_CLARO }} /> Por debajo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-muted-foreground/60" />
            Media de los meses con ventas: {eurRedondo(Math.round(media))}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground">
          El porcentaje de debajo de cada mes es lo que sube o baja respecto al mes anterior.
          Las barras se miden desde cero: es lo honesto, aunque haga que meses parecidos se
          vean parecidos, y para eso está la línea de la media.
        </p>
      </CardContent>
    </Card>
  )
}

/* ─── Piezas sueltas ─────────────────────────────────────────────────────── */

/** Barra de peso relativo dentro de una celda de tabla. */
function Barra({ parte, maximo }: { parte: number; maximo: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full"
        style={{ width: `${Math.min(100, (parte / maximo) * 100)}%`, backgroundColor: AZUL }}
      />
    </div>
  )
}

/** Un dato suelto dentro de una tarjeta, sin marco propio. */
function Cifra({
  label, valor, pie, alerta = false,
}: {
  label: string
  valor: string
  pie: string
  alerta?: boolean
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", alerta && "text-[#B31412]")}>{valor}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{pie}</p>
    </div>
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

"use client"

/**
 * MOCKUP de la sección de Informes.
 *
 * Todavía no consulta la base de datos: sirve para acordar con la propietaria
 * qué informes quiere y cómo se navegan antes de implementarlos. Los números
 * son inventados y están marcados como tales en pantalla.
 *
 * Cada informe del catálogo lleva un estado de disponibilidad de datos:
 *   READY   → se puede calcular hoy con lo que ya guardamos.
 *   PARTIAL → se puede aproximar, pero falta algún dato para que sea exacto.
 *   BLOCKED → hace falta guardar información nueva antes de poder hacerlo.
 */

import { useState } from "react"
import {
  BarChart3,
  Users,
  Package,
  Wallet,
  CalendarClock,
  TrendingUp,
  Info,
  Star,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

/* ─── Datos de ejemplo ───────────────────────────────────────────────────── */

const PERIODS = [
  { id: "month", label: "Este mes" },
  { id: "prev", label: "Mes pasado" },
  { id: "quarter", label: "Trimestre" },
  { id: "year", label: "Año" },
  { id: "custom", label: "Personalizado" },
] as const

// Las empleadas son las del seed de demo (prisma/seed.ts): si se inventan
// nombres, al enseñar el mockup parece que hay gente que no existe.
const SAMPLE_WORKERS = [
  { name: "Lucía Martínez", servicesCents: 412_000, productsCents: 86_500,  tickets: 74 },
  { name: "Marta Sánchez",  servicesCents: 355_500, productsCents: 41_200,  tickets: 68 },
  { name: "Lola Romero",    servicesCents: 268_000, productsCents: 112_300, tickets: 55 },
]

// Meses anteriores. El mes en curso se añade en el componente a partir del
// total de las empleadas, para que las dos gráficas no se contradigan.
const SAMPLE_PREVIOUS_MONTHS = [
  { label: "Mar", cents: 780_000 },
  { label: "Abr", cents: 845_000 },
  { label: "May", cents: 912_000 },
  { label: "Jun", cents: 1_034_000 },
  { label: "Jul", cents: 1_140_000 },
]

type Availability = "READY" | "PARTIAL" | "BLOCKED"

const AVAILABILITY_META: Record<Availability, { label: string; className: string }> = {
  READY:   { label: "Con los datos actuales", className: "bg-[#E6F4EA] border-[#34A853] text-[#1E6B34]" },
  PARTIAL: { label: "Aproximado",             className: "bg-[#FEF3E2] border-[#F59E0B] text-[#92400E]" },
  BLOCKED: { label: "Falta guardar el dato",  className: "bg-[#FCE8E6] border-[#EA4335] text-[#B31412]" },
}

interface ReportDef {
  title: string
  question: string
  availability: Availability
  note?: string
  featured?: boolean
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
        availability: "BLOCKED",
        note: "El TPV pide la profesional en las líneas de servicio, pero al cobrar se descarta. Falta guardarla, y pedirla también en producto y tarjeta regalo.",
        featured: true,
      },
      {
        title: "Evolución de la facturación",
        question: "¿Vamos mejor o peor que el mes/año pasado?",
        availability: "READY",
      },
      {
        title: "Ingresos por servicio y familia",
        question: "¿Qué tratamientos sostienen el centro y cuáles no compensan?",
        availability: "READY",
      },
      {
        title: "Ventas de producto",
        question: "¿Qué productos se venden, cuántas unidades y con qué margen?",
        availability: "READY",
        note: "El margen sale de precio − coste actual del producto; si cambia el coste, el histórico se recalcula.",
      },
      {
        title: "Formas de cobro",
        question: "¿Cuánto entra en efectivo, tarjeta, saldo de tarjeta regalo o queda a deber?",
        availability: "READY",
      },
      {
        title: "Descuentos aplicados",
        question: "¿Cuánto dejamos de ingresar en descuentos y quién los hace?",
        availability: "READY",
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

function fmtEur(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
}

/* ─── Componente ─────────────────────────────────────────────────────────── */

export function ReportsClient() {
  const [period, setPeriod] = useState<string>("month")
  const [group, setGroup] = useState<string>("ingresos")

  const totalServices = SAMPLE_WORKERS.reduce((s, w) => s + w.servicesCents, 0)
  const totalProducts = SAMPLE_WORKERS.reduce((s, w) => s + w.productsCents, 0)
  const totalTickets = SAMPLE_WORKERS.reduce((s, w) => s + w.tickets, 0)
  const total = totalServices + totalProducts
  const maxWorkerTotal = Math.max(...SAMPLE_WORKERS.map((w) => w.servicesCents + w.productsCents))

  const months = [...SAMPLE_PREVIOUS_MONTHS, { label: "Ago", cents: total }]
  const maxMonth = Math.max(...months.map((m) => m.cents))
  const prevMonth = SAMPLE_PREVIOUS_MONTHS[SAMPLE_PREVIOUS_MONTHS.length - 1].cents
  const growth = Math.round(((total - prevMonth) / prevMonth) * 100)

  const activeGroup = GROUPS.find((g) => g.id === group) ?? GROUPS[0]

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
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
        <Badge variant="outline" className="border-[#F59E0B] bg-[#FEF3E2] px-3 py-1 text-sm text-[#92400E]">
          Mockup · datos de ejemplo
        </Badge>
      </div>

      {/* Selector de período (decorativo en el mockup) */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-6 py-3">
        <span className="text-sm text-muted-foreground">Período</span>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                period === p.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">1 – 31 de agosto de 2026</span>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Resumen */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Facturación" value={fmtEur(total)} hint={`${growth > 0 ? "+" : ""}${growth} % vs. mes pasado`} icon={TrendingUp} />
            <SummaryCard label="Servicios" value={fmtEur(totalServices)} hint={`${Math.round((totalServices / total) * 100)} % del total`} icon={CalendarClock} />
            <SummaryCard label="Producto" value={fmtEur(totalProducts)} hint={`${Math.round((totalProducts / total) * 100)} % del total`} icon={Package} />
            <SummaryCard label="Ticket medio" value={fmtEur(Math.round(total / totalTickets))} hint={`${totalTickets} tickets`} icon={Wallet} />
          </div>

          {/* Informe destacado: facturación por empleada */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-accent p-2">
                  <Star className="h-4 w-4 text-accent-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium">Facturación por empleada</CardTitle>
                  <p className="text-xs text-muted-foreground">Servicios y venta de producto, del 1 al 31 de agosto</p>
                </div>
              </div>
              <Badge variant="outline" className={cn("text-xs", AVAILABILITY_META.BLOCKED.className)}>
                {AVAILABILITY_META.BLOCKED.label}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleada</TableHead>
                    <TableHead className="text-right">Servicios</TableHead>
                    <TableHead className="text-right">Producto</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead className="w-56">Peso sobre el total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SAMPLE_WORKERS.map((w) => {
                    const wTotal = w.servicesCents + w.productsCents
                    return (
                      <TableRow key={w.name}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(w.servicesCents)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(w.productsCents)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmtEur(wTotal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{w.tickets}</TableCell>
                        <TableCell>
                          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="bg-[#3C54A4]"
                              style={{ width: `${(w.servicesCents / maxWorkerTotal) * 100}%` }}
                              title="Servicios"
                            />
                            <div
                              className="bg-[#A8B4DE]"
                              style={{ width: `${(w.productsCents / maxWorkerTotal) * 100}%` }}
                              title="Producto"
                            />
                          </div>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {Math.round((wTotal / total) * 100)} % de la facturación
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

              <div className="flex gap-3 rounded-lg border border-[#F59E0B]/40 bg-[#FEF3E2] p-3 text-sm text-[#92400E]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Para que estos números sean reales hay que guardar la empleada en cada línea de venta.
                  El TPV ya la pide al añadir un servicio, pero ahora mismo el dato se pierde al cobrar.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Evolución mensual */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Evolución de la facturación</CardTitle>
              <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
            </CardHeader>
            <CardContent>
              <div className="flex h-44 items-end gap-4">
                {months.map((m) => (
                  <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-[11px] tabular-nums text-muted-foreground">{fmtEur(m.cents)}</span>
                    <div
                      className="w-full rounded-t-md bg-[#3C54A4]/85"
                      style={{ height: `${(m.cents / maxMonth) * 100}%` }}
                    />
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Catálogo de informes propuestos */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Informes propuestos</h2>
              <p className="text-sm text-muted-foreground">
                Cada bloque sería una pantalla dentro de Informes, con el mismo selector de período arriba.
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
                  <Card key={r.title} className={cn(r.featured && "border-primary/40")}>
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

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
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

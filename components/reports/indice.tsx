"use client"

/**
 * El índice de informes.
 *
 * Esta pantalla contesta una sola pregunta —«¿cómo va el centro?»— con las
 * cuatro cifras de cabecera, y para todo lo demás manda a su informe. Antes
 * era un pantallón con pestañas que cargaba los catorce informes para enseñar
 * uno, y debajo un catálogo de lo que faltaba por hacer: la lista de deberes
 * de quien lo construía, no algo que le sirviera a quien lleva el centro.
 *
 * Cada tarjeta lleva la pregunta que contesta su informe, que es como se busca
 * al entrar aquí: no se viene a por «ingresos por familia», se viene a por
 * «qué familias sostienen el centro».
 */

import Link from "next/link"
import {
  AlertTriangle, BarChart3, Boxes, CalendarClock, ChevronRight, Clock, Gift,
  Package, Star, TrendingUp, UserMinus, Users, Wallet,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  SelectorDePeriodo, SummaryCard, enlaceDePeriodo, eurRedondo, porcentaje,
  type PeriodoEnPantalla,
} from "@/components/reports/shared"
import type { Totales } from "@/lib/reports"

type Informe = {
  href: string
  titulo: string
  pregunta: string
  icon: typeof BarChart3
}

type Seccion = {
  titulo: string
  descripcion: string
  informes: Informe[]
}

/**
 * El acuerdo con la propietaria de qué informes tenía que haber, convertido en
 * el mapa de la pantalla. Cada uno se llama y se pregunta aquí igual que en su
 * propia cabecera, para que abrir una tarjeta lleve a algo reconocible.
 */
const SECCIONES: Seccion[] = [
  {
    titulo: "Ingresos",
    descripcion: "Qué entra en el centro, de quién viene y por qué concepto.",
    informes: [
      {
        href: "/reports/empleadas",
        titulo: "Facturación por empleada",
        pregunta: "¿Cuánto factura cada una en servicios y cuánto en producto?",
        icon: Star,
      },
      {
        href: "/reports/familias",
        titulo: "Ingresos por familia",
        pregunta: "¿Qué familias sostienen el centro y con qué servicios lo hacen?",
        icon: Boxes,
      },
      {
        href: "/reports/cobros",
        titulo: "Cobros y descuentos",
        pregunta: "¿Cómo se cobra, y cuánto se deja de ingresar en descuentos?",
        icon: Wallet,
      },
      {
        href: "/reports/evolucion",
        titulo: "Evolución de la facturación",
        pregunta: "¿Vamos mejor o peor que el mes o el año pasado?",
        icon: TrendingUp,
      },
    ],
  },
  {
    titulo: "Gastos",
    descripcion: "Qué sale, y cuánto dinero hay parado en la estantería.",
    informes: [
      {
        href: "/reports/gastos",
        titulo: "Gastos de producto",
        pregunta: "¿Cuánto producto se gasta en cabina y cuánto vale el inventario?",
        icon: Package,
      },
    ],
  },
  {
    titulo: "Clientes",
    descripcion: "Quién sostiene el centro, quién se ha ido y quién debe dinero.",
    informes: [
      {
        href: "/reports/clientes",
        titulo: "Cartera de clientes",
        pregunta: "¿Quién sostiene el centro y cuánto viene de clientas nuevas?",
        icon: Users,
      },
      {
        href: "/reports/inactivos",
        titulo: "Clientes inactivos",
        pregunta: "¿A quién hace tiempo que no vemos y merece la pena recuperar?",
        icon: UserMinus,
      },
      {
        href: "/reports/deuda",
        titulo: "Deuda pendiente",
        pregunta: "¿Quién debe dinero, cuánto y desde cuándo?",
        icon: AlertTriangle,
      },
      {
        href: "/reports/saldo",
        titulo: "Tarjetas regalo y saldo",
        pregunta: "¿Cuánto saldo he vendido y cuánto está sin consumir?",
        icon: Gift,
      },
    ],
  },
  {
    titulo: "Actividad del centro",
    descripcion: "Cómo se está usando la agenda, las cabinas y las horas de trabajo.",
    informes: [
      {
        href: "/reports/ocupacion",
        titulo: "Ocupación de la agenda",
        pregunta: "¿Qué porcentaje de las horas disponibles se llena, y cuántas citas se caen?",
        icon: CalendarClock,
      },
      {
        href: "/reports/jornadas",
        titulo: "Horas trabajadas y ausencias",
        pregunta: "¿Cuántas horas ha hecho cada empleada y cuántos días libres le quedan?",
        icon: Clock,
      },
    ],
  },
]

export function IndiceDeInformes({ periodo, resumen, variacion }: {
  periodo: PeriodoEnPantalla
  resumen: Totales
  /** Porcentaje contra el tramo anterior, o null si antes no había nada. */
  variacion: number | null
}) {
  const query = enlaceDePeriodo(periodo)

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="border-b bg-card px-6 pb-4 pt-5">
        <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
        <p className="text-muted-foreground">
          Las cifras del período y, debajo, cada informe con la pregunta que contesta.
        </p>
      </div>

      <SelectorDePeriodo periodo={periodo} />

      <div className="p-6">
        <div className="mx-auto max-w-[1400px] space-y-8">
          {/* Las cifras de cabecera se quedan fuera de los informes: son el
              pulso del centro y valen para leer cualquiera de ellos. */}
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

          {SECCIONES.map((s) => (
            <div key={s.titulo}>
              <h2 className="text-lg font-semibold tracking-tight">{s.titulo}</h2>
              <p className="mb-3 text-sm text-muted-foreground">{s.descripcion}</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {s.informes.map((i) => (
                  // El período viaja en el enlace: se elige aquí una vez y se
                  // entra a cualquier informe con él ya puesto.
                  <Link key={i.href} href={`${i.href}?${query}`} className="block">
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/40">
                      <CardContent className="flex h-full items-start gap-3 p-5">
                        <div className="rounded-lg bg-accent p-2">
                          <i.icon className="h-4 w-4 text-accent-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{i.titulo}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{i.pregunta}</p>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

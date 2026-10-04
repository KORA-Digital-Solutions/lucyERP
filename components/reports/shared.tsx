"use client"

/**
 * Lo que comparten todos los informes.
 *
 * Cada informe vive en su propia pantalla —una pregunta, una pantalla— y esto
 * es lo que se repite en todas: la cabecera con el período, las tarjetas de
 * cifra y los dos o tres formatos que tienen que decir lo mismo en todas
 * partes. Antes todo esto vivía dentro de una sola pantalla de dos mil líneas
 * que cargaba los catorce informes para enseñar uno.
 */

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PERIODOS, aValorDeInput,
  type FilaDeCliente, type FilaDeDeuda, type FilaDeInactivo, type PeriodoId,
} from "@/lib/reports"
import { cn } from "@/lib/utils"

/**
 * En estas pantallas casi ninguna fila se pincha, así que ninguna se ilumina al
 * pasar por encima: el resalte del ratón promete que algo va a pasar. Es lo que
 * trae `TableRow` de serie y hay que quitarlo a mano.
 */
export const SIN_HOVER = "hover:bg-transparent"

/** Azul de la casa, y su versión clara para la segunda serie de las barras. */
export const AZUL = "#3C54A4"
export const AZUL_CLARO = "#A8B4DE"

/* Las fechas cruzan del servidor al cliente como texto ISO: se formatean aquí,
   con la configuración regional del navegador que las va a leer. */
export type PeriodoEnPantalla = {
  id: PeriodoId
  etiqueta: string
  etiquetaAnterior: string
  desde: string
  hasta: string
}

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

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Sin céntimos: en las tarjetas de cabecera estorban más de lo que informan. */
export function eurRedondo(cents: number) {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  })
}

export function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}

export function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  })
}

/** "hace 3 meses", "hace 2 años": los días sueltos dejan de decir nada pronto. */
export function tiempoLargo(dias: number) {
  if (dias < 60) return `${dias} días`
  const meses = Math.round(dias / 30)
  if (meses < 24) return `${meses} meses`
  return `${Math.floor(dias / 365)} años`
}

/* ─── Cabecera de un informe ─────────────────────────────────────────────── */

/**
 * El marco de cualquier informe: de dónde vienes, qué estás leyendo y de qué
 * período. El título y la pregunta son los mismos con los que se anuncia en el
 * índice, para que abrir una tarjeta lleve a algo que se llama igual.
 */
export function InformeShell({
  titulo, pregunta, periodo, children,
}: {
  titulo: string
  pregunta: string
  periodo: PeriodoEnPantalla
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="border-b bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-5">
          <div className="min-w-0">
            {/* Se vuelve al índice con el mismo período puesto: si se pierde
                por el camino, cada salto de un informe a otro reinicia a "este
                mes" y hay que volver a elegirlo. */}
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 gap-1.5 text-muted-foreground">
              <Link href={`/reports?${enlaceDePeriodo(periodo)}`}>
                <ArrowLeft className="h-4 w-4" /> Informes
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
            <p className="text-muted-foreground">{pregunta}</p>
          </div>
        </div>
      </div>
      <SelectorDePeriodo periodo={periodo} />
      <div className="p-6">
        <div className="mx-auto max-w-[1400px] space-y-6">{children}</div>
      </div>
    </div>
  )
}

/**
 * El período tal cual viaja en la URL. El personalizado necesita además sus dos
 * fechas: sin ellas la pantalla de destino caería en «este mes» y el enlace
 * llevaría a un período distinto del que se está mirando.
 *
 * Por el día local y no por los diez primeros caracteres del ISO: el ISO va en
 * UTC y en España el 1 de septiembre a las 00:00 es el 31 de agosto a las
 * 22:00Z, así que cortarlo a pelo corre el período un día hacia atrás.
 */
export function enlaceDePeriodo(periodo: PeriodoEnPantalla): string {
  if (periodo.id !== "personalizado") return `periodo=${periodo.id}`
  const desde = aValorDeInput(new Date(periodo.desde))
  const hasta = aValorDeInput(new Date(periodo.hasta))
  return `periodo=personalizado&desde=${desde}&hasta=${hasta}`
}

/* ─── Selector de período ────────────────────────────────────────────────── */

export function SelectorDePeriodo({ periodo }: { periodo: PeriodoEnPantalla }) {
  const router = useRouter()
  // El período no cambia de informe: se queda en el que se está leyendo.
  const aqui = usePathname()
  // El filtro de origen del informe de clientes sobrevive al cambio de período.
  const origen = useSearchParams().get("origen")
  const filtro = origen ? `&origen=${encodeURIComponent(origen)}` : ""
  // Por el día local, no por los diez primeros caracteres del ISO: el ISO va
  // en UTC y en España el 1 de septiembre a las 00:00 es el 31 de agosto a las
  // 22:00Z. Las casillas salían con un día de menos y cada "Aplicar" corría el
  // período otro día hacia atrás.
  const [desde, setDesde] = useState(aValorDeInput(new Date(periodo.desde)))
  const [hasta, setHasta] = useState(aValorDeInput(new Date(periodo.hasta)))
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
                  ? `${aqui}?periodo=personalizado&desde=${desde}&hasta=${hasta}${filtro}`
                  : `${aqui}?periodo=${p.id}${filtro}`
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
            onClick={() => router.push(`${aqui}?periodo=personalizado&desde=${desde}&hasta=${hasta}${filtro}`)}
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  )
}

/* ─── Piezas sueltas ─────────────────────────────────────────────────────── */

/** Barra de peso relativo dentro de una celda de tabla. */
export function Barra({ parte, maximo }: { parte: number; maximo: number }) {
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
export function Cifra({
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

export function SummaryCard({
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

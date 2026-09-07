"use client"

/**
 * La facturación mes a mes: si vamos mejor o peor que antes.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MesDeEvolucion } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  AZUL, AZUL_CLARO, InformeShell, eurRedondo,
  type PeriodoEnPantalla,
} from "@/components/reports/shared"

export function InformeDeEvolucion({ periodo, meses }: {
  periodo: PeriodoEnPantalla
  meses: MesDeEvolucion[]
}) {
  return (
    <InformeShell
      titulo="Evolución de la facturación"
      pregunta="¿Vamos mejor o peor que el mes o el año pasado?"
      periodo={periodo}
    >
      <Evolucion meses={meses} />
    </InformeShell>
  )
}

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

"use client"

/**
 * Cómo se está usando la agenda: cuánto se llena y cuánto se cae.
 */

import { AlertTriangle, CalendarClock, Clock, DoorOpen } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import { horasLegibles, type FilaDeCaida, type FilaDeOcupacion, type ResumenDeCitas } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  AZUL, SIN_HOVER, Cifra, InformeShell, SummaryCard, porcentaje,
  type PeriodoEnPantalla,
} from "@/components/reports/shared"

export function InformeDeOcupacion({
  periodo, empleadas, cabinas, citas, minutosCentro, diasAbiertos, diasContados,
}: {
  periodo: PeriodoEnPantalla
  empleadas: FilaDeOcupacion[]
  cabinas: FilaDeOcupacion[]
  citas: ResumenDeCitas
  minutosCentro: number
  diasAbiertos: number
  diasContados: number
}) {
  if (diasContados === 0) {
    return (
      <InformeShell
        titulo="Ocupación de la agenda"
        pregunta="¿Qué porcentaje de las horas disponibles se llena?"
        periodo={periodo}
      >
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Este período todavía no ha empezado.</p>
            <p className="mt-1 text-sm">No hay días vividos que medir.</p>
          </CardContent>
        </Card>
      </InformeShell>
    )
  }

  return (
    <InformeShell
      titulo="Ocupación de la agenda"
      pregunta="¿Qué porcentaje de las horas disponibles se llena, y cuántas citas se caen?"
      periodo={periodo}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Horas de apertura" value={horasLegibles(minutosCentro)} icon={DoorOpen}
          hint={`${diasAbiertos} ${diasAbiertos === 1 ? "día abierto" : "días abiertos"}`}
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
        filas={empleadas}
        vacio="Ninguna empleada tenía horario ni citas en este período."
      />

      <Ocupacion
        titulo="Ocupación por cabina"
        pie="Sobre las horas que el centro ha estado abierto. Dice si hacen falta más puestos, no cómo trabaja nadie: las cabinas son puestos calientes."
        filas={cabinas}
        vacio="No hay cabinas activas."
      />

      <CancelacionesYAusencias resumen={citas} />
    </InformeShell>
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

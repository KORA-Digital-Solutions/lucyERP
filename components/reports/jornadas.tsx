"use client"

/**
 * Las horas que ha hecho cada empleada y los días libres que le quedan.
 */

import { Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { SortableTableHead, byNumber, byText, useTableSort } from "@/components/sortable-table-head"
import { horasLegibles, type FilaDeHoras } from "@/lib/reports"
import { cn } from "@/lib/utils"
import { SIN_HOVER, InformeShell, type PeriodoEnPantalla } from "@/components/reports/shared"

export function InformeDeJornadas({ periodo, filas, anio }: {
  periodo: PeriodoEnPantalla
  filas: FilaDeHoras[]
  anio: number
}) {
  return (
    <InformeShell
      titulo="Horas trabajadas y ausencias"
      pregunta="¿Cuántas horas ha hecho cada empleada y cuántos días libres le quedan?"
      periodo={periodo}
    >
      <HorasTrabajadas filas={filas} anio={anio} />
    </InformeShell>
  )
}

const HORAS_SORTERS = {
  empleada: byText<FilaDeHoras>((f) => f.nombre),
  horas: byNumber<FilaDeHoras>((f) => f.minutos),
  dias: byNumber<FilaDeHoras>((f) => f.diasTrabajados),
  vacaciones: byNumber<FilaDeHoras>((f) => f.vacaciones),
  asuntos: byNumber<FilaDeHoras>((f) => f.asuntosPropios),
  otras: byNumber<FilaDeHoras>((f) => f.otrasAusencias),
  // Sin cupo asignado (null) cae siempre al final.
  quedan: byNumber<FilaDeHoras>((f) => f.vacacionesRestantes),
}

type HorasSortKey = keyof typeof HORAS_SORTERS

function HorasTrabajadas({ filas, anio }: { filas: FilaDeHoras[]; anio: number }) {
  const { sort, sorted, toggleSort } = useTableSort<FilaDeHoras, HorasSortKey>(filas, HORAS_SORTERS)

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
                <SortableTableHead sortKey="empleada" sort={sort} onToggle={toggleSort}>Empleada</SortableTableHead>
                <SortableTableHead sortKey="horas" sort={sort} onToggle={toggleSort} className="text-right">Horas</SortableTableHead>
                <SortableTableHead sortKey="dias" sort={sort} onToggle={toggleSort} className="text-right">Días</SortableTableHead>
                <SortableTableHead sortKey="vacaciones" sort={sort} onToggle={toggleSort} className="text-right">Vacaciones</SortableTableHead>
                <SortableTableHead sortKey="asuntos" sort={sort} onToggle={toggleSort} className="text-right">Asuntos</SortableTableHead>
                <SortableTableHead sortKey="otras" sort={sort} onToggle={toggleSort} className="text-right">Otras</SortableTableHead>
                <SortableTableHead sortKey="quedan" sort={sort} onToggle={toggleSort} className="w-40">Le quedan</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((f) => (
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

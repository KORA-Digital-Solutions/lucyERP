"use client"

/**
 * Lo que está sin cobrar, y desde cuándo.
 */

import { useMemo } from "react"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { SortableTableHead, byDate, byNumber, byText, useTableSort } from "@/components/sortable-table-head"
import { fmtEur } from "@/components/client-profile-view"
import type { ResumenDeDeuda } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  SIN_HOVER, Cifra, InformeShell, fechaCorta, tiempoLargo,
  type FilaDeDeudaEnPantalla, type PeriodoEnPantalla,
} from "@/components/reports/shared"

export type DeudaEnPantalla = Omit<ResumenDeDeuda, "filas"> & { filas: FilaDeDeudaEnPantalla[] }

export function InformeDeDeuda({ periodo, deuda }: {
  periodo: PeriodoEnPantalla
  deuda: DeudaEnPantalla
}) {
  return (
    <InformeShell
      titulo="Deuda pendiente"
      pregunta="¿Quién debe dinero, cuánto y desde cuándo?"
      periodo={periodo}
    >
      <DeudaPendiente resumen={deuda} />
    </InformeShell>
  )
}

const TOP_DEUDA = 10

const DEUDA_SORTERS = {
  cliente: byText<FilaDeDeudaEnPantalla>((f) => f.nombre),
  tickets: byNumber<FilaDeDeudaEnPantalla>((f) => f.tickets),
  desde: byDate<FilaDeDeudaEnPantalla>((f) => f.desde),
  debe: byNumber<FilaDeDeudaEnPantalla>((f) => f.deudaCents),
}

function DeudaPendiente({ resumen }: { resumen: DeudaEnPantalla }) {
  // Se ordena solo lo que se enseña: los {TOP_DEUDA} que más deben siguen siendo
  // esos aunque se reordene la tabla.
  const top = useMemo(() => resumen.filas.slice(0, TOP_DEUDA), [resumen.filas])
  const { sort, sorted, toggleSort } = useTableSort(top, DEUDA_SORTERS)

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
                <SortableTableHead sortKey="cliente" sort={sort} onToggle={toggleSort}>Cliente</SortableTableHead>
                <SortableTableHead sortKey="tickets" sort={sort} onToggle={toggleSort} className="text-right">Tickets</SortableTableHead>
                <SortableTableHead sortKey="desde" sort={sort} onToggle={toggleSort} className="text-right">Desde</SortableTableHead>
                <SortableTableHead sortKey="debe" sort={sort} onToggle={toggleSort} className="text-right">Debe</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((f) => (
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

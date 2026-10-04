"use client"

/**
 * Facturación por empleada, y qué ha hecho cada una.
 *
 * Las dos preguntas van en la misma pantalla porque son la misma conversación:
 * se mira quién factura cuánto y, en cuanto una fila llama la atención, se
 * quiere ver de qué está hecha. El detalle estuvo un tiempo en un diálogo
 * encima del informe y era peor de lo que parece: tapaba la tabla justo cuando
 * hacía falta compararla, y para pasar de una empleada a otra había que
 * cerrarlo y volver a abrirlo. Aquí se cambia de una a otra pulsando su fila,
 * que se queda marcada.
 */

import { useState } from "react"
import { ChevronRight, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { SortableTableHead, byNumber, byText, useTableSort } from "@/components/sortable-table-head"
import { fmtEur } from "@/components/client-profile-view"
import { WorkerReportView } from "@/components/worker-report-view"
import { aValorDeInput } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  AZUL, AZUL_CLARO, SIN_HOVER, InformeShell, porcentaje,
  type FilaDeEmpleadaConNombre, type PeriodoEnPantalla,
} from "@/components/reports/shared"

const EMPLEADA_SORTERS = {
  empleada: byText<FilaDeEmpleadaConNombre>((f) => f.nombre),
  servicios: byNumber<FilaDeEmpleadaConNombre>((f) => f.servicesCents),
  producto: byNumber<FilaDeEmpleadaConNombre>((f) => f.productsCents),
  total: byNumber<FilaDeEmpleadaConNombre>((f) => f.totalCents),
  tickets: byNumber<FilaDeEmpleadaConNombre>((f) => f.tickets),
  peso: byNumber<FilaDeEmpleadaConNombre>((f) => f.totalCents),
}

export function InformeDeEmpleadas({
  periodo, filas, totalCents, saldoVendidoCents, bonosVendidosCents,
}: {
  periodo: PeriodoEnPantalla
  filas: FilaDeEmpleadaConNombre[]
  totalCents: number
  saldoVendidoCents: number
  bonosVendidosCents: number
}) {
  const [elegida, setElegida] = useState<string | null>(null)
  const empleada = filas.find((f) => f.workerId !== null && f.workerId === elegida) ?? null

  return (
    <InformeShell
      titulo="Facturación por empleada"
      pregunta="¿Cuánto factura cada una en servicios y cuánto en producto?"
      periodo={periodo}
    >
      {filas.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">No hay ventas en este período.</p>
            <p className="mt-1 text-sm">Prueba con otro período.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <FacturacionPorEmpleada
            filas={filas}
            totalCents={totalCents}
            saldoVendidoCents={saldoVendidoCents}
            bonosVendidosCents={bonosVendidosCents}
            periodo={periodo.etiqueta}
            elegida={elegida}
            onElegir={(id) => setElegida((prev) => (prev === id ? null : id))}
          />

          {empleada?.workerId && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: empleada.color }}
                  />
                  <div>
                    <CardTitle className="text-base font-medium">
                      Actividad de {empleada.nombre}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Servicios realizados y productos vendidos, línea a línea. Empieza acotado
                      a {periodo.etiqueta}, pero los filtros llegan a todo su histórico.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* La key remonta el informe al cambiar de empleada o de
                    período: los filtros de dentro arrancan del período y no
                    deben heredarse de la anterior. */}
                <WorkerReportView
                  key={`${empleada.workerId}:${periodo.desde}:${periodo.hasta}`}
                  workerId={empleada.workerId}
                  desdeInicial={aValorDeInput(new Date(periodo.desde))}
                  hastaInicial={aValorDeInput(new Date(periodo.hasta))}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </InformeShell>
  )
}

/* ─── La tabla ───────────────────────────────────────────────────────────── */

function FacturacionPorEmpleada({
  filas, totalCents, saldoVendidoCents, bonosVendidosCents, periodo, elegida, onElegir,
}: {
  filas: FilaDeEmpleadaConNombre[]
  totalCents: number
  saldoVendidoCents: number
  bonosVendidosCents: number
  periodo: string
  elegida: string | null
  onElegir: (workerId: string) => void
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.totalCents))
  const { sort, sorted, toggleSort } = useTableSort(filas, EMPLEADA_SORTERS)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Star className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Facturación por empleada</CardTitle>
            <p className="text-xs text-muted-foreground">
              Servicios y venta de producto · {periodo} · pulsa una fila para ver qué ha hecho
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <SortableTableHead sortKey="empleada" sort={sort} onToggle={toggleSort}>Empleada</SortableTableHead>
              <SortableTableHead sortKey="servicios" sort={sort} onToggle={toggleSort} className="text-right">Servicios</SortableTableHead>
              <SortableTableHead sortKey="producto" sort={sort} onToggle={toggleSort} className="text-right">Producto</SortableTableHead>
              <SortableTableHead sortKey="total" sort={sort} onToggle={toggleSort} className="text-right">Total</SortableTableHead>
              <SortableTableHead sortKey="tickets" sort={sort} onToggle={toggleSort} className="text-right">Tickets</SortableTableHead>
              <SortableTableHead sortKey="peso" sort={sort} onToggle={toggleSort} className="w-56">Peso sobre el total</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((w) => {
              // La fila de "Sin asignar" no es de nadie: no hay informe que
              // abrir y no se ilumina al pasar por encima.
              const conDetalle = w.workerId !== null
              return (
                <TableRow
                  key={w.workerId ?? "sin-asignar"}
                  className={cn(
                    conDetalle ? "cursor-pointer" : SIN_HOVER,
                    // Se distingue del paso del ratón a propósito: si se
                    // parecieran, no se sabría cuál está abierta.
                    elegida !== null && elegida === w.workerId && "bg-primary/10 ring-1 ring-inset ring-primary/30",
                  )}
                  onClick={conDetalle && w.workerId ? () => onElegir(w.workerId!) : undefined}
                >
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
                      {conDetalle && (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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

        {bonosVendidosCents > 0 && (
          <p className="text-xs text-muted-foreground">
            Los bonos tampoco: se pagan de una vez y se consumen a lo largo de meses. En este
            período se vendieron {fmtEur(bonosVendidosCents)} en bonos.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

"use client"

/**
 * Lo que sale: lo que se gasta en cabina y lo que hay parado en la estantería.
 */

import { useMemo } from "react"
import { Boxes, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import { SortableTableHead, byNumber, byText, useTableSort } from "@/components/sortable-table-head"
import type { FilaDeConsumo, FilaDeInventario, ResumenDeConsumo, ResumenDeInventario } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  AZUL, SIN_HOVER, Barra, Cifra, InformeShell, porcentaje,
  type PeriodoEnPantalla,
} from "@/components/reports/shared"

export function InformeDeGastos({ periodo, consumo, inventario, facturacionCents }: {
  periodo: PeriodoEnPantalla
  consumo: ResumenDeConsumo
  inventario: ResumenDeInventario
  facturacionCents: number
}) {
  return (
    <InformeShell
      titulo="Gastos de producto"
      pregunta="¿Cuánto producto se gasta en cabina y cuánto dinero hay parado en la estantería?"
      periodo={periodo}
    >
      <ConsumoInterno resumen={consumo} facturacionCents={facturacionCents} periodo={periodo.etiqueta} />
      <ValorDelInventario resumen={inventario} periodo={periodo.etiqueta} />
    </InformeShell>
  )
}

const TOP_INVENTARIO = 15

const CONSUMO_SORTERS = {
  producto: byText<FilaDeConsumo>((f) => f.nombre),
  unidades: byNumber<FilaDeConsumo>((f) => f.unidades),
  costeUnitario: byNumber<FilaDeConsumo>((f) => f.costeUnitarioCents),
  coste: byNumber<FilaDeConsumo>((f) => f.costeCents),
  peso: byNumber<FilaDeConsumo>((f) => f.costeCents),
}

type ConsumoSortKey = keyof typeof CONSUMO_SORTERS

const INVENTARIO_SORTERS = {
  producto: byText<FilaDeInventario>((f) => f.nombre),
  stock: byNumber<FilaDeInventario>((f) => f.stock),
  costeUnitario: byNumber<FilaDeInventario>((f) => f.costeUnitarioCents),
  valor: byNumber<FilaDeInventario>((f) => f.valorCents),
  salidas: byNumber<FilaDeInventario>((f) => f.salidas),
  peso: byNumber<FilaDeInventario>((f) => f.valorCents),
}

type InventarioSortKey = keyof typeof INVENTARIO_SORTERS

function ConsumoInterno({
  resumen, facturacionCents, periodo,
}: {
  resumen: ResumenDeConsumo
  facturacionCents: number
  periodo: string
}) {
  const { sort, sorted, toggleSort } = useTableSort<FilaDeConsumo, ConsumoSortKey>(resumen.filas, CONSUMO_SORTERS)
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
                  <SortableTableHead sortKey="producto" sort={sort} onToggle={toggleSort}>Producto</SortableTableHead>
                  <SortableTableHead sortKey="unidades" sort={sort} onToggle={toggleSort} className="text-right">Uds.</SortableTableHead>
                  <SortableTableHead sortKey="costeUnitario" sort={sort} onToggle={toggleSort} className="text-right">Coste ud.</SortableTableHead>
                  <SortableTableHead sortKey="coste" sort={sort} onToggle={toggleSort} className="text-right">Coste</SortableTableHead>
                  <SortableTableHead sortKey="peso" sort={sort} onToggle={toggleSort} className="w-48">Peso</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((f) => (
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
  // Se ordena solo el top que se enseña: reordenar la lista entera metería en
  // pantalla referencias que no están entre las de más valor.
  const visibles = useMemo(() => resumen.filas.slice(0, TOP_INVENTARIO), [resumen.filas])
  const { sort, sorted, toggleSort } = useTableSort<FilaDeInventario, InventarioSortKey>(visibles, INVENTARIO_SORTERS)

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
                  <SortableTableHead sortKey="producto" sort={sort} onToggle={toggleSort}>Producto</SortableTableHead>
                  <SortableTableHead sortKey="stock" sort={sort} onToggle={toggleSort} className="text-right">Stock</SortableTableHead>
                  <SortableTableHead sortKey="costeUnitario" sort={sort} onToggle={toggleSort} className="text-right">Coste ud.</SortableTableHead>
                  <SortableTableHead sortKey="valor" sort={sort} onToggle={toggleSort} className="text-right">Valor</SortableTableHead>
                  <SortableTableHead sortKey="salidas" sort={sort} onToggle={toggleSort} className="text-right">Salidas</SortableTableHead>
                  <SortableTableHead sortKey="peso" sort={sort} onToggle={toggleSort} className="w-48">Peso</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((f) => (
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

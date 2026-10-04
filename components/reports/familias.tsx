"use client"

/**
 * Ingresos por familia, y qué hay dentro de cada una.
 *
 * La pregunta es doble y por eso van juntas en una pantalla: qué familias
 * sostienen el centro, y —una vez elegida una— con qué servicios o productos
 * lo hacen. Antes eran dos tarjetas separadas en el pantallón de informes y no
 * había forma de bajar de la familia al concepto.
 *
 * El producto entra como una familia más, "Tto. domiciliario", que es como se
 * ha clasificado siempre en los listados del centro.
 */

import { useState } from "react"
import { Boxes } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import { SortableTableHead, byNumber, byText, useTableSort } from "@/components/sortable-table-head"
import { HOME_CARE_FAMILY } from "@/lib/enums"
import type { FilaDeConcepto, FilaDeFamilia } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  AZUL, SIN_HOVER, Barra, InformeShell, porcentaje,
  type PeriodoEnPantalla,
} from "@/components/reports/shared"

export function InformeDeFamilias({
  periodo, familias, servicios, productos, totalCents,
}: {
  periodo: PeriodoEnPantalla
  familias: FilaDeFamilia[]
  servicios: FilaDeConcepto[]
  productos: FilaDeConcepto[]
  totalCents: number
}) {
  // La familia abierta. Ninguna al entrar: primero se lee el reparto entero y
  // después se baja a la que llame la atención.
  const [familia, setFamilia] = useState<string | null>(null)

  // Los conceptos de la familia elegida. El producto no tiene familia propia
  // en el catálogo —va todo a tratamiento domiciliario—, así que se resuelve
  // por el tipo de línea y no por el grupo del concepto.
  const conceptos = familia === null ? []
    : familia === HOME_CARE_FAMILY ? productos
      : servicios.filter((s) => s.grupo === familia)

  return (
    <InformeShell
      titulo="Ingresos por familia"
      pregunta="¿Qué familias sostienen el centro y con qué servicios lo hacen?"
      periodo={periodo}
    >
      {familias.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">No hay ventas en este período.</p>
            <p className="mt-1 text-sm">Prueba con otro período.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <IngresosPorFamilia
            filas={familias}
            totalCents={totalCents}
            seleccionada={familia}
            onSeleccionar={(f) => setFamilia((prev) => (prev === f ? null : f))}
          />
          {familia !== null && (
            <DentroDeLaFamilia familia={familia} conceptos={conceptos} />
          )}
        </>
      )}
    </InformeShell>
  )
}

/* ─── Lo que hay dentro de una familia ───────────────────────────────────── */

const CONCEPTO_SORTERS = {
  concepto: byText<FilaDeConcepto>((c) => c.nombre),
  veces: byNumber<FilaDeConcepto>((c) => c.unidades),
  importe: byNumber<FilaDeConcepto>((c) => c.totalCents),
  peso: byNumber<FilaDeConcepto>((c) => c.totalCents),
}

type ConceptoSortKey = keyof typeof CONCEPTO_SORTERS

function DentroDeLaFamilia({ familia, conceptos }: { familia: string; conceptos: FilaDeConcepto[] }) {
  const { sort, sorted, toggleSort } = useTableSort<FilaDeConcepto, ConceptoSortKey>(conceptos, CONCEPTO_SORTERS)
  const unidades = conceptos.reduce((a, c) => a + c.unidades, 0)
  const totalCents = conceptos.reduce((a, c) => a + c.totalCents, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Boxes className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">{familia}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {conceptos.length} {conceptos.length === 1 ? "concepto" : "conceptos"} ·{" "}
              {unidades} {unidades === 1 ? "venta" : "ventas"} · {fmtEur(totalCents)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <SortableTableHead sortKey="concepto" sort={sort} onToggle={toggleSort}>Concepto</SortableTableHead>
              <SortableTableHead sortKey="veces" sort={sort} onToggle={toggleSort} className="text-right">Veces</SortableTableHead>
              <SortableTableHead sortKey="importe" sort={sort} onToggle={toggleSort} className="text-right">Importe</SortableTableHead>
              <SortableTableHead sortKey="peso" sort={sort} onToggle={toggleSort} className="w-48">Peso en la familia</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => (
              <TableRow key={c.id} className={SIN_HOVER}>
                <TableCell className="font-medium">{c.nombre}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{c.unidades}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtEur(c.totalCents)}</TableCell>
                <TableCell>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full" style={{
                      width: `${porcentaje(c.totalCents, totalCents)}%`, backgroundColor: AZUL,
                    }} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {conceptos.length === 0 && (
              <TableRow className={SIN_HOVER}>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  Nada vendido de esta familia en el período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/* ─── Ingresos por familia ───────────────────────────────────────────────── */

const FAMILIA_SORTERS = {
  familia: byText<FilaDeFamilia>((f) => f.nombre),
  unidades: byNumber<FilaDeFamilia>((f) => f.unidades),
  importe: byNumber<FilaDeFamilia>((f) => f.totalCents),
  peso: byNumber<FilaDeFamilia>((f) => f.totalCents),
}

type FamiliaSortKey = keyof typeof FAMILIA_SORTERS

function IngresosPorFamilia({ filas, totalCents, seleccionada, onSeleccionar }: {
  filas: FilaDeFamilia[]
  totalCents: number
  seleccionada: string | null
  onSeleccionar: (familia: string) => void
}) {
  const { sort, sorted, toggleSort } = useTableSort<FilaDeFamilia, FamiliaSortKey>(filas, FAMILIA_SORTERS)
  const maximo = Math.max(1, ...filas.map((f) => f.totalCents))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Ingresos por familia</CardTitle>
        <p className="text-xs text-muted-foreground">
          Qué sostiene el centro. Los productos van como una familia más, «Tto. domiciliario»,
          que es como se listan en la casa. Pulsa una familia para ver con qué se ha hecho.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <SortableTableHead sortKey="familia" sort={sort} onToggle={toggleSort}>Familia</SortableTableHead>
              <SortableTableHead sortKey="unidades" sort={sort} onToggle={toggleSort} className="text-right">Uds.</SortableTableHead>
              <SortableTableHead sortKey="importe" sort={sort} onToggle={toggleSort} className="text-right">Importe</SortableTableHead>
              <SortableTableHead sortKey="peso" sort={sort} onToggle={toggleSort} className="w-56">Peso</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((f) => (
              <TableRow
                key={f.nombre}
                className={cn(
                  "cursor-pointer",
                  // El resalte tiene que distinguirse del paso del ratón, que
                  // ya pinta la fila de gris claro: si se parecen, no se sabe
                  // cuál está abierta cuando el ratón está en otra.
                  seleccionada === f.nombre && "bg-primary/10 ring-1 ring-inset ring-primary/30",
                )}
                onClick={() => onSeleccionar(f.nombre)}
              >
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
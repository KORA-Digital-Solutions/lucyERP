"use client"

/**
 * Cómo entra el dinero y cuánto se deja de ingresar por el camino.
 *
 * Las dos van juntas porque se leen a la vez: cuánto ha entrado en efectivo,
 * en tarjeta o con saldo, y cuánto de lo que se facturó se fue en descuentos y
 * quién los hizo.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import { ETIQUETA_DE_COBRO, type FilaDeCobro, type ResumenDeDescuentos } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  AZUL, SIN_HOVER, Barra, Cifra, InformeShell, porcentaje,
  type PeriodoEnPantalla,
} from "@/components/reports/shared"

/** El descuento con el nombre de quien lo hizo, resuelto en el servidor. */
export type DescuentosConNombre = Omit<ResumenDeDescuentos, "filas"> & {
  filas: (ResumenDeDescuentos["filas"][number] & { nombre: string })[]
}

export function InformeDeCobros({ periodo, cobros, descuentos }: {
  periodo: PeriodoEnPantalla
  cobros: FilaDeCobro[]
  descuentos: DescuentosConNombre
}) {
  return (
    <InformeShell
      titulo="Cobros y descuentos"
      pregunta="¿Cómo se cobra, y cuánto se deja de ingresar en descuentos?"
      periodo={periodo}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <FormasDeCobro filas={cobros} />
        <Descuentos resumen={descuentos} />
      </div>
    </InformeShell>
  )
}

/* ─── Formas de cobro ────────────────────────────────────────────────────── */

function FormasDeCobro({ filas }: { filas: FilaDeCobro[] }) {
  const total = filas.reduce((a, f) => a + f.totalCents, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Formas de cobro</CardTitle>
        <p className="text-xs text-muted-foreground">Por dónde ha entrado el dinero, ticket a ticket</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow className={SIN_HOVER}>
              <TableHead>Vía</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="w-16 text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.metodo} className={SIN_HOVER}>
                <TableCell className={cn("font-medium", f.metodo === "DEBT" && "text-[#B31412]")}>
                  {f.etiqueta}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{f.ventas}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.totalCents)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {porcentaje(f.totalCents, total)} %
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {/* Sin esto, la primera pregunta al ver la tarjeta es por qué no cuadra
            con la facturación de arriba. */}
        <p className="text-[11px] text-muted-foreground">
          Aquí va el ticket entero, tarjetas regalo incluidas, así que el total no coincide con
          la facturación: son dos preguntas distintas. Y «queda a deber» todavía no ha entrado.
        </p>
      </CardContent>
    </Card>
  )
}

/* ─── Descuentos ─────────────────────────────────────────────────────────── */

function Descuentos({ resumen }: { resumen: DescuentosConNombre }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Descuentos aplicados</CardTitle>
        <p className="text-xs text-muted-foreground">
          Lo que se ha dejado de ingresar, repartido por quien cobró el ticket
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-2xl font-bold tabular-nums">{fmtEur(resumen.descuentoCents)}</p>
            <p className="text-xs text-muted-foreground">
              {resumen.porcentaje} % sobre {fmtEur(resumen.brutoCents)} a precio de tarifa
            </p>
          </div>
        </div>

        {resumen.filas.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Ningún descuento en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Quien cobra</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Descuento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumen.filas.map((f) => (
                <TableRow key={f.userId ?? "sin-asignar"} className={SIN_HOVER}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.lineas}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.descuentoCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

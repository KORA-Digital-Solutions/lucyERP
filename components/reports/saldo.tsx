"use client"

/**
 * El saldo que hay vendido y sin consumir: dinero cobrado que aún se debe en
 * servicios.
 */

import { Gift } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import type { ResumenDeTarjetas } from "@/lib/reports"
import { cn } from "@/lib/utils"
import { SIN_HOVER, Cifra, InformeShell, type PeriodoEnPantalla } from "@/components/reports/shared"

export function InformeDeSaldo({ periodo, tarjetas }: {
  periodo: PeriodoEnPantalla
  tarjetas: ResumenDeTarjetas
}) {
  return (
    <InformeShell
      titulo="Tarjetas regalo y saldo"
      pregunta="¿Cuánto saldo he vendido y cuánto está sin consumir?"
      periodo={periodo}
    >
      <TarjetasRegalo resumen={tarjetas} />
    </InformeShell>
  )
}

function TarjetasRegalo({ resumen }: { resumen: ResumenDeTarjetas }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Gift className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Tarjetas regalo</CardTitle>
            <p className="text-xs text-muted-foreground">Saldo vendido, gastado y por gastar</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-bold tabular-nums">{fmtEur(resumen.saldoVivoCents)}</p>
          <p className="text-xs text-muted-foreground">
            sin consumir hoy, repartido entre {resumen.clientesConSaldo}{" "}
            {resumen.clientesConSaldo === 1 ? "cliente" : "clientes"}
          </p>
        </div>

        <Table>
          <TableBody>
            <TableRow className={SIN_HOVER}>
              <TableCell className="font-medium">Vendido en el período</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {resumen.tarjetas} {resumen.tarjetas === 1 ? "tarjeta" : "tarjetas"}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmtEur(resumen.vendidoCents)}</TableCell>
            </TableRow>
            <TableRow className={SIN_HOVER}>
              <TableCell className="font-medium">Gastado en el período</TableCell>
              <TableCell />
              <TableCell className="text-right font-medium tabular-nums">{fmtEur(resumen.consumidoCents)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <p className="text-[11px] text-muted-foreground">
          El saldo sin consumir es dinero ya cobrado por un servicio que todavía no se ha
          dado: está en la caja, pero es un compromiso pendiente y por eso no suma con la
          facturación. El saldo vivo es de siempre, no solo del período.
        </p>
      </CardContent>
    </Card>
  )
}

"use client"

/**
 * A quién hace tiempo que no se ve, para poder llamarla.
 */

import { UserMinus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import type { ResumenDeInactivos } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  SIN_HOVER, Cifra, InformeShell, fechaCorta, tiempoLargo,
  type FilaDeInactivoEnPantalla, type PeriodoEnPantalla,
} from "@/components/reports/shared"

export type InactivosEnPantalla = Omit<ResumenDeInactivos, "filas"> & { filas: FilaDeInactivoEnPantalla[] }

export function InformeDeInactivos({ periodo, inactivos }: {
  periodo: PeriodoEnPantalla
  inactivos: InactivosEnPantalla
}) {
  return (
    <InformeShell
      titulo="Clientes inactivos"
      pregunta="¿A quién hace tiempo que no vemos y merece la pena recuperar?"
      periodo={periodo}
    >
      <ClientesInactivos resumen={inactivos} />
    </InformeShell>
  )
}

const TOP_INACTIVOS = 15

function ClientesInactivos({ resumen }: { resumen: InactivosEnPantalla }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <UserMinus className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Clientes inactivos</CardTitle>
            <p className="text-xs text-muted-foreground">
              Más de {resumen.umbralDias} días sin pasar por la agenda · el umbral se cambia en Configuración
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {resumen.filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Ningún cliente activo lleva más de {resumen.umbralDias} días sin venir.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Cifra label="Clientes perdidos" valor={String(resumen.filas.length)}
                pie={`${resumen.sinNingunaCita} nunca han llegado a venir`} alerta />
              <Cifra label="Lo que dejaban" valor={fmtEur(resumen.gastoPerdidoCents)}
                pie="Gasto acumulado de toda su historia" />
              <Cifra label="Umbral" valor={`${resumen.umbralDias} días`} pie="El mismo que avisa en Clientes" />
            </div>

            <Table>
              <TableHeader>
                <TableRow className={SIN_HOVER}>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-right">Última cita</TableHead>
                  <TableHead className="text-right">Sin venir</TableHead>
                  <TableHead className="text-right">Ha dejado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.filas.slice(0, TOP_INACTIVOS).map((f) => (
                  <TableRow key={f.id} className={SIN_HOVER}>
                    <TableCell className="font-medium">{f.nombre}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{f.telefono ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {f.ultimaCita ? fechaCorta(f.ultimaCita) : "Nunca ha venido"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {tiempoLargo(f.diasSinVenir)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.gastoHistoricoCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {resumen.filas.length > TOP_INACTIVOS && (
              <p className="text-[11px] text-muted-foreground">
                y {resumen.filas.length - TOP_INACTIVOS} clientes más.
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          Ordenados por lo que dejaban y no por el tiempo que llevan fuera: de una lista
          larga interesa llamar primero a quien más gastaba. Quien ya tiene una cita futura
          no sale, aunque hace meses que no aparezca. Las fichas desactivadas tampoco.
        </p>
      </CardContent>
    </Card>
  )
}

"use client"

/**
 * La cartera: quién sostiene el centro y de dónde sale el negocio del período.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Megaphone, Star, UserPlus, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtEur } from "@/components/client-profile-view"
import { REFERRAL_SOURCE, REFERRAL_SOURCE_META, type ReferralSource } from "@/lib/enums"
import { SIN_ORIGEN, type FilaDeOrigen, type ResumenDeCaptacion, type ResumenDeClientes } from "@/lib/reports"
import { cn } from "@/lib/utils"
import {
  AZUL, AZUL_CLARO, SIN_HOVER, Barra, Cifra, InformeShell, enlaceDePeriodo, fechaCorta, porcentaje,
  type FilaDeClienteEnPantalla, type PeriodoEnPantalla,
} from "@/components/reports/shared"

const TOP_CLIENTES = 15

/** «Sin especificar» es SIN_ORIGEN: la ficha no dice cómo nos conoció. */
function etiquetaDeOrigen(origen: string): string {
  if (origen === SIN_ORIGEN) return "Sin especificar"
  return REFERRAL_SOURCE_META[origen as ReferralSource]?.label ?? origen
}

export function InformeDeClientes({ periodo, resumen, ranking, captacion, origen, desglose }: {
  periodo: PeriodoEnPantalla
  resumen: Omit<ResumenDeClientes, "filas">
  ranking: FilaDeClienteEnPantalla[]
  captacion: ResumenDeCaptacion
  /** El filtro puesto: una clave de REFERRAL_SOURCE, SIN_ORIGEN o ninguno. */
  origen: string | null
  /** De dónde vienen las clientas nuevas, con todos los orígenes. */
  desglose: FilaDeOrigen[]
}) {
  return (
    <InformeShell
      titulo="Cartera de clientes"
      pregunta="¿Quién sostiene el centro y cuánto viene de clientas nuevas?"
      periodo={periodo}
    >
      <FiltroDeOrigen periodo={periodo} origen={origen} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          label="Gasto medio"
          valor={fmtEur(resumen.gastoMedioCents)}
          pie="por cliente en el período"
        />
        <Cifra
          label="Repiten"
          valor={`${resumen.repiten}`}
          pie="clientes con más de un ticket"
        />
        <Cifra
          label="Frecuencia media"
          valor={resumen.frecuenciaMediaDias ? `${resumen.frecuenciaMediaDias} días` : "—"}
          pie="entre visita y visita"
        />
        {/* Un ticket sin ficha no tiene origen: con el filtro puesto no entra. */}
        {!origen && (
          <Cifra
            label="Sin ficha"
            valor={fmtEur(resumen.sinClienteCents)}
            pie={`${resumen.sinClienteTickets} tickets sin cliente`}
          />
        )}
      </div>
      <NuevasVsRecurrentes captacion={captacion} />
      <OrigenDeLasNuevas periodo={periodo} origen={origen} filas={desglose} />
      <RankingDeClientes
        filas={ranking}
        sinClienteCents={resumen.sinClienteCents}
        sinClienteTickets={resumen.sinClienteTickets}
      />
    </InformeShell>
  )
}

/* ─── Cómo nos ha conocido ───────────────────────────────────────────────── */

function enlaceDeOrigen(periodo: PeriodoEnPantalla, origen: string | null): string {
  return `/reports/clientes?${enlaceDePeriodo(periodo)}${origen ? `&origen=${origen}` : ""}`
}

/** Recorta el informe a las clientas que nos conocieron de una forma concreta. */
function FiltroDeOrigen({ periodo, origen }: { periodo: PeriodoEnPantalla; origen: string | null }) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="origen" className="text-muted-foreground">Cómo nos ha conocido</label>
      <select
        id="origen"
        value={origen ?? ""}
        onChange={(e) => router.push(enlaceDeOrigen(periodo, e.target.value || null))}
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        <option value="">Todas</option>
        {(Object.keys(REFERRAL_SOURCE) as ReferralSource[]).map((k) => (
          <option key={k} value={k}>{REFERRAL_SOURCE_META[k].label}</option>
        ))}
        <option value={SIN_ORIGEN}>Sin especificar</option>
      </select>
      {origen && (
        <span className="text-xs text-muted-foreground">
          Solo clientas de este origen. El desglose de abajo sigue enseñándolos todos.
        </span>
      )}
    </div>
  )
}

function OrigenDeLasNuevas({ periodo, origen, filas }: {
  periodo: PeriodoEnPantalla
  origen: string | null
  filas: FilaDeOrigen[]
}) {
  const totalClientes = filas.reduce((n, f) => n + f.clientes, 0)
  const maximo = Math.max(1, ...filas.map((f) => f.clientes))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Megaphone className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">De dónde vienen las clientas nuevas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Según lo que dice su ficha en «Cómo nos ha conocido». Pulsa un origen para ver
              solo esas clientas en todo el informe.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay clientas nuevas con compras en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Clientas</TableHead>
                <TableHead className="text-right">% de las nuevas</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
                <TableHead className="w-40">Peso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.origen} className={cn(SIN_HOVER, f.origen === origen && "bg-muted/50")}>
                  <TableCell className="font-medium">
                    <Link
                      href={enlaceDeOrigen(periodo, f.origen === origen ? null : f.origen)}
                      className="hover:underline"
                    >
                      {etiquetaDeOrigen(f.origen)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.clientes}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {porcentaje(f.clientes, totalClientes)} %
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.tickets}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.totalCents)}</TableCell>
                  <TableCell><Barra parte={f.clientes} maximo={maximo} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {filas.some((f) => f.origen === SIN_ORIGEN) && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            «Sin especificar» son fichas a las que nadie preguntó cómo nos conocieron: cuanto
            menos pese, más fiable es este desglose.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/* ─── Nuevas vs recurrentes ──────────────────────────────────────────────── */

function NuevasVsRecurrentes({ captacion }: { captacion: ResumenDeCaptacion }) {
  const total = captacion.nuevos.totalCents + captacion.recurrentes.totalCents

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Nuevas vs. recurrentes</CardTitle>
        <p className="text-xs text-muted-foreground">
          Es «nuevo» quien compró por primera vez dentro del período, mirando toda su historia
          y no solo este tramo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay ventas con ficha de cliente en este período.</p>
        ) : (
          <>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                style={{ width: `${porcentaje(captacion.nuevos.totalCents, total)}%`, backgroundColor: AZUL }}
                title="Clientes nuevos"
              />
              <div
                style={{ width: `${porcentaje(captacion.recurrentes.totalCents, total)}%`, backgroundColor: AZUL_CLARO }}
                title="Clientes de siempre"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TramoDeCaptacion
                titulo="Clientes nuevos" color={AZUL} icon={UserPlus}
                clientes={captacion.nuevos.clientes}
                tickets={captacion.nuevos.tickets}
                totalCents={captacion.nuevos.totalCents}
                cuota={porcentaje(captacion.nuevos.totalCents, total)}
              />
              <TramoDeCaptacion
                titulo="Clientes de siempre" color={AZUL_CLARO} icon={Users}
                clientes={captacion.recurrentes.clientes}
                tickets={captacion.recurrentes.tickets}
                totalCents={captacion.recurrentes.totalCents}
                cuota={porcentaje(captacion.recurrentes.totalCents, total)}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TramoDeCaptacion({
  titulo, color, icon: Icon, clientes, tickets, totalCents, cuota,
}: {
  titulo: string
  color: string
  icon: typeof Users
  clientes: number
  tickets: number
  totalCents: number
  cuota: number
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">{titulo}</p>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{fmtEur(totalCents)}</p>
      <p className="text-xs text-muted-foreground">
        {cuota} % de la facturación con ficha · {clientes}{" "}
        {clientes === 1 ? "cliente" : "clientes"} · {tickets}{" "}
        {tickets === 1 ? "ticket" : "tickets"}
      </p>
    </div>
  )
}

/* ─── Ranking de clientes ────────────────────────────────────────────────── */

function RankingDeClientes({
  filas, sinClienteCents, sinClienteTickets,
}: {
  filas: FilaDeClienteEnPantalla[]
  sinClienteCents: number
  sinClienteTickets: number
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.totalCents))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Star className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-medium">Ranking de clientes</CardTitle>
            <p className="text-xs text-muted-foreground">
              Quién más deja, cuánto se gasta cada vez y cada cuánto vuelve · los {TOP_CLIENTES} primeros
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Ningún cliente con ficha ha comprado en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={SIN_HOVER}>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Visitas</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Ticket medio</TableHead>
                <TableHead className="text-right">Cada</TableHead>
                <TableHead className="text-right">Última</TableHead>
                <TableHead className="w-40">Peso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.slice(0, TOP_CLIENTES).map((f) => (
                <TableRow key={f.customerId} className={SIN_HOVER}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{f.tickets}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtEur(f.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(f.ticketMedioCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {f.diasEntreVisitas === null ? "—" : `${f.diasEntreVisitas} días`}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{fechaCorta(f.ultimaCompra)}</TableCell>
                  <TableCell>
                    <Barra parte={f.totalCents} maximo={maximo} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {filas.length > TOP_CLIENTES && (
          <p className="text-[11px] text-muted-foreground">
            y {filas.length - TOP_CLIENTES} clientes más, que suman{" "}
            {fmtEur(filas.slice(TOP_CLIENTES).reduce((a, f) => a + f.totalCents, 0))}.
          </p>
        )}

        {/* Se lleva aparte en vez de repartirlo: así se ve cuánto se cobra sin
            saber a quién, que es un dato en sí mismo. */}
        {sinClienteTickets > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Además, {sinClienteTickets} {sinClienteTickets === 1 ? "ticket" : "tickets"} sin ficha
            de cliente por {fmtEur(sinClienteCents)}: son ventas de mostrador y no cuentan en el
            ranking porque no se sabe de quién son.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          «Cada» es la media de días entre visitas dentro del período; con una sola visita no
          hay dos fechas que restar y se deja en blanco.
        </p>
      </CardContent>
    </Card>
  )
}

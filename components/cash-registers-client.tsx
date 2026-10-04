"use client"

import { Fragment, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { capitalizeFirst } from "@/lib/format"

export interface CashRegisterEditRow {
  id: string
  at: string
  byName: string
  declaredBeforeCents: number
  declaredAfterCents: number
  keptBeforeCents: number
  keptAfterCents: number
  differenceBeforeCents: number
  differenceAfterCents: number
  notesBefore: string | null
  notesAfter: string | null
}

export interface CashRegisterRow {
  id: string
  date: string
  status: string
  openingCashCents: number
  totalCashCents: number
  totalCardCents: number
  closingDeclaredCents: number | null
  closingKeptCents: number | null
  differenceCents: number | null
  denominationNotes: string | null
  closedAt: string | null
  closedByName: string | null
  edits: CashRegisterEditRow[]
}

interface Props {
  rows: CashRegisterRow[]
  defaultFrom: string
  defaultTo: string
}

function fmt(cents: number) {
  return (cents / 100).toFixed(2) + " €"
}

function fmtDiff(cents: number) {
  return `${cents > 0 ? "+" : ""}${fmt(cents)}`
}

function fmtDate(date: string) {
  return capitalizeFirst(
    new Date(date + "T12:00:00").toLocaleDateString("es-ES", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    }),
  )
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
}

function diffClass(cents: number | null) {
  return cents && cents !== 0 ? "text-orange-700 font-medium" : "text-green-700"
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{children}</p>
    </div>
  )
}

/** "antes → después", y solo se marca lo que ha cambiado. */
function Cambio({ antes, despues }: { antes: string; despues: string }) {
  if (antes === despues) return <span className="text-muted-foreground">{despues}</span>
  return (
    <span>
      <span className="text-muted-foreground line-through">{antes}</span> → <span className="font-medium">{despues}</span>
    </span>
  )
}

export function CashRegistersClient({ rows, defaultFrom, defaultTo }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [open, setOpen] = useState<string | null>(null)

  function pushParams(next: { from: string; to: string }) {
    const params = new URLSearchParams({ from: next.from, to: next.to })
    startTransition(() => router.push(`/cash-registers?${params.toString()}`))
  }

  function handleFrom(v: string) {
    setFrom(v)
    if (v) pushParams({ from: v, to })
  }

  function handleTo(v: string) {
    setTo(v)
    if (v) pushParams({ from, to: v })
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cajas</h1>
            <p className="text-muted-foreground text-sm">
              {rows.length} caja{rows.length !== 1 ? "s" : ""} en el período seleccionado
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Desde</span>
          <Input type="date" className="w-40" value={from} onChange={(e) => handleFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Hasta</span>
          <Input type="date" className="w-40" value={to} onChange={(e) => handleTo(e.target.value)} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Apertura</TableHead>
                <TableHead className="text-right">Efectivo</TableHead>
                <TableHead className="text-right">Tarjeta</TableHead>
                <TableHead className="text-right">Efectivo en caja al cierre</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead>Cerró</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const abierta = open === r.id
                return (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpen(abierta ? null : r.id)}>
                      <TableCell className="text-muted-foreground">
                        {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-medium">{fmtDate(r.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.openingCashCents)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.totalCashCents)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.totalCardCents)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.closingDeclaredCents !== null ? fmt(r.closingDeclaredCents) : "—"}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${diffClass(r.differenceCents)}`}>
                        {r.differenceCents !== null ? fmtDiff(r.differenceCents) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.closedByName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className={r.status === "CLOSED" ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-green-100 text-green-700 border-green-200"}>
                            {r.status === "CLOSED" ? "Cerrada" : "Abierta"}
                          </Badge>
                          {r.edits.length > 0 && (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                              Corregida{r.edits.length > 1 ? ` ×${r.edits.length}` : ""}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {abierta && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={8} className="space-y-4 py-4">
                          <div className="grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                            <Dato label="Apertura">{fmt(r.openingCashCents)}</Dato>
                            <Dato label="Cobros en efectivo">{fmt(r.totalCashCents)}</Dato>
                            <Dato label="Cobros con tarjeta">{fmt(r.totalCardCents)}</Dato>
                            <Dato label="Total del día">{fmt(r.totalCashCents + r.totalCardCents)}</Dato>
                            <Dato label="Efectivo esperado">{fmt(r.openingCashCents + r.totalCashCents)}</Dato>
                            <Dato label="Guardado en caja">
                              {r.closingKeptCents !== null ? fmt(r.closingKeptCents) : "—"}
                            </Dato>
                          </div>

                          {r.status === "CLOSED" ? (
                            <p className="text-sm text-muted-foreground">
                              Cerrada{r.closedByName ? ` por ${r.closedByName}` : ""}
                              {r.closedAt ? ` a las ${fmtTime(r.closedAt)}` : ""}.
                              {r.denominationNotes ? ` Notas: ${r.denominationNotes}` : ""}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">Esta caja sigue abierta.</p>
                          )}

                          {r.edits.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold">Correcciones del cierre</p>
                              <ul className="space-y-2">
                                {r.edits.map((e) => (
                                  <li key={e.id} className="rounded-md border bg-background p-3 text-sm">
                                    <p className="mb-1 font-medium">
                                      {e.byName} <span className="font-normal text-muted-foreground">a las {fmtTime(e.at)}</span>
                                    </p>
                                    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
                                      <p>
                                        <span className="text-xs text-muted-foreground">Contado: </span>
                                        <Cambio antes={fmt(e.declaredBeforeCents)} despues={fmt(e.declaredAfterCents)} />
                                      </p>
                                      <p>
                                        <span className="text-xs text-muted-foreground">Queda en caja: </span>
                                        <Cambio antes={fmt(e.keptBeforeCents)} despues={fmt(e.keptAfterCents)} />
                                      </p>
                                      <p>
                                        <span className="text-xs text-muted-foreground">Diferencia: </span>
                                        <Cambio antes={fmtDiff(e.differenceBeforeCents)} despues={fmtDiff(e.differenceAfterCents)} />
                                      </p>
                                    </div>
                                    {(e.notesBefore ?? "") !== (e.notesAfter ?? "") && (
                                      <p className="mt-1">
                                        <span className="text-xs text-muted-foreground">Notas: </span>
                                        <Cambio antes={e.notesBefore || "—"} despues={e.notesAfter || "—"} />
                                      </p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No hay cajas en el período seleccionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Wallet, Lock, Unlock, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { openCashRegister, closeCashRegister } from "@/lib/actions"

type CashRegister = {
  id: string
  date: string
  status: string
  openingCashCents: number
  totalCardCents: number
  totalCashCents: number
  closingDeclaredCents: number | null
  closingKeptCents: number | null
  differenceCents: number | null
  denominationNotes: string | null
  closedAt: string | null
  closedBy: { name: string; lastName: string | null } | null
}

interface Props {
  todayRegister: CashRegister | null
  history: CashRegister[]
  suggestedOpeningCents: number
  today: string
}

function fmt(cents: number) {
  return (cents / 100).toFixed(2) + " €"
}

export function CashRegisterClient({ todayRegister, history, suggestedOpeningCents, today }: Props) {
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [openingInput, setOpeningInput] = useState((suggestedOpeningCents / 100).toFixed(2))
  const [declaredInput, setDeclaredInput] = useState("")
  const [keptInput, setKeptInput] = useState("")
  const [denomInput, setDenomInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleOpen() {
    setLoading(true); setError("")
    const res = await openCashRegister(Math.round(Number(openingInput) * 100))
    setLoading(false)
    if (res.ok) setShowOpen(false)
    else setError(res.error ?? "Error")
  }

  async function handleClose() {
    if (!todayRegister) return
    setLoading(true); setError("")
    const declared = Math.round(Number(declaredInput) * 100)
    const kept = Math.round(Number(keptInput) * 100)
    const res = await closeCashRegister(todayRegister.id, declared, kept, denomInput || null)
    setLoading(false)
    if (res.ok) setShowClose(false)
    else setError(res.error ?? "Error")
  }

  const expectedCash = todayRegister
    ? todayRegister.openingCashCents + todayRegister.totalCashCents
    : 0

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caja diaria</h1>
          <p className="text-muted-foreground">{new Date(today + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        {!todayRegister && (
          <Button onClick={() => setShowOpen(true)}>
            <Unlock className="mr-2 h-4 w-4" /> Abrir caja
          </Button>
        )}
        {todayRegister?.status === "OPEN" && (
          <Button variant="outline" onClick={() => setShowClose(true)}>
            <Lock className="mr-2 h-4 w-4" /> Cerrar caja
          </Button>
        )}
        {todayRegister?.status === "CLOSED" && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Lock className="h-4 w-4" /> Cerrada a las {todayRegister.closedAt ? new Date(todayRegister.closedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
        )}
      </div>

      {/* TODAY SUMMARY */}
      {todayRegister ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Apertura efectivo</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{fmt(todayRegister.openingCashCents)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Cobros efectivo</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{fmt(todayRegister.totalCashCents)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Cobros tarjeta</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{fmt(todayRegister.totalCardCents)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Efectivo esperado en caja</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{fmt(expectedCash)}</p></CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Wallet className="h-10 w-10 opacity-30" />
            <p>No hay caja abierta para hoy.</p>
            <Button variant="outline" onClick={() => setShowOpen(true)}>Abrir caja ahora</Button>
          </CardContent>
        </Card>
      )}

      {todayRegister?.status === "CLOSED" && todayRegister.differenceCents !== null && (
        <Card className={Math.abs(todayRegister.differenceCents) > 0 ? "border-orange-200 bg-orange-50/40" : "border-green-200 bg-green-50/40"}>
          <CardContent className="py-4 text-sm grid grid-cols-3 gap-4">
            <div>
              <p className="text-muted-foreground">Declarado</p>
              <p className="font-semibold text-lg">{fmt(todayRegister.closingDeclaredCents!)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Diferencia</p>
              <p className={`font-semibold text-lg ${Math.abs(todayRegister.differenceCents) > 0 ? "text-orange-700" : "text-green-700"}`}>
                {todayRegister.differenceCents > 0 ? "+" : ""}{fmt(todayRegister.differenceCents)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Guardado en caja</p>
              <p className="font-semibold text-lg">{fmt(todayRegister.closingKeptCents!)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* HISTORY */}
      <div>
        <h2 className="text-base font-semibold mb-3">Historial</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium">Apertura</th>
                  <th className="px-4 py-3 text-right font-medium">Efectivo</th>
                  <th className="px-4 py-3 text-right font-medium">Tarjeta</th>
                  <th className="px-4 py-3 text-right font-medium">Declarado</th>
                  <th className="px-4 py-3 text-right font-medium">Diferencia</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Sin historial.</td></tr>
                )}
                {history.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">{new Date(r.date + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.openingCashCents)}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.totalCashCents)}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.totalCardCents)}</td>
                    <td className="px-4 py-3 text-right">{r.closingDeclaredCents !== null ? fmt(r.closingDeclaredCents) : "—"}</td>
                    <td className={`px-4 py-3 text-right ${r.differenceCents && Math.abs(r.differenceCents) > 0 ? "text-orange-700 font-medium" : "text-green-700"}`}>
                      {r.differenceCents !== null ? `${r.differenceCents > 0 ? "+" : ""}${fmt(r.differenceCents)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${r.status === "CLOSED" ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-green-100 text-green-700 border-green-200"}`}>
                        {r.status === "CLOSED" ? "Cerrada" : "Abierta"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* OPEN DIALOG */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}>
        <DialogContent style={{ maxWidth: "26rem" }}>
          <DialogHeader>
            <DialogTitle>Abrir caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Efectivo en caja al abrir (€)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={openingInput}
                onChange={(e) => setOpeningInput(e.target.value)}
              />
              {suggestedOpeningCents > 0 && (
                <p className="text-xs text-muted-foreground">Sugerido del cierre anterior: {fmt(suggestedOpeningCents)}</p>
              )}
            </div>
            {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpen(false)}>Cancelar</Button>
            <Button onClick={handleOpen} disabled={loading}>{loading ? "Abriendo…" : "Abrir caja"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLOSE DIALOG */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent style={{ maxWidth: "34rem" }}>
          <DialogHeader>
            <DialogTitle>Cerrar caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-muted/40 border p-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Apertura efectivo</p>
                <p className="font-medium">{fmt(todayRegister?.openingCashCents ?? 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cobros efectivo hoy</p>
                <p className="font-medium">{fmt(todayRegister?.totalCashCents ?? 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cobros tarjeta hoy</p>
                <p className="font-medium">{fmt(todayRegister?.totalCardCents ?? 0)}</p>
              </div>
              <div className="text-green-700">
                <p className="text-muted-foreground">Efectivo esperado</p>
                <p className="font-semibold">{fmt(expectedCash)}</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Efectivo contado (€)</label>
              <Input
                type="number" step="0.01" min="0"
                placeholder="0.00"
                value={declaredInput}
                onChange={(e) => {
                  setDeclaredInput(e.target.value)
                  if (!keptInput) setKeptInput(e.target.value)
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Efectivo que queda en caja (€)</label>
              <Input
                type="number" step="0.01" min="0"
                placeholder="0.00"
                value={keptInput}
                onChange={(e) => setKeptInput(e.target.value)}
              />
            </div>
            {declaredInput && (
              <div className="text-xs rounded border p-2 bg-background">
                Diferencia: <span className={Math.abs(Math.round(Number(declaredInput) * 100) - expectedCash) > 0 ? "text-orange-700 font-semibold" : "text-green-700 font-semibold"}>
                  {(() => {
                    const diff = Math.round(Number(declaredInput) * 100) - expectedCash
                    return `${diff > 0 ? "+" : ""}${fmt(diff)}`
                  })()}
                </span>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Notas de denominaciones (opcional)</label>
              <Input
                placeholder="Ej: 2×50€, 5×20€, 3×10€…"
                value={denomInput}
                onChange={(e) => setDenomInput(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClose(false)}>Cancelar</Button>
            <Button onClick={handleClose} disabled={loading || !declaredInput || !keptInput}>
              {loading ? "Cerrando…" : "Cerrar caja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Wallet, Lock, Unlock, AlertTriangle, Pencil } from "lucide-react"
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
import { openCashRegister, closeCashRegister, editCashRegisterClosing, forgetOperator } from "@/lib/actions"
import { PinDialog } from "@/components/pin-dialog"

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
  /** Hay PINes repartidos, así que cerrar caja exige identificarse. */
  pinRequired: boolean
  todayRegister: CashRegister | null
  /** La última corrección del cierre de hoy, si la hubo. */
  lastEdit: { byName: string; at: string; count: number } | null
  suggestedOpeningCents: number
  today: string
}

function fmt(cents: number) {
  return (cents / 100).toFixed(2) + " €"
}

export function CashRegisterClient({ todayRegister, lastEdit, suggestedOpeningCents, today, pinRequired }: Props) {
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  // El mismo diálogo sirve para cerrar y para corregir un cierre ya hecho.
  const [editing, setEditing] = useState(false)
  const [openingInput, setOpeningInput] = useState((suggestedOpeningCents / 100).toFixed(2))
  const [declaredInput, setDeclaredInput] = useState("")
  const [keptInput, setKeptInput] = useState("")
  const [denomInput, setDenomInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // El cierre lleva nombre: quien cuadra la caja responde del descuadre, así
  // que se pide el PIN antes de cerrarla.
  const [pinOpen, setPinOpen] = useState(false)

  async function handleOpen() {
    const openingCents = Math.round(Number(openingInput) * 100)
    if (!Number.isFinite(openingCents) || openingCents < 0) {
      setError("El saldo inicial no puede ser negativo.")
      return
    }
    setLoading(true); setError("")
    const res = await openCashRegister(openingCents)
    setLoading(false)
    if (res.ok) setShowOpen(false)
    else setError(res.error ?? "Error")
  }

  function abrirCierre() {
    setEditing(false); setError(""); setShowClose(true)
  }

  function abrirCorreccion() {
    if (!todayRegister) return
    setDeclaredInput(((todayRegister.closingDeclaredCents ?? 0) / 100).toFixed(2))
    setKeptInput(((todayRegister.closingKeptCents ?? 0) / 100).toFixed(2))
    setDenomInput(todayRegister.denominationNotes ?? "")
    setEditing(true); setError(""); setShowClose(true)
  }

  async function handleClose() {
    if (!todayRegister) return
    if (pinRequired) { setError(""); setPinOpen(true); return }
    await cerrar()
  }

  async function cerrar() {
    if (!todayRegister) return
    setLoading(true); setError("")
    const declared = Math.round(Number(declaredInput) * 100)
    const kept = Math.round(Number(keptInput) * 100)
    const guardar = editing ? editCashRegisterClosing : closeCashRegister
    const res = await guardar(todayRegister.id, declared, kept, denomInput || null)
    // La identificación muere con el cierre, igual que con cada venta.
    if (pinRequired) await forgetOperator()
    setLoading(false)
    if (res.ok) setShowClose(false)
    // Si la ventana de identidad ha caducado entre medias, se vuelve a pedir
    // el PIN en vez de soltar un error seco.
    else if (res.needsPin) setPinOpen(true)
    else setError(res.error ?? "Error")
  }

  const expectedCash = todayRegister
    ? todayRegister.openingCashCents + todayRegister.totalCashCents
    : 0
  const todayTotal = todayRegister
    ? todayRegister.totalCashCents + todayRegister.totalCardCents
    : 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
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
          <Button variant="outline" onClick={abrirCierre}>
            <Lock className="mr-2 h-4 w-4" /> Cerrar caja
          </Button>
        )}
        {todayRegister?.status === "CLOSED" && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Lock className="h-4 w-4" /> Cerrada a las {todayRegister.closedAt ? new Date(todayRegister.closedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
        )}
      </div>

      <div className="p-8 space-y-6">
        {/* TODAY SUMMARY */}
        {todayRegister ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Total del día</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-primary">{fmt(todayTotal)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Efectivo al abrir</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{fmt(todayRegister.openingCashCents)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Pagos en efectivo</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{fmt(todayRegister.totalCashCents)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Pagos con tarjeta</CardTitle></CardHeader>
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
                <p className="text-muted-foreground">Efectivo en caja al cierre</p>
                <p className="font-semibold text-lg">{fmt(todayRegister.closingDeclaredCents!)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Diferencia de efectivo al cierre</p>
                <p className={`font-semibold text-lg ${Math.abs(todayRegister.differenceCents) > 0 ? "text-orange-700" : "text-green-700"}`}>
                  {todayRegister.differenceCents > 0 ? "+" : ""}{fmt(todayRegister.differenceCents)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Guardado en caja</p>
                <p className="font-semibold text-lg">{fmt(todayRegister.closingKeptCents!)}</p>
              </div>
              <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  {lastEdit
                    ? `Corregido por ${lastEdit.byName} a las ${new Date(lastEdit.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}${lastEdit.count > 1 ? ` (${lastEdit.count} correcciones)` : ""}.`
                    : "¿Te has equivocado al contar? Se puede corregir hoy."}
                </p>
                <Button variant="outline" size="sm" onClick={abrirCorreccion}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Corregir cierre
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* OPEN DIALOG */}
        <Dialog open={showOpen} onOpenChange={setShowOpen}>
          <DialogContent style={{ maxWidth: "26rem" }} aria-describedby={undefined}>
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
              <Button onClick={handleOpen} disabled={loading || Number(openingInput) < 0}>{loading ? "Abriendo…" : "Abrir caja"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CLOSE DIALOG */}
        <Dialog open={showClose} onOpenChange={setShowClose}>
          <DialogContent style={{ maxWidth: "34rem" }} aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{editing ? "Corregir el cierre de caja" : "Cerrar caja"}</DialogTitle>
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
                  Diferencia de efectivo al cierre: <span className={Math.abs(Math.round(Number(declaredInput) * 100) - expectedCash) > 0 ? "text-orange-700 font-semibold" : "text-green-700 font-semibold"}>
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
                {editing ? (loading ? "Guardando…" : "Guardar corrección") : (loading ? "Cerrando…" : "Cerrar caja")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PinDialog
          open={pinOpen}
          onOpenChange={setPinOpen}
          title={editing ? "¿Quién corrige el cierre?" : "¿Quién cierra la caja?"}
          description={editing ? "Teclea tu PIN. La corrección quedará a tu nombre." : "Teclea tu PIN. El cierre quedará a tu nombre."}
          onIdentified={() => { setPinOpen(false); void cerrar() }}
        />
      </div>
    </div>
  )
}

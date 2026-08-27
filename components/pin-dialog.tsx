"use client"

/**
 * Identificarse para firmar un cobro.
 *
 * El PIN no dice un nombre: se teclean los dígitos y el sistema deduce quién
 * eres, y por eso no puede haber dos iguales entre las activas.
 *
 * Es identificación, no seguridad: sirve para que la venta y el cierre de caja
 * queden a nombre de quien los hace. La gestión del centro sigue pidiendo
 * usuario y contraseña.
 */

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { identifyByPin } from "@/lib/actions"
import { PinDots, PinPad } from "@/components/pin-pad"

export function PinDialog({
  open,
  onOpenChange,
  title = "¿Quién está cobrando?",
  description = "Teclea tu PIN. La venta quedará a tu nombre.",
  onIdentified,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  onIdentified: (name: string) => void
}) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  // Cada vez que se abre se empieza de cero: un PIN a medias de la vez
  // anterior es justo lo que hace que el siguiente intento falle sin motivo.
  useEffect(() => {
    if (open) { setPin(""); setError(null); setChecking(false) }
  }, [open])

  // La comprobación sale de la propia pulsación y no de un efecto que mire el
  // PIN: un efecto que dependa de `checking` se cancela a sí mismo al marcar
  // que está comprobando, y el teclado se cuelga en "Comprobando…".
  async function comprobar(valor: string) {
    setChecking(true)
    const res = await identifyByPin(valor)
    setChecking(false)
    if (res.ok && res.name) {
      onIdentified(res.name)
    } else {
      setError(res.error ?? "PIN no reconocido.")
      setPin("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <PinDots length={pin.length} />
        </div>

        <PinPad
          value={pin}
          onChange={(v) => { setError(null); setPin(v) }}
          onComplete={comprobar}
          disabled={checking}
        />

        <p className={cn("min-h-5 text-center text-sm", error ? "text-destructive" : "text-muted-foreground")}>
          {checking ? "Comprobando…" : error ?? ""}
        </p>
      </DialogContent>
    </Dialog>
  )
}

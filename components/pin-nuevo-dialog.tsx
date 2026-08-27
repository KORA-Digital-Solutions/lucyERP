"use client"

/**
 * El PIN que acaba de generar el sistema, en grande y una sola vez.
 *
 * Sale cuando se reactiva a alguien que tenía PIN: al desactivarla se le
 * retiró para que sus dígitos volvieran al bote, así que vuelve con uno nuevo
 * y hay que dictárselo aquí mismo. En la base solo queda el hash, igual que
 * con una contraseña: si no se anota ahora, no se recupera —se genera otro.
 *
 * Es un diálogo y no un aviso de los que se van solos porque hay que copiar
 * seis dígitos, y porque los dos sitios donde se reactiva —el interruptor de
 * la lista y la casilla del formulario— no tienen sitio donde enseñarlos.
 */

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

export function PinNuevoDialog({ pin, nombre, onClose }: {
  /** null mientras no haya ninguno que enseñar. */
  pin: string | null
  nombre: string
  onClose: () => void
}) {
  return (
    <Dialog open={pin !== null} onOpenChange={(abierto) => { if (!abierto) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>PIN nuevo para {nombre}</DialogTitle>
          <DialogDescription>
            Al desactivarla se le retiró el PIN, así que vuelve con uno nuevo.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border-2 border-dashed bg-muted/30 py-6 text-center">
          <p className="text-4xl font-bold tracking-[0.3em] tabular-nums">{pin}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Anótalo o díselo ahora: no se vuelve a mostrar. Al entrar por primera vez
          tendrá que cambiarlo por uno suyo.
        </p>
        <DialogFooter>
          <Button type="button" onClick={onClose}>Hecho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

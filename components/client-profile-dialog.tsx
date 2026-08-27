"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ClientProfileView, type ClientRow } from "@/components/client-profile-view"
import { getClientRow } from "@/lib/actions"

/**
 * La ficha del cliente sin salir de donde estés: se abre encima, en un
 * diálogo, y al cerrarla sigues con lo que tenías a medias. Se usa desde el
 * TPV, donde irse a /clients significaría perder el ticket empezado.
 *
 * Es de consulta: se ve todo pero no se toca nada. Modificar al cliente se
 * hace en Clientes, que es donde se gestiona.
 *
 * La fila no se pasa por props: quien abre la ficha (el TPV) sólo tiene el
 * cliente en corto —nombre, teléfono y saldo—, así que se pide entera al
 * abrir. Desde /clients no hace falta este diálogo: allí la ficha ocupa la
 * pantalla y la fila ya está cargada.
 */
export function ClientProfileDialog({ customerId, open, onOpenChange }: {
  customerId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [row, setRow] = useState<ClientRow | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open || !customerId) return
    let vigente = true
    setRow(null)
    setError(false)
    getClientRow(customerId).then((r) => {
      // Si da tiempo a cerrar y abrir otra ficha, la respuesta vieja no pisa
      // a la nueva.
      if (!vigente) return
      setRow(r)
      setError(r === null)
    })
    return () => { vigente = false }
  }, [open, customerId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden h-[88vh] w-[95vw]"
        style={{ maxWidth: "72rem" }}
        aria-describedby={undefined}
      >
        {/* La ficha trae su propio encabezado con el nombre; éste es para
            quien navega con lector de pantalla. */}
        <DialogTitle className="sr-only">Ficha de cliente</DialogTitle>
        {!row && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {error ? "No se ha encontrado la ficha de este cliente." : "Cargando ficha…"}
          </div>
        )}
        {row && (
          <ClientProfileView
            row={row}
            // Sin edición no hay nada que un administrador pueda hacer aquí
            // que no pueda hacer cualquiera: la ficha es de consulta.
            isAdmin={false}
            onBack={() => onOpenChange(false)}
            embedded
            readOnly
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

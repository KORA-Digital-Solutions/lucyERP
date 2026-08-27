"use client"

/**
 * Teclado numérico. Lo comparten las tres pantallas donde se teclea un PIN:
 * abrir el mostrador, elegir el PIN propio e identificarse para firmar un
 * cobro. Es el mismo gesto en las tres, así que es el mismo trasto.
 */

import { useEffect } from "react"
import { Delete } from "lucide-react"
import { cn } from "@/lib/utils"
import { PIN_LENGTH } from "@/lib/pin"

export function PinDots({ length, size = "md" }: { length: number; size?: "md" | "lg" }) {
  return (
    <div className={cn("flex justify-center", size === "lg" ? "gap-3" : "gap-2.5")}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-full border-2 transition-colors",
            size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5",
            i < length ? "border-primary bg-primary" : "border-muted-foreground/30",
          )}
        />
      ))}
    </div>
  )
}

export function PinPad({
  value,
  onChange,
  onComplete,
  disabled = false,
  size = "md",
}: {
  value: string
  onChange: (siguiente: string) => void
  /** Se llama al teclear el último dígito: nadie busca un botón de aceptar. */
  onComplete?: (pin: string) => void
  disabled?: boolean
  size?: "md" | "lg"
}) {
  function pulsar(d: string) {
    if (disabled || value.length >= PIN_LENGTH) return
    const siguiente = value + d
    onChange(siguiente)
    if (siguiente.length === PIN_LENGTH) onComplete?.(siguiente)
  }

  function borrar() {
    if (disabled) return
    onChange(value.slice(0, -1))
  }

  // El teclado físico hace lo mismo que el de pantalla: en el mostrador hay
  // teclado y obligar al ratón para unos dígitos es absurdo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) { pulsar(e.key); e.preventDefault() }
      else if (e.key === "Backspace") { borrar(); e.preventDefault() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // `value` va en las dependencias porque pulsar() lo lee: sin él, el teclado
    // físico escribiría siempre sobre el PIN vacío.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled])

  const alto = size === "lg" ? "h-16 text-2xl" : "h-14 text-xl"

  return (
    <div className={cn("grid grid-cols-3", size === "lg" ? "gap-3" : "gap-2")}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <PinKey key={d} onClick={() => pulsar(d)} disabled={disabled} className={alto}>{d}</PinKey>
      ))}
      <span />
      <PinKey onClick={() => pulsar("0")} disabled={disabled} className={alto}>0</PinKey>
      <PinKey onClick={borrar} disabled={disabled} className={alto} aria-label="Borrar">
        <Delete className="h-5 w-5" />
      </PinKey>
    </div>
  )
}

function PinKey({ children, onClick, disabled, className, ...rest }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center rounded-xl border bg-background font-medium tabular-nums transition-colors hover:bg-muted active:bg-muted/70 disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

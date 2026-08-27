"use client"

/**
 * Primer acceso: elegir el PIN propio.
 *
 * El PIN con el que se ha entrado lo generó la administradora y ha tenido que
 * decirse en voz alta para llegar hasta aquí, así que no vale como secreto.
 * Hasta que no se cambie, el resto de la aplicación redirige a esta pantalla
 * (ver app/(app)/layout.tsx).
 */

import { useActionState, useEffect, useRef, useState } from "react"
import { changeOwnPinAction } from "@/lib/auth-actions"
import { PIN_LENGTH } from "@/lib/pin"
import { PinDots, PinPad } from "@/components/pin-pad"
import { LuciaMark } from "@/components/lucia-logo"

export default function CambiarPinPage() {
  const [estado, formAction, enviando] = useActionState(changeOwnPinAction, {})
  // Dos pasos en la misma pantalla: primero el PIN nuevo, luego repetirlo. Con
  // dos teclados a la vez no se sabe en cuál estás escribiendo.
  const [paso, setPaso] = useState<"nuevo" | "repetir">("nuevo")
  const [nuevo, setNuevo] = useState("")
  const [repetido, setRepetido] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Si el servidor lo rechaza (repetido con el de otra, por ejemplo) se
  // empieza de nuevo: corregir un PIN a ciegas, dígito a dígito, no se puede.
  useEffect(() => {
    if (estado.error) { setPaso("nuevo"); setNuevo(""); setRepetido(""); setAviso(null) }
  }, [estado.error])

  // El envío va en un efecto y no en el propio onComplete: los dos PIN viajan
  // en campos ocultos y, al pulsar el último dígito, React todavía no los ha
  // repintado. El efecto corre después del repintado.
  useEffect(() => {
    if (paso !== "repetir" || repetido.length !== PIN_LENGTH || enviando) return
    if (repetido !== nuevo) {
      setAviso("Los dos PIN no coinciden. Empieza otra vez.")
      setPaso("nuevo")
      setNuevo("")
      setRepetido("")
      return
    }
    setAviso(null)
    formRef.current?.requestSubmit()
  }, [paso, repetido, nuevo, enviando])

  const enRepetir = paso === "repetir"
  const valor = enRepetir ? repetido : nuevo

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
          <LuciaMark className="h-full w-auto" tone="color" />
        </div>
        <div className="max-w-xs text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {enRepetir ? "Repítelo" : "Elige tu PIN"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {enRepetir
              ? "Vuelve a teclearlo para confirmar."
              : `${PIN_LENGTH} dígitos que solo sepas tú. Con él cobras y cierras caja, así que quedará a tu nombre.`}
          </p>
        </div>
      </div>

      <form ref={formRef} action={formAction} className="w-full max-w-[17rem] space-y-6">
        <input type="hidden" name="newPin" value={nuevo} />
        <input type="hidden" name="confirmPin" value={repetido} />

        <PinDots length={valor.length} size="lg" />

        <PinPad
          value={valor}
          onChange={(v) => {
            setAviso(null)
            if (enRepetir) setRepetido(v)
            else setNuevo(v)
          }}
          onComplete={() => { if (!enRepetir) setPaso("repetir") }}
          disabled={enviando}
          size="lg"
        />

        <p className="min-h-5 text-center text-sm text-destructive" aria-live="polite">
          {enviando ? <span className="text-muted-foreground">Guardando…</span> : aviso ?? estado.error ?? ""}
        </p>
      </form>
    </div>
  )
}

"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Settings } from "lucide-react"
import { loginWithPinAction } from "@/lib/auth-actions"
import { PIN_LENGTH } from "@/lib/pin"
import { PinDots, PinPad } from "@/components/pin-pad"
import { LuciaMark } from "@/components/lucia-logo"

/**
 * El teclado con el que se encuentra el centro al encender el ordenador.
 *
 * Va centrado y sin más adornos, a diferencia de la pantalla de gestión: esta
 * se usa cuarenta veces al día y lo único que tiene que hacer es poner el
 * teclado delante, no dar la bienvenida.
 *
 * El nombre y el eslogan salen de Configuración: son del centro, no de la
 * aplicación, y quien los cambia no tiene por qué tocar código.
 *
 * Aquí no se explica cuántos dígitos tiene el PIN ni se corrige a nadie: los
 * huecos ya lo dicen sin palabras, y a quien lo teclea todos los días no hay
 * que recordárselo. Lo único que puede leerse es que el PIN no vale.
 */
export function PinLoginForm({ clinicName, slogan }: {
  clinicName: string
  slogan: string | null
}) {
  const [estado, formAction, enviando] = useActionState(loginWithPinAction, {})
  const [pin, setPin] = useState("")
  const formRef = useRef<HTMLFormElement>(null)

  // Un PIN rechazado se borra para poder teclear otro sin darle a nada.
  useEffect(() => {
    if (estado.error) setPin("")
  }, [estado.error])

  // El envío va en un efecto y no en el propio onComplete: el PIN viaja en un
  // campo oculto, y cuando se pulsa el último dígito React todavía no ha
  // repintado ese campo — se enviaría el PIN de antes, con un dígito de menos.
  // El efecto corre después del repintado, así que ahí ya está el valor bueno.
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !enviando) formRef.current?.requestSubmit()
  }, [pin, enviando])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
          <LuciaMark className="h-full w-auto" tone="color" />
        </div>
        <div className="max-w-xs text-center">
          <h1 className="text-xl font-semibold tracking-tight">{clinicName}</h1>
          {slogan && (
            <p className="mt-1 text-sm italic text-muted-foreground">{slogan}</p>
          )}
        </div>
      </div>

      {/* El PIN viaja en un campo oculto y lo envía una server action: un
          <form> sin method es GET, y con GET el PIN acabaría en la barra de
          direcciones y en el historial del navegador. */}
      <form ref={formRef} action={formAction} className="w-full max-w-[17rem] space-y-6">
        <input type="hidden" name="pin" value={pin} />

        <PinDots length={pin.length} size="lg" />

        <PinPad value={pin} onChange={setPin} disabled={enviando} size="lg" />

        <p className="min-h-5 text-center text-sm text-destructive" aria-live="polite">
          {enviando ? <span className="text-muted-foreground">Entrando…</span> : estado.error ?? ""}
        </p>
      </form>

      <Link
        href="/login/admin"
        className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        <Settings className="h-3.5 w-3.5" />
        Gestión del centro
      </Link>
    </div>
  )
}

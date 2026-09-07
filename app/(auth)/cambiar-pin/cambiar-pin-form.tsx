"use client"

/**
 * Cambiar el PIN propio.
 *
 * Se llega aquí de dos maneras: la primera vez que se entra —el PIN lo generó
 * la administradora y ha tenido que decirse en voz alta, así que no vale como
 * secreto (ver app/(app)/layout.tsx)— o porque una quiere cambiar el suyo.
 *
 * Empieza pidiendo el PIN actual y enseñando de quién es. No es un trámite:
 * en el mostrador la sesión no es de nadie —la abre quien llega primero y la
 * comparten todas—, así que el PIN actual es lo único que dice quién eres. Sin
 * él, quien se sentara en la silla de otra podía cambiarle el PIN, salir
 * sabiéndolo y firmar ventas a su nombre.
 *
 * Enseñar el nombre no es cortesía: es la confirmación de a quién se le va a
 * cambiar el PIN antes de elegir uno nuevo.
 */

import { useActionState, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { changeOwnPinAction, verificarPinActualAction } from "@/lib/auth-actions"
import { PIN_LENGTH } from "@/lib/pin"
import { PinDots, PinPad } from "@/components/pin-pad"
import { LuciaMark } from "@/components/lucia-logo"

type Paso = "actual" | "nuevo" | "repetir"

const TEXTOS: Record<Paso, { titulo: string; ayuda: string }> = {
  actual: {
    titulo: "Tu PIN de ahora",
    ayuda: "Tecléalo para que sepamos a quién le cambiamos el PIN.",
  },
  nuevo: {
    titulo: "Elige tu PIN",
    ayuda: `${PIN_LENGTH} dígitos que solo sepas tú. Con él cobras y cierras caja, así que quedará a tu nombre.`,
  },
  repetir: {
    titulo: "Repítelo",
    ayuda: "Vuelve a teclearlo para confirmar.",
  },
}

export function CambiarPinForm({ obligatorio }: {
  /**
   * Se ha llegado aquí por el desvío del primer acceso, no por el botón de la
   * barra lateral. Entonces no hay puerta de salida: el PIN con el que se ha
   * entrado se dijo en voz alta y no vale como secreto.
   */
  obligatorio: boolean
}) {
  const [estado, formAction, guardando] = useActionState(changeOwnPinAction, {})
  // Tres pasos en la misma pantalla, de uno en uno: con dos teclados a la vez
  // no se sabe en cuál estás escribiendo.
  const [paso, setPaso] = useState<Paso>("actual")
  const [actual, setActual] = useState("")
  const [nuevo, setNuevo] = useState("")
  const [repetido, setRepetido] = useState("")
  const [deQuien, setDeQuien] = useState<string | null>(null)
  const [comprobando, setComprobando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  /** Vuelta al principio: el PIN actual sigue valiendo, solo se repite el nuevo. */
  function volverAElegir(motivo: string | null) {
    setPaso("nuevo")
    setNuevo("")
    setRepetido("")
    setAviso(motivo)
  }

  // Si el servidor rechaza el PIN nuevo (repetido con el de otra, por ejemplo)
  // se vuelve a elegir desde cero: corregir un PIN a ciegas, dígito a dígito,
  // no se puede. El actual no se vuelve a pedir, que ya se comprobó.
  //
  // La dependencia es el estado entero y no su texto: dos fallos seguidos
  // traen el mismo mensaje, y mirando el texto esto no volvía a correr.
  useEffect(() => {
    if (estado.error) volverAElegir(null)
  }, [estado])

  // El envío va en un efecto y no en el propio onComplete: los PIN viajan en
  // campos ocultos y, al pulsar el último dígito, React todavía no los ha
  // repintado. El efecto corre después del repintado.
  useEffect(() => {
    if (paso !== "repetir" || repetido.length !== PIN_LENGTH || guardando) return
    if (repetido !== nuevo) {
      volverAElegir("Los dos PIN no coinciden. Empieza otra vez.")
      return
    }
    setAviso(null)
    formRef.current?.requestSubmit()
  }, [paso, repetido, nuevo, guardando])

  /** El PIN actual se comprueba contra el servidor: aquí no hay nada que comparar. */
  async function comprobarActual(pin: string) {
    setComprobando(true)
    setAviso(null)
    const r = await verificarPinActualAction(pin)
    setComprobando(false)
    if (!r.ok) {
      setActual("")
      setAviso(r.error ?? "PIN no reconocido.")
      return
    }
    setDeQuien(r.nombre ?? null)
    setPaso("nuevo")
  }

  const valor = paso === "actual" ? actual : paso === "nuevo" ? nuevo : repetido
  const ocupado = comprobando || guardando

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
          <LuciaMark className="h-full w-auto" tone="color" />
        </div>
        <div className="max-w-xs text-center">
          {/* El nombre aparece en cuanto el PIN actual dice de quién es, y se
              queda a la vista mientras se elige el nuevo. */}
          {deQuien && (
            <p className="mb-1 text-sm font-medium text-primary">{deQuien}</p>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{TEXTOS[paso].titulo}</h1>
          <p className="text-sm text-muted-foreground">{TEXTOS[paso].ayuda}</p>
        </div>
      </div>

      <form ref={formRef} action={formAction} className="w-full max-w-[17rem] space-y-6">
        <input type="hidden" name="currentPin" value={actual} />
        <input type="hidden" name="newPin" value={nuevo} />
        <input type="hidden" name="confirmPin" value={repetido} />

        <PinDots length={valor.length} size="lg" />

        <PinPad
          value={valor}
          onChange={(v) => {
            setAviso(null)
            if (paso === "actual") setActual(v)
            else if (paso === "nuevo") setNuevo(v)
            else setRepetido(v)
          }}
          onComplete={(pin) => {
            if (paso === "actual") void comprobarActual(pin)
            else if (paso === "nuevo") setPaso("repetir")
          }}
          disabled={ocupado}
          size="lg"
        />

        <p className="min-h-5 text-center text-sm text-destructive" aria-live="polite">
          {comprobando ? <span className="text-muted-foreground">Comprobando…</span>
            : guardando ? <span className="text-muted-foreground">Guardando…</span>
            : aviso ?? estado.error ?? ""}
        </p>
      </form>

      {/* Quien entra por el botón de la barra lateral puede haberse
          equivocado, y sin esto la única salida era terminar de cambiar el
          PIN. En el primer acceso no sale: ahí sí hay que cambiarlo. */}
      {!obligatorio && (
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver sin cambiarlo
        </Link>
      )}
    </div>
  )
}

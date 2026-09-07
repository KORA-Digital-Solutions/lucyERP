import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"
import { CambiarPinForm } from "./cambiar-pin-form"

export const dynamic = "force-dynamic"

/**
 * Se llega aquí de dos maneras y no son iguales:
 *
 *   · Por el desvío del primer acceso (ver app/(app)/layout.tsx). El PIN lo
 *     generó la administradora y se ha dicho en voz alta, así que no vale
 *     como secreto: de aquí no se sale sin cambiarlo.
 *   · Por el botón de la barra lateral del mostrador, porque una quiere
 *     cambiar el suyo. Ahí sí hay puerta de vuelta.
 *
 * Cuál de las dos es lo dice mustChangePin de quien abrió el mostrador, que es
 * la misma condición que mira el desvío.
 */
export default async function CambiarPinPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const user = await prisma.user.findFirst({
    where: { id: session.userId, active: true },
    select: { mustChangePin: true },
  })

  return (
    <CambiarPinForm obligatorio={session.mode === "COUNTER" && (user?.mustChangePin ?? false)} />
  )
}

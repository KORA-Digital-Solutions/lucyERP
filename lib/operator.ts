import { cookies } from "next/headers"
import { firmar, verificar } from "@/lib/jwt"

/**
 * Quién está delante del mostrador ahora mismo.
 *
 * La sesión (lib/session.ts) dice qué puesto está abierto, no quién lo usa: en
 * un ordenador compartido se abre por la mañana y ahí se queda. Para saber a
 * nombre de quién queda una venta o un cierre de caja hace falta que la
 * persona se identifique en el momento, y eso es este token.
 *
 * Dura lo que dura un cobro y se borra al terminarlo. En el gabinete no hay
 * recepción: cada una acaba su servicio, va al ordenador y cobra a SU clienta.
 * Una ventana que sobreviva a la venta significa que la siguiente en llegar
 * cobraría a nombre de la anterior sin enterarse — que es justo el fallo que
 * esto viene a quitar, pero más difícil de ver.
 *
 * OJO: unos dígitos que se ven desde el otro lado del mostrador no son una
 * contraseña. Esto sirve para ATRIBUIR, no para proteger: por eso nunca abre
 * la gestión del centro, que sigue pidiendo la contraseña de verdad.
 */

const COOKIE = "lucia_operator"

// Segundos, no minutos: es un techo por si algo se queda a medias, porque lo
// normal es que la cookie se borre sola al cerrar la venta.
export const OPERATOR_WINDOW_SECONDS = 90

export interface OperatorPayload {
  userId: string
  name: string
  clinicId: string
}

export async function createOperatorToken(payload: OperatorPayload): Promise<string> {
  return firmar({ ...payload }, `${OPERATOR_WINDOW_SECONDS}s`)
}

export async function setOperatorCookie(token: string) {
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: OPERATOR_WINDOW_SECONDS,
    path: "/",
  })
}

export async function clearOperatorCookie() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export async function getOperator(): Promise<OperatorPayload | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  return verificar<OperatorPayload>(token)
}

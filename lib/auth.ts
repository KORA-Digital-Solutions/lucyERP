import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getOperator } from "@/lib/operator"
import { getSession, type SessionPayload } from "@/lib/session"

/**
 * Autorización a nivel de handler.
 *
 * El proxy (proxy.ts) redirige al login y bloquea rutas de página por rol, pero
 * NO es la frontera de seguridad: una server action es un POST a la ruta de la
 * página donde estás, así que el proxy ve esa ruta y no la acción invocada. Sin
 * comprobación propia, una trabajadora en /agenda podía llamar a saveWorker.
 *
 * Regla: toda acción y toda ruta API comprueba sus permisos por su cuenta.
 */

export class AuthError extends Error {
  readonly status: 401 | 403
  constructor(message: string, status: 401 | 403) {
    super(message)
    this.name = "AuthError"
    this.status = status
  }
}

/** Exige sesión válida. Devuelve la sesión para poder usar userId/clinicId. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw new AuthError("Tu sesión ha caducado. Vuelve a iniciar sesión.", 401)
  }
  return session
}

/**
 * Exige estar en la gestión del centro, con contraseña de administradora.
 *
 * No basta con que la persona sea administradora: tiene que haber entrado por
 * la gestión. Una administradora que ha abierto el mostrador con su PIN está
 * trabajando como una más, y desde ahí no se toca el catálogo ni los usuarios.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession()
  if (session.mode !== "MANAGEMENT" || session.role !== "ADMIN") {
    throw new AuthError("Esta acción requiere entrar en la gestión del centro.", 403)
  }
  return session
}

/**
 * Exige estar en el mostrador.
 *
 * Todo lo que escribe en el día a día pasa por aquí. Desde la gestión el día a
 * día se ve pero no se toca, y la garantía tiene que estar en el servidor: si
 * dependiera de esconder botones, bastaría con que se me olvidara uno.
 */
export async function requireCounter(): Promise<SessionPayload> {
  const session = await requireSession()
  if (session.mode !== "COUNTER") {
    throw new AuthError(
      "Desde la gestión del centro esto es solo de consulta. Entra por el mostrador con tu PIN.",
      403,
    )
  }
  return session
}

/**
 * Falta identificarse con el PIN. Es un error aparte para que la pantalla
 * pueda abrir el teclado numérico en vez de limitarse a enseñar el mensaje.
 */
export class PinRequiredError extends AuthError {
  constructor(message = "Identifícate con tu PIN para continuar.") {
    super(message, 401)
    this.name = "PinRequiredError"
  }
}

/** Quien está haciendo la acción, ya identificada. */
export interface Operator {
  userId: string
  name: string
}

/**
 * Exige saber QUIÉN está haciendo esto, no solo que haya sesión.
 *
 * En un puesto compartido la sesión no identifica a nadie: se abre por la
 * mañana y ahí se queda. Todo lo que deja un nombre escrito —cobrar, cerrar
 * caja— pasa por aquí, y el nombre sale del PIN que se acaba de teclear
 * (lib/operator.ts), no de quién encendió el ordenador.
 *
 * Mientras no haya ni un solo PIN puesto en el centro se sigue usando el
 * usuario de la sesión, como siempre: si no, el TPV deja de funcionar el día
 * que se despliega esto y hasta que alguien entre a repartir PINes.
 */
export async function requireOperator(): Promise<Operator> {
  const session = await requireCounter()

  const operator = await getOperator()
  if (operator) return { userId: operator.userId, name: operator.name }

  const conPin = await prisma.user.count({
    where: { clinicId: session.clinicId, active: true, NOT: { pinHash: null } },
  })
  if (conPin === 0) return { userId: session.userId, name: session.name }

  throw new PinRequiredError()
}

/**
 * Traduce un error a respuesta HTTP en rutas API. Si no es de autorización
 * devuelve un 500 genérico: los detalles van al log, no al cliente.
 */
export function authErrorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  console.error("[api]", e)
  return NextResponse.json({ error: "Error interno." }, { status: 500 })
}

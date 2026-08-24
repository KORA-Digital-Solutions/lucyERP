import { NextResponse } from "next/server"
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

/** Exige rol de administradora. Ojo: el modo trabajador de una admin cuenta
 *  como trabajadora, que es justo lo que se espera de ese modo. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession()
  if (session.role !== "ADMIN") {
    throw new AuthError("Esta acción requiere permisos de administradora.", 403)
  }
  return session
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

import { cookies } from "next/headers"
import { NextRequest } from "next/server"
import { ahoraEnSegundos, firmar, verificar } from "@/lib/jwt"

const COOKIE = "lucia_session"
/**
 * La sesión es deslizante, no de duración fija.
 *
 * El mostrador es un puesto compartido: lo que había que cerrar no era "la
 * sesión larga" sino "el rato que el ordenador está solo con la sesión
 * abierta". Por eso la ventana es corta y se renueva en cada petición: a quien
 * está trabajando no le molesta nunca, y si nadie toca el equipo se cierra
 * sola. Encima va un tope absoluto para que no se renueve indefinidamente.
 */
// Cuarto de hora: con el teclado numérico, volver a abrir el mostrador son
// unos dígitos, así que se puede cerrar agresivamente sin que moleste. Y en
// las fichas hay alergias y notas clínicas a la vista de quien se siente.
export const INACTIVITY_MINUTES = 15
export const MAX_SESSION_HOURS = 12

const COOKIE_MAX_AGE = INACTIVITY_MINUTES * 60

/**
 * Los dos modos de la aplicación, que no se mezclan.
 *
 * COUNTER es el mostrador: se abre tecleando un PIN y sirve para el día a día
 * —agenda, TPV, caja, clientes, stock—. No es de nadie en concreto: quien hace
 * cada cosa se identifica con su PIN en el momento (ver lib/operator.ts).
 *
 * MANAGEMENT es la gestión del centro: se abre con usuario y contraseña de
 * administradora y da acceso a usuarios, catálogo, horarios, configuración e
 * informes. El día a día se ve desde aquí, pero solo de lectura: para tocarlo
 * hay que salir y entrar por el mostrador, que es donde se sabe quién eres.
 */
export type SessionMode = "COUNTER" | "MANAGEMENT"

export interface SessionPayload {
  userId: string
  email: string | null
  name: string
  lastName: string | null
  role: string
  mode: SessionMode
  clinicId: string
  mustChangePassword: boolean
  /**
   * Epoch en segundos del inicio de sesión. NO se renueva al deslizar: es lo
   * que mide el tope absoluto. Opcional porque los tokens emitidos antes de
   * este cambio no lo traen; sin él se toma la sesión como recién empezada.
   */
  startedAt?: number
}

/** La sesión tal y como sale de verificar el token, con los claims del JWT. */
export interface VerifiedSession extends SessionPayload {
  exp: number
}

export async function createSession(payload: SessionPayload): Promise<string> {
  // `exp` e `iat` vienen puestos cuando se renueva a partir de una sesión ya
  // verificada; se quitan para que los ponga jose y no viajen duplicados.
  const { exp: _exp, iat: _iat, ...rest } = payload as SessionPayload & { exp?: number; iat?: number }
  return firmar(
    {
      ...rest,
      // Renovar la sesión no reinicia el tope: eso es justo lo que evita que
      // una sesión se quede abierta para siempre a base de moverla.
      startedAt: payload.startedAt ?? ahoraEnSegundos(),
    },
    `${INACTIVITY_MINUTES}m`,
  )
}

/** ¿Ha agotado la sesión su tope absoluto, por mucho que se siga usando? */
export function sessionMaxAgeReached(session: SessionPayload): boolean {
  if (!session.startedAt) return false
  return ahoraEnSegundos() - session.startedAt > MAX_SESSION_HOURS * 3600
}

/**
 * ¿Toca reemitir la cookie? Solo cuando queda menos de la mitad de la ventana:
 * firmar un token en cada petición no rompe nada pero no hace falta, y una
 * página lanza muchas.
 */
export function sessionNeedsRefresh(session: VerifiedSession): boolean {
  return session.exp - ahoraEnSegundos() < (INACTIVITY_MINUTES * 60) / 2
}

/** Opciones de la cookie de sesión, en un solo sitio: la pone el login por
 *  next/headers y la renueva el proxy sobre la respuesta. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: COOKIE_MAX_AGE,
  path: "/",
} as const

export const SESSION_COOKIE_NAME = COOKIE

export async function verifySession(token: string): Promise<VerifiedSession | null> {
  return verificar<VerifiedSession>(token)
}

export async function getSession(): Promise<VerifiedSession | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(COOKIE, token, SESSION_COOKIE_OPTIONS)
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export function getSessionFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(COOKIE)?.value
}

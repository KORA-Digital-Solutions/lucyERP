import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { NextRequest } from "next/server"

const COOKIE = "lucia_session"
// Sin SESSION_SECRET no se arranca en producción: con un fallback escrito en
// el repo, cualquiera que lo lea puede firmarse un JWT de administradora.
// En desarrollo se permite un valor fijo para no obligar a configurar nada.
const SECRET_DESARROLLO = "dev-secret-change-in-production-32chars!!"

function resolverSecreto(): string {
  const fromEnv = process.env.SESSION_SECRET
  if (fromEnv && fromEnv.length >= 32) return fromEnv

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET no está definida o tiene menos de 32 caracteres. " +
        "Define una cadena larga y aleatoria antes de arrancar en producción.",
    )
  }
  if (fromEnv) {
    console.warn("[session] SESSION_SECRET es demasiado corta (<32); usando la de desarrollo.")
  }
  return SECRET_DESARROLLO
}

const secret = new TextEncoder().encode(resolverSecreto())

export interface SessionPayload {
  userId: string
  email: string
  name: string
  lastName: string | null
  role: string
  originalRole?: string
  clinicId: string
  mustChangePassword: boolean
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret)
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8h
    path: "/",
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export function getSessionFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(COOKIE)?.value
}

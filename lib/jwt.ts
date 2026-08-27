import { SignJWT, jwtVerify } from "jose"

/**
 * Firma y verificación de los tokens de la casa.
 *
 * Vive aparte de lib/session.ts porque hay dos tokens con el mismo secreto y
 * vidas muy distintas: el de sesión, que dice qué puesto está abierto, y el de
 * operadora (lib/operator.ts), que dice quién está delante ahora mismo.
 */

// Sin SESSION_SECRET no se arranca en producción: con un fallback escrito en
// el repo, cualquiera que lo lea puede firmarse un JWT de administradora.
// En desarrollo se permite un valor fijo para no obligar a configurar nada.
const SECRETO_DESARROLLO = "dev-secret-change-in-production-32chars!!"

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
    console.warn("[jwt] SESSION_SECRET es demasiado corta (<32); usando la de desarrollo.")
  }
  return SECRETO_DESARROLLO
}

const secret = new TextEncoder().encode(resolverSecreto())

/** `expiracion` en formato de jose: "30m", "12h"… */
export async function firmar(payload: Record<string, unknown>, expiracion: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiracion)
    .sign(secret)
}

export async function verificar<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as T
  } catch {
    return null
  }
}

export function ahoraEnSegundos() {
  return Math.floor(Date.now() / 1000)
}

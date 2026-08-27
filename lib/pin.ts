import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"

/**
 * El PIN del mostrador, en un solo sitio.
 *
 * Lo usan las dos puertas por las que entra un PIN: abrir el mostrador
 * (lib/auth-actions.ts) e identificarse para firmar una acción
 * (identifyByPin en lib/actions.ts). Vive aquí y no en una de las dos porque
 * un fichero "use server" solo puede exportar funciones asíncronas, y esto son
 * también constantes y ayudas.
 */

/** Seis dígitos, no cuatro: cuatro invita al año de nacimiento y al 1234. */
export const PIN_LENGTH = 6

export function esPinBienFormado(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin)
}

/** PIN al azar para dar de alta. Se genera aquí y no lo escribe nadie. */
export function generarPin(): string {
  let pin = ""
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += Math.floor(Math.random() * 10).toString()
  }
  return pin
}

export type UsuariaDelPin = {
  id: string
  name: string
  lastName: string | null
  clinicId: string
  mustChangePin: boolean
}

/**
 * A quién pertenece un PIN. Devuelve null si no es de nadie.
 *
 * El PIN no viene acompañado de un nombre: se teclean los dígitos y hay que
 * deducir quién es. Por eso hay que recorrer a las candidatas comparando
 * hashes —bcrypt sala cada uno, así que no se puede buscar por igualdad— y por
 * eso el sistema no deja que dos activas tengan el mismo.
 */
export async function usuariaDelPin(pin: string): Promise<UsuariaDelPin | null> {
  const candidatas = await prisma.user.findMany({
    where: { active: true, NOT: { pinHash: null } },
    select: { id: true, name: true, lastName: true, clinicId: true, pinHash: true, mustChangePin: true },
  })
  for (const u of candidatas) {
    if (await bcrypt.compare(pin, u.pinHash!)) {
      const { pinHash: _pinHash, ...resto } = u
      return resto
    }
  }
  return null
}

export function nombreCompleto(u: { name: string; lastName: string | null }): string {
  return [u.name, u.lastName].filter(Boolean).join(" ")
}

/**
 * Freno a la fuerza bruta, escalado: 1 minuto, luego 5, luego 15.
 *
 * Un millón de combinaciones sin freno se prueban solas. Vive en memoria del
 * proceso, que es donde vive también esta aplicación (ver DEPLOY.md: un único
 * servicio en el PC del centro). Si algún día corre en varias instancias hay
 * que moverlo a la base.
 */
const ESPERAS_MS = [60_000, 5 * 60_000, 15 * 60_000]
const FALLOS_ANTES_DE_ESPERAR = 5
const intentos = { fallos: 0, bloqueadoHasta: 0 }

export function bloqueoRestanteMs(): number {
  return Math.max(0, intentos.bloqueadoHasta - Date.now())
}

export function apuntarFalloDePin() {
  intentos.fallos++
  if (intentos.fallos % FALLOS_ANTES_DE_ESPERAR === 0) {
    const tramo = Math.min(
      Math.floor(intentos.fallos / FALLOS_ANTES_DE_ESPERAR) - 1,
      ESPERAS_MS.length - 1,
    )
    intentos.bloqueadoHasta = Date.now() + ESPERAS_MS[tramo]
  }
}

export function olvidarFallosDePin() {
  intentos.fallos = 0
  intentos.bloqueadoHasta = 0
}

export function mensajeDeBloqueo(restanteMs: number): string {
  const minutos = Math.ceil(restanteMs / 60_000)
  return `Demasiados intentos. Espera ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`
}

/** Para no repetir el hash de un PIN en cada sitio que lo guarda. */
export async function hashearPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

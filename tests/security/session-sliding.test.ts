import { describe, expect, it, vi } from "vitest"

/**
 * Sesión deslizante.
 *
 * Lo que había que cerrar no era "la sesión larga" sino "el rato que el
 * mostrador está solo con la sesión abierta". Por eso la ventana es corta y se
 * renueva sola mientras se trabaja, con un tope absoluto por encima para que
 * no se quede abierta para siempre a base de moverla.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))

import {
  createSession, verifySession, sessionMaxAgeReached, sessionNeedsRefresh,
  INACTIVITY_MINUTES, MAX_SESSION_HOURS, SESSION_COOKIE_OPTIONS,
  type SessionPayload,
} from "@/lib/session"
import { OPERATOR_WINDOW_SECONDS } from "@/lib/operator"

const base: SessionPayload = {
  userId: "u1", email: null, name: "Una", lastName: null,
  role: "WORKER", mode: "COUNTER", clinicId: "c1", mustChangePassword: false,
}

const ahora = () => Math.floor(Date.now() / 1000)

describe("sesión deslizante", () => {
  it("la ventana es corta, no una jornada entera", async () => {
    const s = (await verifySession(await createSession(base)))!
    const duracion = s.exp - ahora()
    // Con un margen de un par de segundos por lo que tarde el test.
    expect(duracion).toBeGreaterThan(INACTIVITY_MINUTES * 60 - 5)
    expect(duracion).toBeLessThanOrEqual(INACTIVITY_MINUTES * 60)
  })

  it("la cookie caduca a la vez que el token", () => {
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(INACTIVITY_MINUTES * 60)
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true)
  })

  it("renovar no reinicia el reloj del tope absoluto", async () => {
    const inicio = ahora() - 3600 // la sesión se abrió hace una hora
    const primera = (await verifySession(await createSession({ ...base, startedAt: inicio })))!
    const renovada = (await verifySession(await createSession(primera)))!
    // La ventana se estira…
    expect(renovada.exp).toBeGreaterThanOrEqual(primera.exp)
    // …pero el inicio de sesión sigue siendo el de hace una hora.
    expect(renovada.startedAt).toBe(inicio)
  })

  it("una sesión recién abierta no ha llegado al tope; una del día anterior sí", () => {
    expect(sessionMaxAgeReached({ ...base, startedAt: ahora() })).toBe(false)
    expect(sessionMaxAgeReached({ ...base, startedAt: ahora() - (MAX_SESSION_HOURS + 1) * 3600 })).toBe(true)
  })

  it("la identificación de quien cobra dura mucho menos que el mostrador abierto", () => {
    // El mostrador se queda abierto un rato; quién está cobrando, no. Si las
    // dos duraran lo mismo, la siguiente en llegar cobraría a nombre de la
    // anterior — que es justo el fallo que el PIN viene a quitar.
    expect(OPERATOR_WINDOW_SECONDS).toBeLessThan(INACTIVITY_MINUTES * 60)
    expect(OPERATOR_WINDOW_SECONDS).toBeLessThanOrEqual(120)
  })

  it("los tokens antiguos, sin marca de inicio, no se dan por caducados", () => {
    // Si se tomaran por agotados, desplegar esto echaría a todo el mundo.
    expect(sessionMaxAgeReached({ ...base, startedAt: undefined })).toBe(false)
  })

  it("solo se reemite la cookie cuando queda menos de media ventana", () => {
    const mitad = (INACTIVITY_MINUTES * 60) / 2
    // Recién emitida: no hace falta tocar nada.
    expect(sessionNeedsRefresh({ ...base, exp: ahora() + INACTIVITY_MINUTES * 60 })).toBe(false)
    // Ya por debajo de la mitad: toca renovar.
    expect(sessionNeedsRefresh({ ...base, exp: ahora() + mitad - 60 })).toBe(true)
  })
})

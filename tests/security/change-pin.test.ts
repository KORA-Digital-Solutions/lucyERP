import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cambiar el PIN propio.
 *
 * Cambiarlo por el mismo que ya se tiene no cambia nada. Con el PIN que dio la
 * administradora (dicho en voz alta) dejaba la cuenta igual de expuesta y
 * quitaba el aviso de "cambia tu PIN", así que se rechaza.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) },
}))
vi.mock("@/lib/auth", () => {
  const s = {
    userId: "test-admin", email: "admin@test.local", name: "Test", lastName: null,
    role: "ADMIN", mode: "COUNTER", clinicId: "test-clinic", mustChangePassword: false,
  }
  class AuthError extends Error {}
  return {
    requireSession: async () => s,
    AuthError,
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { changeOwnPinAction } from "@/lib/auth-actions"
import { hashearPin, olvidarFallosDePin, usuariaDelPin } from "@/lib/pin"

const PIN_ACTUAL = "482915"
const PIN_NUEVO = "730264"

let ana: string

function formulario(actual: string, nuevo: string, repetido = nuevo) {
  const fd = new FormData()
  fd.set("currentPin", actual)
  fd.set("newPin", nuevo)
  fd.set("confirmPin", repetido)
  return fd
}

beforeAll(async () => {
  const clinicId = await getActiveClinicId()
  const u = await prisma.user.create({
    data: { clinicId, name: "Ana", lastName: "CambioPin", role: "WORKER", active: true },
  })
  ana = u.id
})

beforeEach(async () => {
  olvidarFallosDePin()
  await prisma.user.update({
    where: { id: ana },
    data: { pinHash: await hashearPin(PIN_ACTUAL), mustChangePin: true },
  })
})

afterAll(async () => {
  await prisma.user.delete({ where: { id: ana } })
})

describe("changeOwnPinAction", () => {
  it("rechaza el mismo PIN que ya tiene y no toca nada", async () => {
    const res = await changeOwnPinAction({}, formulario(PIN_ACTUAL, PIN_ACTUAL))
    expect(res.error).toMatch(/distinto/i)
    // Sigue obligada a cambiarlo: no se ha dado por cumplido.
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ana }, select: { mustChangePin: true } })
    expect(u.mustChangePin).toBe(true)
  })

  it("con un PIN distinto lo guarda y deja de pedirle que lo cambie", async () => {
    await expect(changeOwnPinAction({}, formulario(PIN_ACTUAL, PIN_NUEVO)))
      .rejects.toThrow(/REDIRECT/)
    expect((await usuariaDelPin(PIN_NUEVO))?.id).toBe(ana)
    expect(await usuariaDelPin(PIN_ACTUAL)).toBeNull()
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ana }, select: { mustChangePin: true } })
    expect(u.mustChangePin).toBe(false)
  })
})

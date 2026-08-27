import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PIN de mostrador.
 *
 * El PIN no viene acompañado de un nombre: se teclean los dígitos y el sistema
 * deduce quién es. Eso obliga a que sean únicos entre las activas —con uno
 * repetido, el cobro se apuntaría a quien no toca— y a que no los escriba
 * nadie a mano, que es como salen los años de nacimiento.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/auth", () => {
  const s = {
    userId: "test-admin", email: "admin@test.local", name: "Test", lastName: null,
    role: "ADMIN", mode: "MANAGEMENT", clinicId: "test-clinic", mustChangePassword: false,
  }
  class AuthError extends Error {}
  return {
    requireSession: async () => s,
    requireAdmin: async () => s,
    requireCounter: async () => s,
    requireOperator: async () => ({ userId: s.userId, name: s.name }),
    AuthError,
    PinRequiredError: class PinRequiredError extends AuthError {},
    authErrorResponse: () => new Response(null, { status: 401 }),
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import {
  clearUserPin, generateUserPin, identifyByPin, saveWorker, toggleWorkerActive,
} from "@/lib/actions"
import { PIN_LENGTH, hashearPin, olvidarFallosDePin, usuariaDelPin } from "@/lib/pin"

let clinicId: string
let ana: string
let bea: string
let inactiva: string
const creados: string[] = []

beforeAll(async () => {
  clinicId = await getActiveClinicId()
  const a = await prisma.user.create({ data: { clinicId, name: "Ana", lastName: "Pin", role: "WORKER", active: true } })
  const b = await prisma.user.create({ data: { clinicId, name: "Bea", lastName: "Pin", role: "WORKER", active: true } })
  const c = await prisma.user.create({ data: { clinicId, name: "Cesa", lastName: "Pin", role: "WORKER", active: true } })
  ana = a.id; bea = b.id; inactiva = c.id
  creados.push(ana, bea, inactiva)
})

beforeEach(async () => {
  // Los fallos de PIN se acumulan en memoria del proceso: sin esto, un test
  // que prueba un PIN inventado deja bloqueado al siguiente.
  olvidarFallosDePin()
  await prisma.user.updateMany({
    where: { id: { in: creados } },
    data: { pinHash: null, mustChangePin: false, active: true, restorePinOnReactivate: false },
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: creados } } })
})

describe("generateUserPin", () => {
  it("devuelve un PIN de la longitud pactada, y solo dígitos", async () => {
    const res = await generateUserPin(ana)
    expect(res.ok).toBe(true)
    expect(res.pin).toMatch(new RegExp(`^[0-9]{${PIN_LENGTH}}$`))
  })

  it("lo guarda hasheado, nunca en claro", async () => {
    const res = await generateUserPin(ana)
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ana }, select: { pinHash: true } })
    expect(u.pinHash).not.toBeNull()
    expect(u.pinHash).not.toContain(res.pin!)
  })

  it("nace marcado para cambiar: ha tenido que decirse en voz alta", async () => {
    await generateUserPin(ana)
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ana }, select: { mustChangePin: true } })
    expect(u.mustChangePin).toBe(true)
  })

  it("el PIN generado identifica a su dueña y a nadie más", async () => {
    const res = await generateUserPin(ana)
    const quien = await usuariaDelPin(res.pin!)
    expect(quien?.id).toBe(ana)
  })

  it("dos empleadas nunca acaban con el mismo PIN", async () => {
    const a = await generateUserPin(ana)
    const b = await generateUserPin(bea)
    expect(a.pin).not.toBe(b.pin)
    // Y el de Ana sigue siendo el de Ana después de generar el de Bea.
    expect((await usuariaDelPin(a.pin!))?.id).toBe(ana)
  })

  it("no se le da PIN a quien está desactivada", async () => {
    await prisma.user.update({ where: { id: inactiva }, data: { active: false } })
    const res = await generateUserPin(inactiva)
    expect(res.ok).toBe(false)
  })
})

describe("identifyByPin", () => {
  it("reconoce a quien teclea su PIN", async () => {
    await generateUserPin(ana)
    const bPin = await generateUserPin(bea)
    const res = await identifyByPin(bPin.pin!)
    expect(res.ok).toBe(true)
    expect(res.name).toBe("Bea Pin")
  })

  it("el PIN de una desactivada deja de identificar", async () => {
    const res = await generateUserPin(inactiva)
    await prisma.user.update({ where: { id: inactiva }, data: { active: false } })
    expect((await identifyByPin(res.pin!)).ok).toBe(false)
  })

  it("un PIN mal formado no llega ni a comprobarse", async () => {
    const res = await identifyByPin("12")
    expect(res.ok).toBe(false)
    expect(res.error).toContain(String(PIN_LENGTH))
  })

  it("un PIN que no es de nadie no identifica", async () => {
    await generateUserPin(ana)
    const res = await identifyByPin("0".repeat(PIN_LENGTH))
    expect(res.ok).toBe(false)
    expect(res.name).toBeUndefined()
  })
})

describe("toggleWorkerActive", () => {
  it("al desactivar le retira el PIN: sus dígitos vuelven al bote", async () => {
    const res = await generateUserPin(ana)
    expect((await toggleWorkerActive(ana, false)).ok).toBe(true)

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: ana },
      select: { pinHash: true, mustChangePin: true, restorePinOnReactivate: true },
    })
    expect(u.pinHash).toBeNull()
    expect(u.mustChangePin).toBe(false)
    // Y queda la nota de que lo tenía, que es lo que le devuelve uno al volver.
    expect(u.restorePinOnReactivate).toBe(true)
    expect(await usuariaDelPin(res.pin!)).toBeNull()
  })

  it("al volver recibe un PIN nuevo, no el de antes", async () => {
    const viejo = await generateUserPin(ana)
    await toggleWorkerActive(ana, false)

    const vuelta = await toggleWorkerActive(ana, true)
    expect(vuelta.ok).toBe(true)
    expect(vuelta.pin).toMatch(new RegExp(`^[0-9]{${PIN_LENGTH}}$`))
    expect(vuelta.pin).not.toBe(viejo.pin)

    // El nuevo la identifica; el viejo ya no es de nadie.
    expect((await usuariaDelPin(vuelta.pin!))?.id).toBe(ana)
    expect(await usuariaDelPin(viejo.pin!)).toBeNull()

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: ana },
      select: { mustChangePin: true, restorePinOnReactivate: true },
    })
    // Nace marcado para cambiar, como el del alta: se ha dicho en voz alta.
    expect(u.mustChangePin).toBe(true)
    expect(u.restorePinOnReactivate).toBe(false)
  })

  it("quien no tenía PIN vuelve sin PIN", async () => {
    // Una administradora que entra solo con contraseña no gana mostrador por
    // haber pasado por una baja.
    await toggleWorkerActive(bea, false)
    const vuelta = await toggleWorkerActive(bea, true)
    expect(vuelta.ok).toBe(true)
    expect(vuelta.pin).toBeUndefined()
    const u = await prisma.user.findUniqueOrThrow({ where: { id: bea }, select: { pinHash: true } })
    expect(u.pinHash).toBeNull()
  })

  it("el PIN de una que se fue puede acabar siendo de otra, sin chocar", async () => {
    // El caso que esto arregla: si el PIN de Ana siguiera guardado mientras
    // está de baja, al volver habría dos activas con los mismos dígitos y el
    // mostrador no sabría a quién apuntar el cobro.
    const deAna = await generateUserPin(ana)
    await toggleWorkerActive(ana, false)

    // Bea se queda con esos mismos dígitos, ahora libres.
    await prisma.user.update({
      where: { id: bea },
      data: { pinHash: await hashearPin(deAna.pin!), mustChangePin: false },
    })

    const vuelta = await toggleWorkerActive(ana, true)
    expect(vuelta.ok).toBe(true)
    expect(vuelta.pin).not.toBe(deAna.pin)
    // Los dígitos de siempre siguen siendo de una sola persona: de Bea.
    expect((await usuariaDelPin(deAna.pin!))?.id).toBe(bea)
    expect((await usuariaDelPin(vuelta.pin!))?.id).toBe(ana)
  })

  it("guardar la ficha con la casilla desmarcada retira el PIN igual", async () => {
    // El formulario es el otro camino que toca 'active'; ver saveWorker.
    const res = await generateUserPin(ana)
    const fd = new FormData()
    fd.set("name", "Ana")
    fd.set("lastName", "Pin")
    fd.set("role", "WORKER")
    const guardado = await saveWorker(ana, fd)
    expect(guardado.ok).toBe(true)

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: ana },
      select: { active: true, pinHash: true, restorePinOnReactivate: true },
    })
    expect(u.active).toBe(false)
    expect(u.pinHash).toBeNull()
    expect(u.restorePinOnReactivate).toBe(true)
    expect(await usuariaDelPin(res.pin!)).toBeNull()
  })
})

describe("clearUserPin", () => {
  it("retirar el PIN deja de identificar", async () => {
    const res = await generateUserPin(ana)
    expect((await identifyByPin(res.pin!)).ok).toBe(true)
    expect((await clearUserPin(ana)).ok).toBe(true)
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ana }, select: { pinHash: true } })
    expect(u.pinHash).toBeNull()
  })
})

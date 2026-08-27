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
import { clearUserPin, generateUserPin, identifyByPin } from "@/lib/actions"
import { PIN_LENGTH, olvidarFallosDePin, usuariaDelPin } from "@/lib/pin"

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
    data: { pinHash: null, mustChangePin: false, active: true },
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

describe("clearUserPin", () => {
  it("retirar el PIN deja de identificar", async () => {
    const res = await generateUserPin(ana)
    expect((await identifyByPin(res.pin!)).ok).toBe(true)
    expect((await clearUserPin(ana)).ok).toBe(true)
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ana }, select: { pinHash: true } })
    expect(u.pinHash).toBeNull()
  })
})

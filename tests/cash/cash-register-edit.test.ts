import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Corregir un cierre de caja.
 *
 * Lo que se prueba es lo que no puede quedar en manos de la pantalla: que solo
 * se corrija una caja cerrada y del mismo día, que la diferencia se recalcule
 * en el servidor, que cada corrección deje su fila con el antes y el después, y
 * que cerrar dos veces no sea una forma de saltarse ese registro.
 */

const ctx = vi.hoisted(() => ({
  userId: "",
  sinPin: false,
  HOY: "2031-03-15",
  AYER: "2031-03-14",
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/session", () => ({
  getSession: async () => ({
    userId: ctx.userId, email: "caja@test.local", name: "Caja",
    lastName: null, role: "ADMIN", clinicId: "test-clinic", mustChangePassword: false,
  }),
}))
// "Hoy" fijo: la caja del día de verdad la tocan otras suites y la app.
vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hoy: () => ctx.HOY,
}))
vi.mock("@/lib/auth", () => {
  const s = {
    userId: "test-admin", email: "admin@test.local", name: "Test",
    lastName: null, role: "ADMIN", clinicId: "test-clinic", mustChangePassword: false,
  }
  class AuthError extends Error {}
  class PinRequiredError extends AuthError {}
  return {
    requireSession: async () => s,
    requireAdmin: async () => s,
    requireCounter: async () => s,
    requireOperator: async () => {
      if (ctx.sinPin) throw new PinRequiredError("Identifícate con tu PIN para continuar.")
      return { userId: ctx.userId, name: "Caja" }
    },
    AuthError,
    PinRequiredError,
    authErrorResponse: () => new Response(null, { status: 401 }),
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { closeCashRegister, editCashRegisterClosing } from "@/lib/actions"

let clinicId: string
let cierraId: string
let corrigeId: string

/** Caja de las pruebas: 100 € de apertura y 50 € cobrados en efectivo = 150 € esperados. */
async function caja(date: string, status: "OPEN" | "CLOSED") {
  const cerrada = status === "CLOSED"
  return prisma.cashRegister.create({
    data: {
      clinicId, date, status,
      openingCashCents: 10000, totalCashCents: 5000, totalCardCents: 2500,
      ...(cerrada
        ? {
            closingDeclaredCents: 14800, closingKeptCents: 10000, differenceCents: -200,
            denominationNotes: "7×20€ y 1×10€", closedByUserId: cierraId, closedAt: new Date(),
          }
        : {}),
    },
  })
}

async function limpiar() {
  // Las filas de corrección caen en cascada con su caja.
  await prisma.cashRegister.deleteMany({ where: { clinicId, date: { in: [ctx.HOY, ctx.AYER] } } })
}

beforeAll(async () => {
  clinicId = await getActiveClinicId()
  const cierra = await prisma.user.create({ data: { clinicId, name: "Cierra", lastName: "Caja", role: "WORKER", active: true } })
  const corrige = await prisma.user.create({ data: { clinicId, name: "Corrige", lastName: "Caja", role: "WORKER", active: true } })
  cierraId = cierra.id
  corrigeId = corrige.id
  ctx.userId = corrigeId
})

beforeEach(async () => {
  ctx.sinPin = false
  ctx.userId = corrigeId
  await limpiar()
})

afterAll(async () => {
  await limpiar()
  await prisma.user.deleteMany({ where: { id: { in: [cierraId, corrigeId] } } })
})

describe("corregir el cierre de caja", () => {
  it("corrige lo contado y recalcula la diferencia con la misma cuenta que el cierre", async () => {
    const c = await caja(ctx.HOY, "CLOSED")

    const res = await editCashRegisterClosing(c.id, 15000, 12000, "  Contado de nuevo  ")
    expect(res.ok).toBe(true)

    const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: c.id } })
    expect(despues.closingDeclaredCents).toBe(15000)
    expect(despues.closingKeptCents).toBe(12000)
    // 150 € contados contra 100 € de apertura + 50 € cobrados: cuadra.
    expect(despues.differenceCents).toBe(0)
    expect(despues.denominationNotes).toBe("Contado de nuevo")
    // No se reabre ni se tocan los cobros ni quién cerró.
    expect(despues.status).toBe("CLOSED")
    expect(despues.totalCashCents).toBe(5000)
    expect(despues.totalCardCents).toBe(2500)
    expect(despues.openingCashCents).toBe(10000)
    expect(despues.closedByUserId).toBe(cierraId)
  })

  it("deja una fila con quién corrigió, cómo estaba antes y cómo ha quedado", async () => {
    const c = await caja(ctx.HOY, "CLOSED")
    await editCashRegisterClosing(c.id, 15000, 12000, "Contado de nuevo")

    const filas = await prisma.cashRegisterEdit.findMany({ where: { cashRegisterId: c.id } })
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      editedByUserId: corrigeId,
      declaredBeforeCents: 14800, declaredAfterCents: 15000,
      keptBeforeCents: 10000, keptAfterCents: 12000,
      differenceBeforeCents: -200, differenceAfterCents: 0,
      notesBefore: "7×20€ y 1×10€", notesAfter: "Contado de nuevo",
    })
  })

  it("cada corrección suma su fila, y la segunda parte de lo que dejó la primera", async () => {
    const c = await caja(ctx.HOY, "CLOSED")
    await editCashRegisterClosing(c.id, 15000, 12000, null)
    await editCashRegisterClosing(c.id, 15100, 12000, null)

    const filas = await prisma.cashRegisterEdit.findMany({ where: { cashRegisterId: c.id }, orderBy: { createdAt: "asc" } })
    expect(filas).toHaveLength(2)
    expect(filas[1].declaredBeforeCents).toBe(15000)
    expect(filas[1].declaredAfterCents).toBe(15100)
  })

  it("no corrige un cierre de otro día", async () => {
    const c = await caja(ctx.AYER, "CLOSED")

    const res = await editCashRegisterClosing(c.id, 15000, 12000, null)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/mismo día/)

    const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: c.id } })
    expect(despues.closingDeclaredCents).toBe(14800)
    expect(await prisma.cashRegisterEdit.count({ where: { cashRegisterId: c.id } })).toBe(0)
  })

  it("no corrige una caja que sigue abierta: eso es cerrarla", async () => {
    const c = await caja(ctx.HOY, "OPEN")

    const res = await editCashRegisterClosing(c.id, 15000, 12000, null)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/ya cerrada/)

    const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: c.id } })
    expect(despues.status).toBe("OPEN")
    expect(despues.closingDeclaredCents).toBeNull()
  })

  it("rechaza una corrección que no cambia nada", async () => {
    const c = await caja(ctx.HOY, "CLOSED")

    const res = await editCashRegisterClosing(c.id, 14800, 10000, "7×20€ y 1×10€")
    expect(res.ok).toBe(false)
    expect(await prisma.cashRegisterEdit.count({ where: { cashRegisterId: c.id } })).toBe(0)
  })

  it("rechaza importes negativos o con decimales", async () => {
    const c = await caja(ctx.HOY, "CLOSED")

    expect((await editCashRegisterClosing(c.id, -1, 10000, null)).ok).toBe(false)
    expect((await editCashRegisterClosing(c.id, 15000, -5, null)).ok).toBe(false)
    expect((await editCashRegisterClosing(c.id, 150.5, 10000, null)).ok).toBe(false)
    expect((await editCashRegisterClosing(c.id, Number.NaN, 10000, null)).ok).toBe(false)

    const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: c.id } })
    expect(despues.closingDeclaredCents).toBe(14800)
  })

  it("sin PIN no se corrige, y la pantalla recibe la señal para pedirlo", async () => {
    const c = await caja(ctx.HOY, "CLOSED")
    ctx.sinPin = true

    const res = await editCashRegisterClosing(c.id, 15000, 12000, null)
    expect(res.ok).toBe(false)
    expect(res.needsPin).toBe(true)

    const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: c.id } })
    expect(despues.closingDeclaredCents).toBe(14800)
  })

  it("no toca la caja de otra clínica", async () => {
    const otra = await prisma.clinic.create({ data: { name: "Otra clínica", openingTime: "09:00", closingTime: "20:00" } })
    try {
      const ajena = await prisma.cashRegister.create({
        data: {
          clinicId: otra.id, date: ctx.HOY, status: "CLOSED", openingCashCents: 0,
          closingDeclaredCents: 100, closingKeptCents: 100, differenceCents: 100, closedByUserId: cierraId,
        },
      })
      const res = await editCashRegisterClosing(ajena.id, 200, 200, null)
      expect(res.ok).toBe(false)
      const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: ajena.id } })
      expect(despues.closingDeclaredCents).toBe(100)
    } finally {
      await prisma.cashRegister.deleteMany({ where: { clinicId: otra.id } })
      await prisma.clinic.delete({ where: { id: otra.id } })
    }
  })
})

describe("cerrar la caja", () => {
  it("cierra una caja abierta con la diferencia calculada y a nombre de quien cierra", async () => {
    const c = await caja(ctx.HOY, "OPEN")

    const res = await closeCashRegister(c.id, 14900, 10000, "Billetes")
    expect(res.ok).toBe(true)

    const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: c.id } })
    expect(despues.status).toBe("CLOSED")
    expect(despues.differenceCents).toBe(-100)
    expect(despues.closedByUserId).toBe(corrigeId)
  })

  it("no se puede cerrar dos veces: corregir un cierre pasa por la corrección, que deja rastro", async () => {
    const c = await caja(ctx.HOY, "CLOSED")

    const res = await closeCashRegister(c.id, 99999, 99999, null)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/ya está cerrada/)

    const despues = await prisma.cashRegister.findUniqueOrThrow({ where: { id: c.id } })
    expect(despues.closingDeclaredCents).toBe(14800)
  })
})

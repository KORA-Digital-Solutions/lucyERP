import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * El catálogo de bonos, por donde entra lo que se teclea en la pantalla de
 * gestión.
 *
 * Las líneas llegan como un campo por servicio marcado (`sessions_<id>`,
 * `basePrice_<id>`, `discount_<id>`), así que lo que se prueba aquí es que ese
 * contrato con el formulario se lee entero y que ningún número imposible pasa
 * de largo: el mensaje tiene que decir de qué servicio se queja, que con un
 * bono de cuatro líneas "faltan sesiones" no dice cuál hay que arreglar.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/auth", () => {
  const s = {
    userId: "test-admin", email: "admin@test.local", name: "Test",
    lastName: null, role: "ADMIN", clinicId: "test-clinic", mustChangePassword: false,
  }
  class AuthError extends Error {}
  return {
    requireSession: async () => s,
    requireAdmin: async () => s,
    requireCounter: async () => s,
    requireOperator: async () => ({ userId: "test-admin", name: "Test" }),
    AuthError,
    PinRequiredError: class PinRequiredError extends AuthError {},
    authErrorResponse: () => new Response(null, { status: 401 }),
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import {
  getVoucherTemplates, getVoucherTemplatesForSale,
  saveVoucherTemplate, toggleVoucherTemplateActive, deleteVoucherTemplate,
} from "@/lib/voucher-actions"

let clinicId: string
let laserId: string
let facialId: string
const creados = { services: [] as string[], families: [] as string[] }

type LineaDeFormulario = { serviceId: string; sessions: number; basePrice: number; discount: number }

/** Monta el FormData igual que lo manda la pantalla. */
function formulario(name: string, lineas: LineaDeFormulario[], active = true): FormData {
  const fd = new FormData()
  fd.set("name", name)
  if (active) fd.set("active", "on")
  for (const l of lineas) {
    fd.append("serviceIds", l.serviceId)
    fd.set(`sessions_${l.serviceId}`, String(l.sessions))
    fd.set(`basePrice_${l.serviceId}`, String(l.basePrice))
    fd.set(`discount_${l.serviceId}`, String(l.discount))
  }
  return fd
}

const LASER = (over: Partial<LineaDeFormulario> = {}) =>
  ({ serviceId: laserId, sessions: 3, basePrice: 90, discount: 10, ...over })
const FACIAL = (over: Partial<LineaDeFormulario> = {}) =>
  ({ serviceId: facialId, sessions: 5, basePrice: 150, discount: 0, ...over })

async function limpiarPlantillas() {
  const ids = (await prisma.voucherTemplate.findMany({ where: { clinicId }, select: { id: true } })).map((t) => t.id)
  await prisma.customerVoucher.deleteMany({ where: { templateId: { in: ids } } })
  await prisma.voucherTemplateService.deleteMany({ where: { templateId: { in: ids } } })
  await prisma.voucherTemplate.deleteMany({ where: { id: { in: ids } } })
}

beforeAll(async () => {
  clinicId = await getActiveClinicId()
  const family = await prisma.serviceFamily.create({ data: { clinicId, name: "Catálogo de bonos" } })
  creados.families.push(family.id)
  const laser = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Láser ingles", durationMinutes: 20, priceCents: 3000 },
  })
  const facial = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Facial exprés", durationMinutes: 30, priceCents: 3000 },
  })
  laserId = laser.id
  facialId = facial.id
  creados.services.push(laserId, facialId)
})

beforeEach(limpiarPlantillas)

afterAll(async () => {
  await limpiarPlantillas()
  await prisma.service.deleteMany({ where: { id: { in: creados.services } } })
  await prisma.serviceFamily.deleteMany({ where: { id: { in: creados.families } } })
})

describe("saveVoucherTemplate · alta", () => {
  it("guarda una línea por servicio, con sus sesiones y su precio", async () => {
    const res = await saveVoucherTemplate(null, formulario("Bono mixto", [LASER(), FACIAL()]))
    expect(res.ok).toBe(true)

    const [t] = await getVoucherTemplates()
    expect(t.name).toBe("Bono mixto")
    expect(t.services).toHaveLength(2)

    const laser = t.services.find((s) => s.id === laserId)!
    expect(laser.totalSessions).toBe(3)
    expect(laser.basePriceCents).toBe(9000)
    expect(laser.discountPercent).toBe(10)
    expect(laser.pricePerSessionCents).toBe(2700)
  })

  it("los totales del bono salen de sus líneas", async () => {
    await saveVoucherTemplate(null, formulario("Bono mixto", [LASER(), FACIAL()]))
    const [t] = await getVoucherTemplates()
    expect(t.totalSessions).toBe(8)
    expect(t.basePriceCents).toBe(24000)
    expect(t.finalPriceCents).toBe(23100)
    expect(t.savingsCents).toBe(900)
  })

  it("un bono nuevo no trae bonos vendidos", async () => {
    await saveVoucherTemplate(null, formulario("Bono suelto", [LASER()]))
    const [t] = await getVoucherTemplates()
    expect(t.soldCount).toBe(0)
  })
})

describe("saveVoucherTemplate · lo que no pasa", () => {
  it("exige nombre", async () => {
    const res = await saveVoucherTemplate(null, formulario("", [LASER()]))
    expect(res.ok).toBe(false)
    expect(res.error).toContain("nombre")
  })

  it("exige al menos un servicio", async () => {
    const res = await saveVoucherTemplate(null, formulario("Bono vacío", []))
    expect(res.ok).toBe(false)
    expect(res.error).toContain("servicio")
  })

  it("rechaza un servicio que no es de este centro", async () => {
    const res = await saveVoucherTemplate(null, formulario("Bono colado", [LASER({ serviceId: "de-otro-sitio" })]))
    expect(res.ok).toBe(false)
  })

  it("exige sesiones, y dice en qué servicio faltan", async () => {
    const res = await saveVoucherTemplate(null, formulario("Bono mixto", [LASER(), FACIAL({ sessions: 0 })]))
    expect(res.ok).toBe(false)
    expect(res.error).toContain("Facial exprés")
  })

  it("exige tarifa, y dice en qué servicio falta", async () => {
    const res = await saveVoucherTemplate(null, formulario("Bono mixto", [LASER({ basePrice: 0 }), FACIAL()]))
    expect(res.ok).toBe(false)
    expect(res.error).toContain("Láser ingles")
  })

  it("no admite descuentos imposibles", async () => {
    const res = await saveVoucherTemplate(null, formulario("Bono mixto", [LASER({ discount: 150 })]))
    expect(res.ok).toBe(false)
    expect(res.error).toContain("Láser ingles")
  })

  it("no deja rastro cuando rechaza", async () => {
    await saveVoucherTemplate(null, formulario("Bono mixto", [LASER({ sessions: 0 })]))
    expect(await getVoucherTemplates()).toEqual([])
  })
})

describe("saveVoucherTemplate · edición", () => {
  it("reemplaza las líneas en vez de acumularlas", async () => {
    const alta = await saveVoucherTemplate(null, formulario("Bono mixto", [LASER(), FACIAL()]))
    const res = await saveVoucherTemplate(alta.id!, formulario("Bono solo láser", [LASER({ sessions: 6, basePrice: 180 })]))
    expect(res.ok).toBe(true)

    const [t] = await getVoucherTemplates()
    expect(t.name).toBe("Bono solo láser")
    expect(t.services).toHaveLength(1)
    expect(t.services[0].totalSessions).toBe(6)
  })

  it("no edita una plantilla que no existe", async () => {
    const res = await saveVoucherTemplate("no-existe", formulario("Bono fantasma", [LASER()]))
    expect(res.ok).toBe(false)
  })
})

describe("activo / inactivo", () => {
  it("un bono inactivo desaparece del mostrador pero no de la gestión", async () => {
    const alta = await saveVoucherTemplate(null, formulario("Bono retirable", [LASER()]))
    expect(await getVoucherTemplatesForSale()).toHaveLength(1)

    expect((await toggleVoucherTemplateActive(alta.id!, false)).ok).toBe(true)
    expect(await getVoucherTemplatesForSale()).toEqual([])
    expect(await getVoucherTemplates()).toHaveLength(1)
  })
})

describe("deleteVoucherTemplate", () => {
  it("borra el bono que todavía no se ha vendido", async () => {
    const alta = await saveVoucherTemplate(null, formulario("Bono recién creado", [LASER()]))
    expect((await deleteVoucherTemplate(alta.id!)).ok).toBe(true)
    expect(await getVoucherTemplates()).toEqual([])
  })

  it("no borra el que ya se vendió alguna vez: se desactiva", async () => {
    const alta = await saveVoucherTemplate(null, formulario("Bono vendido", [LASER()]))
    const customer = await prisma.customer.create({
      data: { clinicId, fileNumber: 9401, firstName: "Ya", lastName: "Compró", phone: "+34600333444" },
    })
    await prisma.customerVoucher.create({
      data: { clinicId, customerId: customer.id, templateId: alta.id!, name: "Bono vendido", pricePaidCents: 8100 },
    })

    const res = await deleteVoucherTemplate(alta.id!)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("Desactívalo")
    expect(await getVoucherTemplates()).toHaveLength(1)

    await prisma.customerVoucher.deleteMany({ where: { templateId: alta.id! } })
    await prisma.customer.delete({ where: { id: customer.id } })
  })
})

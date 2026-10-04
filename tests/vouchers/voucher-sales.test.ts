import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Vender un bono y gastarlo.
 *
 * Lo que se prueba aquí es lo que no se puede dejar a la pantalla: que la venta
 * del bono no exija profesional pero la sesión sí, que el saldo se lleve por
 * servicio y no se pueda pasar de rosca ni siquiera dentro del mismo ticket, y
 * que un bono vendido se quede con su propia copia de lo que se cobró.
 */

const sesion = vi.hoisted(() => ({ userId: "" }))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/session", () => ({
  getSession: async () => ({
    userId: sesion.userId, email: "cobra@test.local", name: "Cobra",
    lastName: null, role: "ADMIN", clinicId: "test-clinic", mustChangePassword: false,
  }),
}))
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
    requireOperator: async () => ({ userId: sesion.userId, name: "Cobra" }),
    AuthError,
    PinRequiredError: class PinRequiredError extends AuthError {},
    authErrorResponse: () => new Response(null, { status: 401 }),
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { createSale, type SaleLineInput } from "@/lib/actions"
import { getCustomerVouchers, getRedeemableVouchers } from "@/lib/voucher-actions"

let clinicId: string
let cobra: string
let atiende: string
let customerId: string
let laserId: string
let facialId: string
let ajenoId: string
let templateId: string

/**
 * El bono de las pruebas: 3 sesiones de láser con 10% de descuento (90 € de
 * tarifa → 81 €, o sea 27 € la sesión) y 5 de facial sin descuento (150 €, 30 €
 * la sesión). Ocho sesiones en total y 231 € de precio.
 */
const PRECIO_DEL_BONO = 23100

const creados = {
  users: [] as string[], services: [] as string[], families: [] as string[],
  customers: [] as string[], templates: [] as string[], cabins: [] as string[],
}
let cabinId: string

/** La línea que vende el bono: sin profesional y ya a su precio. */
function lineaDeBono(ref?: string): SaleLineInput {
  return {
    type: "VOUCHER", voucherTemplateId: templateId, description: "Bono láser + facial",
    quantity: 1, unitPriceCents: PRECIO_DEL_BONO, discountPercent: 0, totalCents: PRECIO_DEL_BONO,
    workerId: null, newVoucherRef: ref,
  }
}

/** La línea que gasta una sesión: a 0 EUR, pero con quien atendió. */
function lineaDeSesion(opts: {
  serviceId?: string; voucherId?: string; ref?: string; workerId?: string | null
}): SaleLineInput {
  return {
    type: "VOUCHER_SESSION",
    serviceId: opts.serviceId ?? laserId,
    description: opts.serviceId === facialId ? "Facial exprés" : "Láser axilas",
    quantity: 1, unitPriceCents: 0, discountPercent: 0, totalCents: 0,
    workerId: opts.workerId === undefined ? atiende : opts.workerId,
    voucherId: opts.voucherId,
    newVoucherRef: opts.ref,
  }
}

async function limpiarVentas() {
  const ventas = await prisma.sale.findMany({ where: { customerId: { in: creados.customers } }, select: { id: true } })
  const ids = ventas.map((v) => v.id)
  const bonos = await prisma.customerVoucher.findMany({ where: { customerId: { in: creados.customers } }, select: { id: true } })
  const bonoIds = bonos.map((b) => b.id)
  await prisma.voucherSession.deleteMany({ where: { voucherId: { in: bonoIds } } })
  await prisma.customerVoucherService.deleteMany({ where: { voucherId: { in: bonoIds } } })
  await prisma.customerVoucher.deleteMany({ where: { id: { in: bonoIds } } })
  await prisma.customerBalanceMovement.deleteMany({ where: { saleId: { in: ids } } })
  await prisma.saleLine.deleteMany({ where: { saleId: { in: ids } } })
  await prisma.sale.deleteMany({ where: { id: { in: ids } } })
  await prisma.appointment.deleteMany({ where: { customerId: { in: creados.customers } } })
}

beforeAll(async () => {
  clinicId = await getActiveClinicId()

  const uCobra = await prisma.user.create({ data: { clinicId, name: "Cobra", lastName: "Bonos", role: "ADMIN", active: true } })
  const uAtiende = await prisma.user.create({ data: { clinicId, name: "Atiende", lastName: "Sesión", role: "WORKER", active: true } })
  cobra = uCobra.id
  atiende = uAtiende.id
  sesion.userId = cobra
  creados.users.push(cobra, atiende)

  const family = await prisma.serviceFamily.create({ data: { clinicId, name: "Bonos test" } })
  creados.families.push(family.id)

  const laser = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Láser axilas", durationMinutes: 20, priceCents: 3000 },
  })
  const facial = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Facial exprés", durationMinutes: 30, priceCents: 3000 },
  })
  // Un servicio que el bono NO cubre, para comprobar que no cuela.
  const ajeno = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Masaje ajeno", durationMinutes: 60, priceCents: 5000 },
  })
  laserId = laser.id
  facialId = facial.id
  ajenoId = ajeno.id
  creados.services.push(laserId, facialId, ajenoId)

  const cabin = await prisma.cabin.create({ data: { clinicId, name: "Cabina de bonos" } })
  cabinId = cabin.id
  creados.cabins.push(cabinId)

  const customer = await prisma.customer.create({
    data: { clinicId, fileNumber: 9301, firstName: "Bona", lastName: "Cliente", phone: "+34600111222" },
  })
  customerId = customer.id
  creados.customers.push(customerId)

  const template = await prisma.voucherTemplate.create({
    data: {
      clinicId, name: "Bono láser + facial", active: true,
      services: {
        create: [
          { serviceId: laserId, totalSessions: 3, basePriceCents: 9000, discountPercent: 10 },
          { serviceId: facialId, totalSessions: 5, basePriceCents: 15000, discountPercent: 0 },
        ],
      },
    },
  })
  templateId = template.id
  creados.templates.push(templateId)
})

beforeEach(limpiarVentas)

afterAll(async () => {
  await limpiarVentas()
  await prisma.voucherTemplateService.deleteMany({ where: { templateId: { in: creados.templates } } })
  await prisma.voucherTemplate.deleteMany({ where: { id: { in: creados.templates } } })
  await prisma.customer.deleteMany({ where: { id: { in: creados.customers } } })
  await prisma.cabin.deleteMany({ where: { id: { in: creados.cabins } } })
  await prisma.service.deleteMany({ where: { id: { in: creados.services } } })
  await prisma.serviceFamily.deleteMany({ where: { id: { in: creados.families } } })
  await prisma.user.deleteMany({ where: { id: { in: creados.users } } })
})

async function venderBono() {
  const res = await createSale(customerId, "SALE", "CASH", [lineaDeBono()], null)
  expect(res.ok).toBe(true)
  const [bono] = await getCustomerVouchers(customerId)
  return bono.id
}

describe("createSale · vender un bono", () => {
  it("lo vende sin profesional y se lo apunta al cliente", async () => {
    await venderBono()

    const [bono] = await getCustomerVouchers(customerId)
    expect(bono.name).toBe("Bono láser + facial")
    expect(bono.totalSessions).toBe(8)
    expect(bono.remainingSessions).toBe(8)
    expect(bono.pricePaidCents).toBe(PRECIO_DEL_BONO)
  })

  it("cada servicio se queda con sus sesiones y su precio por sesión", async () => {
    await venderBono()
    const [bono] = await getCustomerVouchers(customerId)

    const laser = bono.services.find((s) => s.id === laserId)!
    expect(laser.totalSessions).toBe(3)
    expect(laser.discountPercent).toBe(10)
    expect(laser.pricePerSessionCents).toBe(2700)

    const facial = bono.services.find((s) => s.id === facialId)!
    expect(facial.totalSessions).toBe(5)
    expect(facial.pricePerSessionCents).toBe(3000)
  })

  it("congela las líneas, para que editar la plantilla no cambie lo vendido", async () => {
    await venderBono()
    await prisma.voucherTemplateService.updateMany({
      where: { templateId, serviceId: laserId },
      data: { totalSessions: 99, discountPercent: 50 },
    })

    const [bono] = await getCustomerVouchers(customerId)
    const laser = bono.services.find((s) => s.id === laserId)!
    expect(laser.totalSessions).toBe(3)
    expect(laser.discountPercent).toBe(10)

    await prisma.voucherTemplateService.updateMany({
      where: { templateId, serviceId: laserId },
      data: { totalSessions: 3, discountPercent: 10 },
    })
  })

  it("no se puede vender un bono sin cliente: es de alguien", async () => {
    const res = await createSale(null, "SALE", "CASH", [lineaDeBono()], null)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("cliente")
  })

  it("rechaza el bono si la plantilla ya no existe", async () => {
    const linea = { ...lineaDeBono(), voucherTemplateId: "no-existe" }
    const res = await createSale(customerId, "SALE", "CASH", [linea], null)
    expect(res.ok).toBe(false)
  })
})

describe("createSale · gastar sesiones", () => {
  it("descuenta del servicio que se gasta, y solo de ese", async () => {
    const voucherId = await venderBono()
    const res = await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId })], null)
    expect(res.ok).toBe(true)

    const [bono] = await getCustomerVouchers(customerId)
    expect(bono.services.find((s) => s.id === laserId)!.remainingSessions).toBe(2)
    expect(bono.services.find((s) => s.id === facialId)!.remainingSessions).toBe(5)
    expect(bono.sessions[0].workerName).toBe("Atiende Sesión")
    expect(bono.sessions[0].serviceName).toBe("Láser axilas")
  })

  it("la sesión sí exige profesional, al revés que la venta del bono", async () => {
    const voucherId = await venderBono()
    const res = await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId, workerId: null })], null)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("profesional")
  })

  it("no deja gastar un servicio que el bono no cubre", async () => {
    const voucherId = await venderBono()
    const res = await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId, serviceId: ajenoId })], null)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("no cubre")
  })

  it("agotado un servicio, el saldo del otro no lo rescata", async () => {
    const voucherId = await venderBono()
    const tresDeLaser = Array.from({ length: 3 }, () => lineaDeSesion({ voucherId }))
    expect((await createSale(customerId, "SALE", "CASH", tresDeLaser, null)).ok).toBe(true)

    // Al bono le quedan las cinco de facial, pero de láser no queda ninguna.
    const res = await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId })], null)
    expect(res.ok).toBe(false)
    expect(res.error).toContain("no le quedan sesiones")

    const conFacial = await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId, serviceId: facialId })], null)
    expect(conFacial.ok).toBe(true)
  })

  it("cuenta también las sesiones que gasta el propio ticket", async () => {
    const voucherId = await venderBono()
    // Cuatro de láser en el mismo ticket cuando solo hay tres: si únicamente se
    // mirase el saldo guardado, las cuatro pasarían por el mismo hueco.
    const cuatro = Array.from({ length: 4 }, () => lineaDeSesion({ voucherId }))
    const res = await createSale(customerId, "SALE", "CASH", cuatro, null)
    expect(res.ok).toBe(false)

    const [bono] = await getCustomerVouchers(customerId)
    expect(bono.usedSessions).toBe(0)
  })

  it("la sesión no cobra nada aunque la pantalla mande otro importe", async () => {
    const voucherId = await venderBono()
    const linea = { ...lineaDeSesion({ voucherId }), unitPriceCents: 3000, totalCents: 3000 }
    const res = await createSale(customerId, "SALE", "CASH", [linea], null)
    expect(res.ok).toBe(true)

    const venta = await prisma.sale.findUnique({ where: { id: res.id! }, include: { lines: true } })
    expect(venta!.totalCents).toBe(0)
    expect(venta!.lines[0].totalCents).toBe(0)
  })
})

describe("createSale · precio de la sesión de bono", () => {
  async function ventaDe(res: { id?: string }) {
    return prisma.sale.findUnique({ where: { id: res.id! }, include: { lines: true } })
  }

  it("entra al precio de la sesión dentro del bono, con un 100 % de descuento", async () => {
    const voucherId = await venderBono()
    // La pantalla manda la tarifa del catálogo (30 €) y no se le hace caso:
    // el láser del bono sale a 81 € entre 3 sesiones.
    const linea = { ...lineaDeSesion({ voucherId }), unitPriceCents: 3000 }
    const venta = await ventaDe(await createSale(customerId, "SALE", "CASH", [linea], null))

    const sesion = venta!.lines[0]
    expect(sesion.unitPriceCents).toBe(2700)
    expect(sesion.discountPercent).toBe(100)
    expect(sesion.totalCents).toBe(0)
  })

  it("cada servicio del bono va a su precio", async () => {
    const voucherId = await venderBono()
    const venta = await ventaDe(await createSale(customerId, "SALE", "CASH", [
      lineaDeSesion({ voucherId }),
      lineaDeSesion({ voucherId, serviceId: facialId }),
    ], null))

    const precios = Object.fromEntries(venta!.lines.map((l) => [l.serviceId, l.unitPriceCents]))
    expect(precios[laserId]).toBe(2700)
    expect(precios[facialId]).toBe(3000)
  })

  it("no cuenta como subtotal ni como descuento del ticket", async () => {
    const voucherId = await venderBono()
    const venta = await ventaDe(await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId })], null))

    expect(venta!.subtotalCents).toBe(0)
    expect(venta!.discountCents).toBe(0)
    expect(venta!.totalCents).toBe(0)
  })

  it("junto a un servicio cobrado, solo cuenta el descuento de verdad", async () => {
    const voucherId = await venderBono()
    const cobrado: SaleLineInput = {
      type: "SERVICE", serviceId: ajenoId, description: "Masaje ajeno", quantity: 1,
      unitPriceCents: 5000, discountPercent: 10, totalCents: 4500, workerId: atiende,
    }
    const venta = await ventaDe(await createSale(customerId, "SALE", "CASH", [cobrado, lineaDeSesion({ voucherId })], null))

    expect(venta!.subtotalCents).toBe(5000)
    expect(venta!.discountCents).toBe(500)
    expect(venta!.totalCents).toBe(4500)
  })

  it("las sesiones de un bono suman lo que valía su línea", async () => {
    const voucherId = await venderBono()
    // Las tres de láser, repartidas en dos tickets: la segunda y la tercera
    // siguen la cuenta de la primera.
    await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId })], null)
    await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId }), lineaDeSesion({ voucherId })], null)

    const lineas = await prisma.saleLine.findMany({
      where: { type: "VOUCHER_SESSION", voucherSession: { voucherId } },
    })
    expect(lineas).toHaveLength(3)
    expect(lineas.reduce((a, l) => a + l.unitPriceCents, 0)).toBe(8100)
  })

  it("en el bono recién comprado sale de la plantilla", async () => {
    const ref = "bono-precio-1"
    const venta = await ventaDe(await createSale(customerId, "SALE", "CASH", [
      lineaDeBono(ref),
      lineaDeSesion({ ref }),
      lineaDeSesion({ ref, serviceId: facialId }),
    ], null))

    const sesiones = venta!.lines.filter((l) => l.type === "VOUCHER_SESSION")
    expect(sesiones.map((l) => l.unitPriceCents).sort()).toEqual([2700, 3000])
    // El ticket sigue cobrando solo el bono.
    expect(venta!.totalCents).toBe(PRECIO_DEL_BONO)
    expect(venta!.discountCents).toBe(0)
  })

  it("el precio es el pactado en el bono aunque la plantilla cambie después", async () => {
    const voucherId = await venderBono()
    await prisma.voucherTemplateService.updateMany({
      where: { templateId, serviceId: laserId },
      data: { basePriceCents: 30000, discountPercent: 0 },
    })
    const venta = await ventaDe(await createSale(customerId, "SALE", "CASH", [lineaDeSesion({ voucherId })], null))
    expect(venta!.lines[0].unitPriceCents).toBe(2700)

    await prisma.voucherTemplateService.updateMany({
      where: { templateId, serviceId: laserId },
      data: { basePriceCents: 9000, discountPercent: 10 },
    })
  })
})

describe("createSale · comprar el bono y gastarlo en el mismo ticket", () => {
  it("vende el bono y le descuenta las sesiones de la misma venta", async () => {
    const ref = "bono-nuevo-1"
    const lineas = [
      lineaDeBono(ref),
      lineaDeSesion({ ref }),
      lineaDeSesion({ ref, serviceId: facialId }),
    ]
    const res = await createSale(customerId, "SALE", "CASH", lineas, null)
    expect(res.ok).toBe(true)

    const [bono] = await getCustomerVouchers(customerId)
    expect(bono.services.find((s) => s.id === laserId)!.remainingSessions).toBe(2)
    expect(bono.services.find((s) => s.id === facialId)!.remainingSessions).toBe(4)
    // El ticket cobra el bono, no las sesiones.
    const venta = await prisma.sale.findUnique({ where: { id: res.id! } })
    expect(venta!.totalCents).toBe(PRECIO_DEL_BONO)
  })

  it("no deja gastar de un bono que no se está comprando", async () => {
    const lineas = [lineaDeBono("ref-a"), lineaDeSesion({ ref: "ref-que-no-existe" })]
    const res = await createSale(customerId, "SALE", "CASH", lineas, null)
    expect(res.ok).toBe(false)
  })

  it("tampoco deja pasarse de sesiones en el bono recién comprado", async () => {
    const ref = "bono-nuevo-2"
    const lineas = [lineaDeBono(ref), ...Array.from({ length: 4 }, () => lineaDeSesion({ ref }))]
    const res = await createSale(customerId, "SALE", "CASH", lineas, null)
    expect(res.ok).toBe(false)
    expect(await getCustomerVouchers(customerId)).toEqual([])
  })
})

describe("getRedeemableVouchers", () => {
  it("deja fuera los bonos ya agotados", async () => {
    const voucherId = await venderBono()
    expect(await getRedeemableVouchers(customerId)).toHaveLength(1)

    const todas = [
      ...Array.from({ length: 3 }, () => lineaDeSesion({ voucherId })),
      ...Array.from({ length: 5 }, () => lineaDeSesion({ voucherId, serviceId: facialId })),
    ]
    await createSale(customerId, "SALE", "CASH", todas, null)
    expect(await getRedeemableVouchers(customerId)).toEqual([])
  })

  it("un bono con un servicio agotado sigue disponible por el otro", async () => {
    const voucherId = await venderBono()
    const tresDeLaser = Array.from({ length: 3 }, () => lineaDeSesion({ voucherId }))
    await createSale(customerId, "SALE", "CASH", tresDeLaser, null)

    const [bono] = await getRedeemableVouchers(customerId)
    expect(bono.remainingSessions).toBe(5)
    expect(bono.services.find((s) => s.id === laserId)!.remainingSessions).toBe(0)
  })
})

describe("cobrar una cita con el bono", () => {
  /**
   * En el mostrador la sesión se gasta añadiendo el servicio al ticket, y ese
   * servicio puede venir de la agenda. La línea es entonces las dos cosas a la
   * vez: gasta una sesión del bono y cobra la cita.
   */
  async function citaDeHoy() {
    const inicio = new Date()
    const fin = new Date(inicio.getTime() + 20 * 60_000)
    return prisma.appointment.create({
      data: {
        clinicId, customerId, serviceId: laserId, workerId: atiende, cabinId,
        startAt: inicio, endAt: fin, durationMinutes: 20, status: "CONFIRMED",
      },
    })
  }

  it("gasta la sesión y da la cita por hecha", async () => {
    const voucherId = await venderBono()
    const cita = await citaDeHoy()

    const linea = { ...lineaDeSesion({ voucherId }), appointmentId: cita.id }
    const res = await createSale(customerId, "SALE", "CASH", [linea], null)
    expect(res.ok).toBe(true)

    const [bono] = await getCustomerVouchers(customerId)
    expect(bono.services.find((s) => s.id === laserId)!.remainingSessions).toBe(2)

    const despues = await prisma.appointment.findUnique({ where: { id: cita.id } })
    expect(despues!.status).toBe("DONE")
  })

  it("no deja gastar dos sesiones cobrando la misma cita dos veces", async () => {
    const voucherId = await venderBono()
    const cita = await citaDeHoy()
    const linea = { ...lineaDeSesion({ voucherId }), appointmentId: cita.id }

    expect((await createSale(customerId, "SALE", "CASH", [linea], null)).ok).toBe(true)
    const segunda = await createSale(customerId, "SALE", "CASH", [linea], null)
    expect(segunda.ok).toBe(false)

    const [bono] = await getCustomerVouchers(customerId)
    expect(bono.usedSessions).toBe(1)
  })
})

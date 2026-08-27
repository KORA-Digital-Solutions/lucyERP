import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/auth", () => {
  const sesion = {
    userId: "test-admin", email: "admin@test.local", name: "Test",
    lastName: null, role: "ADMIN", clinicId: "test-clinic", mustChangePassword: false,
  }
  return {
    requireSession: async () => sesion,
    requireAdmin: async () => sesion,
    AuthError: class AuthError extends Error {},
    authErrorResponse: () => new Response(null, { status: 401 }),
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { getWorkerReport } from "@/lib/actions"

/**
 * El informe de personal mide a quien ATIENDE, no a quien cobra: en el
 * mostrador cobra una y atiende otra. Por eso el escenario cruza las dos
 * cosas a propósito — cada ticket lo cobra una empleada distinta de la que
 * hizo el servicio.
 */

let clinicId: string
let atiende: string   // hace el servicio del ticket viejo y vende la tarjeta regalo
let cobra: string     // cobra el ticket viejo y hace el servicio del reciente
let sinActividad: string
const creados = { users: [] as string[], sales: [] as string[], services: [] as string[], families: [] as string[], products: [] as string[], customers: [] as string[] }

beforeAll(async () => {
  clinicId = await getActiveClinicId()

  const uAtiende = await prisma.user.create({ data: { clinicId, name: "Atiende", lastName: "Informe", role: "WORKER", active: true } })
  const uCobra = await prisma.user.create({ data: { clinicId, name: "Cobra", lastName: "Informe", role: "ADMIN", active: true } })
  const uNueva = await prisma.user.create({ data: { clinicId, name: "Recién", lastName: "Llegada", role: "WORKER", active: true } })
  atiende = uAtiende.id
  cobra = uCobra.id
  sinActividad = uNueva.id
  creados.users.push(atiende, cobra, sinActividad)

  const family = await prisma.serviceFamily.create({ data: { clinicId, name: "Corporal" } })
  const service = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Presoterapia", durationMinutes: 45, priceCents: 7500 },
  })
  const product = await prisma.product.create({ data: { clinicId, name: "Aceite corporal ZZ", priceCents: 1750 } })
  const customer = await prisma.customer.create({
    data: { clinicId, fileNumber: 9101, firstName: "Informe", lastName: "Personal", lastName2: "Test", phone: "+34600999333" },
  })
  creados.families.push(family.id)
  creados.services.push(service.id)
  creados.products.push(product.id)
  creados.customers.push(customer.id)

  // Ticket viejo: lo cobra `cobra`, pero el servicio lo hace `atiende`.
  const viejo = await prisma.sale.create({
    data: {
      clinicId, customerId: customer.id, userId: cobra, status: "PAID",
      subtotalCents: 11000, discountCents: 750, totalCents: 10250,
      paidCents: 10250, createdAt: new Date("2026-01-15T10:00:00Z"),
      lines: {
        create: [
          { type: "SERVICE", serviceId: service.id, workerId: atiende, description: "Presoterapia", quantity: 1, unitPriceCents: 7500, discountPercent: 10, totalCents: 6750 },
          { type: "PRODUCT", productId: product.id, description: "Aceite corporal ZZ", quantity: 2, unitPriceCents: 1750, totalCents: 3500 },
        ],
      },
    },
  })

  // Ticket reciente: lo cobra `atiende`, y el servicio lo hace `cobra`.
  const nuevo = await prisma.sale.create({
    data: {
      clinicId, customerId: customer.id, userId: atiende, status: "DEBT",
      subtotalCents: 8250, discountCents: 0, totalCents: 8250,
      paidCents: 0, createdAt: new Date("2026-08-12T10:00:00Z"),
      lines: {
        create: [
          { type: "SERVICE", serviceId: service.id, workerId: cobra, description: "Presoterapia", quantity: 1, unitPriceCents: 5000, totalCents: 5000 },
          { type: "PRODUCT", productId: product.id, description: "Aceite corporal ZZ", quantity: 1, unitPriceCents: 2000, totalCents: 2000 },
          { type: "GIFT_CARD", workerId: atiende, description: "Tarjeta regalo", quantity: 1, unitPriceCents: 1250, totalCents: 1250 },
        ],
      },
    },
  })
  // Ticket de después del cambio: el producto ya lleva su profesional, que no
  // es la que cobra.
  const conProfesional = await prisma.sale.create({
    data: {
      clinicId, customerId: customer.id, userId: cobra, status: "PAID",
      subtotalCents: 3000, discountCents: 0, totalCents: 3000,
      paidCents: 3000, createdAt: new Date("2026-08-20T10:00:00Z"),
      lines: {
        create: [
          { type: "PRODUCT", productId: product.id, workerId: atiende, description: "Aceite corporal ZZ", quantity: 1, unitPriceCents: 3000, totalCents: 3000 },
        ],
      },
    },
  })

  creados.sales.push(viejo.id, nuevo.id, conProfesional.id)
})

afterAll(async () => {
  await prisma.saleLine.deleteMany({ where: { saleId: { in: creados.sales } } })
  await prisma.sale.deleteMany({ where: { id: { in: creados.sales } } })
  await prisma.customer.deleteMany({ where: { id: { in: creados.customers } } })
  await prisma.product.deleteMany({ where: { id: { in: creados.products } } })
  await prisma.service.deleteMany({ where: { id: { in: creados.services } } })
  await prisma.serviceFamily.deleteMany({ where: { id: { in: creados.families } } })
  await prisma.user.deleteMany({ where: { id: { in: creados.users } } })
})

describe("getWorkerReport", () => {
  it("cuenta el servicio a quien lo hizo, no a quien lo cobró", async () => {
    const { servicesCents } = await getWorkerReport(atiende)
    // 6750 es el servicio del ticket viejo, que cobró la otra.
    expect(servicesCents).toBe(6750)
    const otra = await getWorkerReport(cobra)
    expect(otra.servicesCents).toBe(5000)
  })

  it("cuenta el producto a quien lo vendió, no a quien cobró", async () => {
    // El ticket lo cobró `cobra`, pero la línea guarda a `atiende`.
    const { lines } = await getWorkerReport(atiende)
    const vendido = lines.find((l) => l.totalCents === 3000)
    expect(vendido?.type).toBe("PRODUCT")
    expect(vendido?.attributedByTicket).toBe(false)
    // Y por tanto no se le cuenta a quien cobró.
    const otra = await getWorkerReport(cobra)
    expect(otra.lines.some((l) => l.totalCents === 3000)).toBe(false)
  })

  it("rescata el producto antiguo sin profesional atribuyéndolo a quien cobró", async () => {
    // Las ventas de antes del cambio se quedaron sin profesional en la línea:
    // se cuentan a quien cobró y se marcan, para no perderlas del informe.
    const { lines, productsCents } = await getWorkerReport(cobra)
    expect(productsCents).toBe(3500)
    const producto = lines.find((l) => l.type === "PRODUCT")
    expect(producto?.attributedByTicket).toBe(true)
    // Los servicios sí llevan la profesional guardada: no son aproximados.
    expect(lines.find((l) => l.type === "SERVICE")?.attributedByTicket).toBe(false)
  })

  it("separa servicios, producto y tarjetas regalo, y los suma en el total", async () => {
    const r = await getWorkerReport(atiende)
    expect(r.servicesCents).toBe(6750)
    // 2000 del producto viejo que cobró ella + 3000 del que vendió ella.
    expect(r.productsCents).toBe(2000 + 3000)
    expect(r.giftCardsCents).toBe(1250)
    expect(r.totalCents).toBe(6750 + 5000 + 1250)
  })

  it("no cuenta dos veces ninguna línea entre las dos empleadas", async () => {
    const a = await getWorkerReport(atiende)
    const b = await getWorkerReport(cobra)
    // Las 6 líneas de los tres tickets se reparten sin solaparse.
    expect(a.lines.length + b.lines.length).toBe(6)
    const ids = new Set([...a.lines, ...b.lines].map((l) => l.id))
    expect(ids.size).toBe(6)
    expect(a.totalCents + b.totalCents).toBe(10250 + 8250 + 3000)
  })

  it("devuelve lo más reciente primero", async () => {
    const { lines } = await getWorkerReport(atiende)
    expect(lines[0].date.slice(0, 10)).toBe("2026-08-20")
    expect(lines[lines.length - 1].date.slice(0, 10)).toBe("2026-01-15")
  })

  it("clasifica cada línea en su familia", async () => {
    const { lines } = await getWorkerReport(atiende)
    const familias = [...new Set(lines.map((l) => l.family))].sort()
    expect(familias).toEqual(["Corporal", "Tarjeta regalo", "Tto. domiciliario"])
  })

  it("trae el cliente y el estado del ticket para poder ver lo que quedó a deber", async () => {
    const { lines } = await getWorkerReport(atiende)
    const regalo = lines.find((l) => l.type === "GIFT_CARD")
    expect(regalo?.customerName).toBe("Personal Test, Informe")
    expect(regalo?.ticketStatus).toBe("DEBT")
  })

  it("cuenta los tickets sin repetir los que traen varias líneas", async () => {
    const { lines, ticketCount } = await getWorkerReport(atiende)
    // Cuatro líneas repartidas en tres tickets.
    expect(lines).toHaveLength(4)
    expect(ticketCount).toBe(3)
  })

  it("una empleada sin actividad devuelve el informe vacío, no un error", async () => {
    const r = await getWorkerReport(sinActividad)
    expect(r.lines).toEqual([])
    expect(r.totalCents).toBe(0)
    expect(r.ticketCount).toBe(0)
  })
})

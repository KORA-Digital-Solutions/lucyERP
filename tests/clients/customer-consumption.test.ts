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
import { getCustomerConsumption } from "@/lib/actions"

let clinicId: string
let customerId: string
const creados = { users: [] as string[], sales: [] as string[], services: [] as string[], families: [] as string[], products: [] as string[] }

beforeAll(async () => {
  clinicId = await getActiveClinicId()

  const user = await prisma.user.create({ data: { clinicId, name: "Cobradora", role: "ADMIN", active: true } })
  const family = await prisma.serviceFamily.create({ data: { clinicId, name: "Facial" } })
  const service = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Limpieza profunda", durationMinutes: 60, priceCents: 7500 },
  })
  const product = await prisma.product.create({ data: { clinicId, name: "Crema hidratante XY", priceCents: 1750 } })
  const customer = await prisma.customer.create({
    data: { clinicId, fileNumber: 9001, firstName: "Consumo", lastName: "Test", phone: "+34600999111" },
  })
  customerId = customer.id
  creados.users.push(user.id)
  creados.families.push(family.id)
  creados.services.push(service.id)
  creados.products.push(product.id)

  // Ticket antiguo: solo un servicio con descuento.
  const viejo = await prisma.sale.create({
    data: {
      clinicId, customerId, userId: user.id, status: "PAID",
      subtotalCents: 7500, discountCents: 750, totalCents: 6750,
      paidCents: 6750, createdAt: new Date("2026-01-15T10:00:00Z"),
      lines: {
        create: [{
          type: "SERVICE", serviceId: service.id, description: "Limpieza profunda",
          quantity: 1, unitPriceCents: 7500, discountPercent: 10, totalCents: 6750,
        }],
      },
    },
  })

  // Ticket reciente: servicio sin descuento, producto y tarjeta regalo.
  const nuevo = await prisma.sale.create({
    data: {
      clinicId, customerId, userId: user.id, status: "DEBT",
      subtotalCents: 12250, discountCents: 0, totalCents: 12250,
      paidCents: 0, createdAt: new Date("2026-08-12T10:00:00Z"),
      lines: {
        create: [
          { type: "SERVICE", serviceId: service.id, description: "Limpieza profunda", quantity: 1, unitPriceCents: 7500, totalCents: 7500 },
          { type: "PRODUCT", productId: product.id, description: "Crema hidratante XY", quantity: 2, unitPriceCents: 1750, totalCents: 3500 },
          { type: "GIFT_CARD", description: "Tarjeta regalo", quantity: 1, unitPriceCents: 1250, totalCents: 1250 },
        ],
      },
    },
  })
  creados.sales.push(viejo.id, nuevo.id)
})

afterAll(async () => {
  await prisma.saleLine.deleteMany({ where: { saleId: { in: creados.sales } } })
  await prisma.sale.deleteMany({ where: { id: { in: creados.sales } } })
  await prisma.customer.deleteMany({ where: { id: customerId } })
  await prisma.product.deleteMany({ where: { id: { in: creados.products } } })
  await prisma.service.deleteMany({ where: { id: { in: creados.services } } })
  await prisma.serviceFamily.deleteMany({ where: { id: { in: creados.families } } })
  await prisma.user.deleteMany({ where: { id: { in: creados.users } } })
})

describe("getCustomerConsumption", () => {
  it("devuelve los tickets del más reciente al más antiguo", async () => {
    const { tickets } = await getCustomerConsumption(customerId)
    expect(tickets).toHaveLength(2)
    expect(new Date(tickets[0].date).getTime()).toBeGreaterThan(new Date(tickets[1].date).getTime())
  })

  it("suma el total histórico de todos los tickets", async () => {
    const { totalCents } = await getCustomerConsumption(customerId)
    expect(totalCents).toBe(6750 + 12250)
  })

  it("clasifica cada línea en su familia", async () => {
    const { tickets } = await getCustomerConsumption(customerId)
    const familias = tickets[0].lines.map((l) => l.family)
    // El producto va a "Tto. domiciliario", que es como se han clasificado
    // siempre en los listados del centro, no en un bloque aparte.
    expect(familias).toEqual(["Facial", "Tto. domiciliario", "Tarjeta regalo"])
  })

  it("conserva el descuento de cada línea", async () => {
    const { tickets } = await getCustomerConsumption(customerId)
    const [reciente, antiguo] = tickets
    expect(antiguo.lines[0].discountPercent).toBe(10)
    // Sin descuento va a 0, para poder ocultar la columna en pantalla.
    expect(reciente.lines[0].discountPercent).toBe(0)
  })

  it("marca el ticket pendiente de cobro y trae su total", async () => {
    const { tickets } = await getCustomerConsumption(customerId)
    expect(tickets[0].status).toBe("DEBT")
    expect(tickets[0].totalCents).toBe(12250)
  })

  it("identifica las líneas de producto para poder ver la recompra", async () => {
    const { tickets } = await getCustomerConsumption(customerId)
    const producto = tickets[0].lines.find((l) => l.description === "Crema hidratante XY")
    expect(producto?.productId).not.toBeNull()
    expect(producto?.quantity).toBe(2)
    // Los servicios no llevan producto, así que no cuentan para la recompra.
    expect(tickets[0].lines[0].productId).toBeNull()
  })

  it("un cliente sin ventas devuelve historial vacío, no un error", async () => {
    const sinVentas = await prisma.customer.create({
      data: { clinicId, fileNumber: 9002, firstName: "Sin", lastName: "Ventas", phone: "+34600999222" },
    })
    const { tickets, totalCents } = await getCustomerConsumption(sinVentas.id)
    expect(tickets).toEqual([])
    expect(totalCents).toBe(0)
    await prisma.customer.delete({ where: { id: sinVentas.id } })
  })
})

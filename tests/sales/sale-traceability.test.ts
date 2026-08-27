import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"

/**
 * Trazabilidad del ticket: TODA línea guarda quién la hizo o la vendió, no
 * solo los servicios y las tarjetas regalo. Sin eso no se puede seguir un
 * ticket entero ni medir a nadie en el informe de personal.
 */

// El id del usuario de la sesión se rellena en beforeAll, cuando ya existe la
// fila en la base: el mock solo lo lee al llamar a getSession().
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
    // La venta se atribuye a quien se identifica en el mostrador; aquí no hay
    // teclado de PIN, así que se da por identificada a la del ticket.
    requireOperator: async () => ({ userId: sesion.userId, name: "Cobra" }),
    AuthError,
    PinRequiredError: class PinRequiredError extends AuthError {},
    authErrorResponse: () => new Response(null, { status: 401 }),
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { createSale, type SaleLineInput } from "@/lib/actions"

let clinicId: string
let cobra: string
let vende: string
let customerId: string
let serviceId: string
let productId: string
const creados = { users: [] as string[], services: [] as string[], families: [] as string[], products: [] as string[], customers: [] as string[] }

function lineaProducto(workerId: string | null): SaleLineInput {
  return {
    type: "PRODUCT", productId, description: "Sérum trazable", quantity: 1,
    unitPriceCents: 4000, discountPercent: 0, totalCents: 4000, workerId,
  }
}

beforeAll(async () => {
  clinicId = await getActiveClinicId()

  const uCobra = await prisma.user.create({ data: { clinicId, name: "Cobra", lastName: "Ticket", role: "ADMIN", active: true } })
  const uVende = await prisma.user.create({ data: { clinicId, name: "Vende", lastName: "Producto", role: "WORKER", active: true } })
  cobra = uCobra.id
  vende = uVende.id
  sesion.userId = cobra
  creados.users.push(cobra, vende)

  const family = await prisma.serviceFamily.create({ data: { clinicId, name: "Trazabilidad" } })
  const service = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Servicio trazable", durationMinutes: 30, priceCents: 5000 },
  })
  const product = await prisma.product.create({ data: { clinicId, name: "Sérum trazable", priceCents: 4000, stock: 20 } })
  const customer = await prisma.customer.create({
    data: { clinicId, fileNumber: 9201, firstName: "Traza", lastName: "Bilidad", phone: "+34600999444" },
  })
  creados.families.push(family.id)
  creados.services.push(service.id)
  creados.products.push(product.id)
  creados.customers.push(customer.id)
  serviceId = service.id
  productId = product.id
  customerId = customer.id
})

afterAll(async () => {
  const ventas = await prisma.sale.findMany({ where: { customerId: { in: creados.customers } }, select: { id: true } })
  const ids = ventas.map((v) => v.id)
  await prisma.stockMovement.deleteMany({ where: { saleId: { in: ids } } })
  await prisma.customerBalanceMovement.deleteMany({ where: { saleId: { in: ids } } })
  await prisma.saleLine.deleteMany({ where: { saleId: { in: ids } } })
  await prisma.sale.deleteMany({ where: { id: { in: ids } } })
  await prisma.customer.deleteMany({ where: { id: { in: creados.customers } } })
  await prisma.product.deleteMany({ where: { id: { in: creados.products } } })
  await prisma.service.deleteMany({ where: { id: { in: creados.services } } })
  await prisma.serviceFamily.deleteMany({ where: { id: { in: creados.families } } })
  await prisma.user.deleteMany({ where: { id: { in: creados.users } } })
})

describe("createSale · profesional en todas las líneas", () => {
  it("rechaza la venta si una línea de producto no lleva profesional", async () => {
    const res = await createSale(customerId, "SALE", "CASH", [lineaProducto(null)], null)
    expect(res.ok).toBe(false)
    // El mensaje nombra la línea: con un ticket de varias, "falta un
    // profesional" no dice cuál hay que arreglar.
    expect(res.error).toContain("Sérum trazable")
  })

  it("rechaza la venta aunque solo falte el profesional en una de las líneas", async () => {
    const lineas: SaleLineInput[] = [
      { type: "SERVICE", serviceId, description: "Servicio trazable", quantity: 1, unitPriceCents: 5000, discountPercent: 0, totalCents: 5000, workerId: vende },
      lineaProducto(null),
    ]
    const res = await createSale(customerId, "SALE", "CASH", lineas, null)
    expect(res.ok).toBe(false)
  })

  it("no deja rastro de la venta rechazada", async () => {
    const ventas = await prisma.sale.count({ where: { customerId } })
    expect(ventas).toBe(0)
    // Ni descuenta stock, que es lo que más duele si se cuela a medias.
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    expect(p.stock).toBe(20)
  })

  it("guarda el profesional de cada línea, y puede no ser quien cobra", async () => {
    const lineas: SaleLineInput[] = [
      { type: "SERVICE", serviceId, description: "Servicio trazable", quantity: 1, unitPriceCents: 5000, discountPercent: 0, totalCents: 5000, workerId: cobra },
      lineaProducto(vende),
    ]
    const res = await createSale(customerId, "SALE", "CASH", lineas, null)
    expect(res.ok).toBe(true)

    const venta = await prisma.sale.findUniqueOrThrow({
      where: { id: res.id },
      include: { lines: true },
    })
    // Cobra una y vende otra: es el caso normal del mostrador.
    expect(venta.userId).toBe(cobra)
    const producto = venta.lines.find((l) => l.type === "PRODUCT")
    expect(producto?.workerId).toBe(vende)
    expect(venta.lines.find((l) => l.type === "SERVICE")?.workerId).toBe(cobra)
    // Ninguna línea se queda sin profesional.
    expect(venta.lines.every((l) => l.workerId !== null)).toBe(true)
  })
})

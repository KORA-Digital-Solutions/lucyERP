import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cobrar desde la agenda.
 *
 * La cita ya sabe el servicio, la duración y la profesional que atendió;
 * teclearlo otra vez en el TPV es trabajo y es una fuente de errores. Y al
 * cobrarla queda hecha, que hasta ahora no pasaba: las citas se quedaban en
 * PENDING para siempre porque nadie volvía a la agenda a marcarlas.
 */

const sesion = vi.hoisted(() => ({ userId: "" }))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/session", () => ({
  getSession: async () => ({
    userId: sesion.userId, email: "mostrador@test.local", name: "Mostrador",
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
    requireOperator: async () => ({ userId: sesion.userId, name: "Mostrador" }),
    AuthError,
    PinRequiredError: class PinRequiredError extends AuthError {},
    authErrorResponse: () => new Response(null, { status: 401 }),
  }
})

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { createSale, getBillableAppointments, type SaleLineInput } from "@/lib/actions"

let clinicId: string
let cobra: string
let atiende: string
let customerId: string
let cabinId: string
let serviceId: string
const creados = { users: [] as string[], services: [] as string[], families: [] as string[], cabins: [] as string[], customers: [] as string[] }

/** Hace `dias` que pasó, dentro de la ventana que mira el TPV. */
function haceDias(dias: number) {
  return new Date(Date.now() - dias * 86_400_000)
}

async function crearCita(startAt: Date, status: string) {
  return prisma.appointment.create({
    data: {
      clinicId, customerId, serviceId, workerId: atiende, cabinId,
      startAt, endAt: new Date(startAt.getTime() + 45 * 60_000),
      durationMinutes: 45, status,
    },
  })
}

beforeAll(async () => {
  clinicId = await getActiveClinicId()

  const uCobra = await prisma.user.create({ data: { clinicId, name: "Cobra", lastName: "Agenda", role: "ADMIN", active: true } })
  const uAtiende = await prisma.user.create({ data: { clinicId, name: "Atiende", lastName: "Agenda", role: "WORKER", active: true } })
  cobra = uCobra.id
  atiende = uAtiende.id
  sesion.userId = cobra
  creados.users.push(cobra, atiende)

  const family = await prisma.serviceFamily.create({ data: { clinicId, name: "Agenda" } })
  const service = await prisma.service.create({
    data: { clinicId, familyId: family.id, name: "Presoterapia de agenda", durationMinutes: 45, priceCents: 6000 },
  })
  const cabin = await prisma.cabin.create({ data: { clinicId, name: "Cabina de test" } })
  const customer = await prisma.customer.create({
    data: { clinicId, fileNumber: 9301, firstName: "Agenda", lastName: "Cobrable", phone: "+34600999555" },
  })
  creados.families.push(family.id)
  creados.services.push(service.id)
  creados.cabins.push(cabin.id)
  creados.customers.push(customer.id)
  serviceId = service.id
  cabinId = cabin.id
  customerId = customer.id
})

beforeEach(async () => {
  const ventas = await prisma.sale.findMany({ where: { customerId }, select: { id: true } })
  const ids = ventas.map((v) => v.id)
  await prisma.saleLine.deleteMany({ where: { saleId: { in: ids } } })
  await prisma.sale.deleteMany({ where: { id: { in: ids } } })
  await prisma.appointment.deleteMany({ where: { customerId } })
})

afterAll(async () => {
  const ventas = await prisma.sale.findMany({ where: { customerId }, select: { id: true } })
  const ids = ventas.map((v) => v.id)
  await prisma.saleLine.deleteMany({ where: { saleId: { in: ids } } })
  await prisma.sale.deleteMany({ where: { id: { in: ids } } })
  await prisma.appointment.deleteMany({ where: { customerId } })
  await prisma.customer.deleteMany({ where: { id: { in: creados.customers } } })
  await prisma.cabin.deleteMany({ where: { id: { in: creados.cabins } } })
  await prisma.service.deleteMany({ where: { id: { in: creados.services } } })
  await prisma.serviceFamily.deleteMany({ where: { id: { in: creados.families } } })
  await prisma.user.deleteMany({ where: { id: { in: creados.users } } })
})

describe("getBillableAppointments", () => {
  it("trae la cita con su profesional, su duración y la tarifa de hoy", async () => {
    await crearCita(haceDias(1), "CONFIRMED")
    const [cita] = await getBillableAppointments(customerId)
    expect(cita.serviceName).toBe("Presoterapia de agenda")
    expect(cita.familyName).toBe("Agenda")
    expect(cita.durationMinutes).toBe(45)
    expect(cita.priceCents).toBe(6000)
    // La profesional es la de la cita, no la del mostrador.
    expect(cita.workerId).toBe(atiende)
    expect(cita.workerName).toBe("Atiende Agenda")
  })

  it("no ofrece lo cancelado ni las ausencias", async () => {
    await crearCita(haceDias(1), "CANCELLED")
    await crearCita(haceDias(2), "NO_SHOW")
    expect(await getBillableAppointments(customerId)).toEqual([])
  })

  it("no ofrece lo que cae fuera de la ventana", async () => {
    // Hace medio año: eso ya no se rescata por aquí, se mete a mano.
    await crearCita(haceDias(180), "CONFIRMED")
    // La semana que viene: todavía no toca cobrarla.
    await prisma.appointment.create({
      data: {
        clinicId, customerId, serviceId, workerId: atiende, cabinId,
        startAt: new Date(Date.now() + 7 * 86_400_000),
        endAt: new Date(Date.now() + 7 * 86_400_000 + 45 * 60_000),
        durationMinutes: 45, status: "CONFIRMED",
      },
    })
    expect(await getBillableAppointments(customerId)).toEqual([])
  })

  it("deja de ofrecer la cita en cuanto se cobra", async () => {
    const cita = await crearCita(haceDias(1), "CONFIRMED")
    const linea: SaleLineInput = {
      type: "SERVICE", serviceId, description: "Presoterapia de agenda", quantity: 1,
      unitPriceCents: 6000, discountPercent: 0, totalCents: 6000,
      workerId: atiende, appointmentId: cita.id,
    }
    expect((await createSale(customerId, "SALE", "CASH", [linea], null)).ok).toBe(true)
    expect(await getBillableAppointments(customerId)).toEqual([])
  })
})

describe("createSale · cobro desde la agenda", () => {
  it("cobrar la cita la deja hecha en la agenda", async () => {
    const cita = await crearCita(haceDias(1), "CONFIRMED")
    const linea: SaleLineInput = {
      type: "SERVICE", serviceId, description: "Presoterapia de agenda", quantity: 1,
      unitPriceCents: 6000, discountPercent: 0, totalCents: 6000,
      workerId: atiende, appointmentId: cita.id,
    }
    const res = await createSale(customerId, "SALE", "CASH", [linea], null)
    expect(res.ok).toBe(true)

    const despues = await prisma.appointment.findUniqueOrThrow({ where: { id: cita.id } })
    expect(despues.status).toBe("DONE")

    // Y la línea queda apuntando a la cita, que es lo que impide recobrarla.
    const venta = await prisma.sale.findUniqueOrThrow({ where: { id: res.id }, include: { lines: true } })
    expect(venta.lines[0].appointmentId).toBe(cita.id)
    expect(venta.lines[0].workerId).toBe(atiende)
  })

  it("no deja cobrar dos veces la misma cita", async () => {
    const cita = await crearCita(haceDias(1), "CONFIRMED")
    const linea: SaleLineInput = {
      type: "SERVICE", serviceId, description: "Presoterapia de agenda", quantity: 1,
      unitPriceCents: 6000, discountPercent: 0, totalCents: 6000,
      workerId: atiende, appointmentId: cita.id,
    }
    expect((await createSale(customerId, "SALE", "CASH", [linea], null)).ok).toBe(true)

    const segunda = await createSale(customerId, "SALE", "CASH", [linea], null)
    expect(segunda.ok).toBe(false)
    expect(segunda.error).toMatch(/ya se cobró/)

    // Y no ha quedado una venta a medias por el camino.
    expect(await prisma.sale.count({ where: { customerId } })).toBe(1)
  })
})

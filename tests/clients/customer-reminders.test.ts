import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest"

// Igual que en tests/clients/customer-actions.test.ts: las server actions leen
// la sesión vía next/headers y llaman a revalidatePath, y ninguna de las dos
// cosas existe fuera de un request real de Next.js.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}))
// vi.hoisted porque las factorías de vi.mock se suben arriba del todo y no
// pueden leer constantes normales del módulo.
const SESION = vi.hoisted(() => ({
  userId: "test-admin",
  email: "admin@test.local",
  name: "Test",
  lastName: null,
  role: "ADMIN",
  clinicId: "test-clinic",
  mustChangePassword: false,
}))

vi.mock("@/lib/auth", () => ({
  requireSession: async () => SESION,
  requireAdmin: async () => SESION,
  requireCounter: async () => SESION,
  AuthError: class AuthError extends Error {},
  authErrorResponse: () => new Response(null, { status: 401 }),
}))

// Los recordatorios apuntan quién los crea y quién los completa, así que las
// acciones piden también la sesión de la cookie, no solo requireSession().
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  getSession: async () => SESION,
}))

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import {
  saveCustomer,
  createCustomerReminder,
  getCustomerReminders,
  getCustomerReminderAlerts,
  completeCustomerReminder,
  reopenCustomerReminder,
  deleteCustomerReminder,
} from "@/lib/actions"

let clinicId: string
let customerId: string

// La fecha se manda como la escribe el formulario ("2026-08-27").
function enDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function form(campos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function crear(campos: Record<string, string>) {
  const res = await createCustomerReminder(customerId, form(campos))
  expect(res.ok).toBe(true)
  return res.id!
}

beforeAll(async () => {
  clinicId = await getActiveClinicId()
  // El id tiene que ser el mismo que el userId de la sesión simulada: los
  // recordatorios guardan quién los crea y quién los completa.
  await prisma.user.upsert({
    where: { id: "test-admin" },
    update: {},
    create: { id: "test-admin", clinicId, name: "Test", role: "ADMIN" },
  })
})

beforeEach(async () => {
  const res = await saveCustomer(null, form({ firstName: "Ana", lastName: "Martínez", phone: "600111222" }))
  customerId = res.id!
})

afterEach(async () => {
  await prisma.customerReminder.deleteMany({ where: { clinicId } })
  await prisma.customer.deleteMany({ where: { clinicId } })
})

describe("crear recordatorios", () => {
  it("guarda como permanente el que va sin fecha", async () => {
    const id = await crear({ title: "Alérgica al látex" })
    const guardado = await prisma.customerReminder.findUnique({ where: { id } })
    expect(guardado?.dueDate).toBeNull()
  })

  it("guarda la fecha del que sí la lleva", async () => {
    const id = await crear({ title: "Cita de láser", dueDate: enDias(90) })
    const guardado = await prisma.customerReminder.findUnique({ where: { id } })
    expect(guardado?.dueDate).not.toBeNull()
  })

  it("sigue exigiendo la nota", async () => {
    const res = await createCustomerReminder(customerId, form({ title: "", dueDate: enDias(10) }))
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/recordatorio/i)
  })
})

// Es la regla que decide qué salta en el TPV al elegir cliente. Si se ensancha
// de más, las empleadas acaban cerrando el aviso sin leerlo.
describe("avisos al atender al cliente", () => {
  it("el permanente avisa siempre y nunca está vencido", async () => {
    await crear({ title: "Alérgica al látex" })
    const avisos = await getCustomerReminderAlerts(customerId)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].dueDate).toBeNull()
    expect(avisos[0].overdue).toBe(false)
  })

  it("el que vence lejos todavía no avisa", async () => {
    await crear({ title: "Cita en 3 meses", dueDate: enDias(90), alertDaysBefore: "7" })
    expect(await getCustomerReminderAlerts(customerId)).toHaveLength(0)
  })

  it("avisa al entrar en su ventana de aviso", async () => {
    await crear({ title: "Cita esta semana", dueDate: enDias(3), alertDaysBefore: "7" })
    const avisos = await getCustomerReminderAlerts(customerId)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].overdue).toBe(false)
  })

  it("el vencido sigue avisando, marcado como vencido", async () => {
    await crear({ title: "Se le pasó la cita", dueDate: enDias(-1), alertDaysBefore: "7" })
    const avisos = await getCustomerReminderAlerts(customerId)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].overdue).toBe(true)
  })

  it("el completado deja de avisar", async () => {
    const id = await crear({ title: "Alérgica al látex" })
    await completeCustomerReminder(id)
    expect(await getCustomerReminderAlerts(customerId)).toHaveLength(0)
  })
})

describe("completar, reabrir y borrar", () => {
  it("completar deja constancia de quién y cuándo", async () => {
    const id = await crear({ title: "Cita de láser", dueDate: enDias(2) })
    expect((await completeCustomerReminder(id)).ok).toBe(true)
    const guardado = await prisma.customerReminder.findUnique({ where: { id } })
    expect(guardado?.completedAt).not.toBeNull()
    expect(guardado?.completedByUserId).toBe("test-admin")
  })

  it("reabrir borra el rastro de completado", async () => {
    const id = await crear({ title: "Cita de láser", dueDate: enDias(2) })
    await completeCustomerReminder(id)
    expect((await reopenCustomerReminder(id)).ok).toBe(true)
    const guardado = await prisma.customerReminder.findUnique({ where: { id } })
    expect(guardado?.completedAt).toBeNull()
    expect(guardado?.completedByUserId).toBeNull()
  })

  it("borrar lo quita de la ficha", async () => {
    const id = await crear({ title: "Me lo he inventado" })
    expect((await deleteCustomerReminder(id)).ok).toBe(true)
    expect(await getCustomerReminders(customerId)).toHaveLength(0)
  })
})

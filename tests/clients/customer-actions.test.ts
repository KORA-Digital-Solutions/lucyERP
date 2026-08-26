import { beforeAll, afterEach, describe, expect, it, vi } from "vitest"

// Igual que en tests/schedule/actions.test.ts: las server actions leen la
// sesión vía next/headers y llaman a revalidatePath, y ninguna de las dos
// cosas existe fuera de un request real de Next.js.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}))
vi.mock("@/lib/auth", () => {
  const sesion = {
    userId: "test-admin",
    email: "admin@test.local",
    name: "Test",
    lastName: null,
    role: "ADMIN",
    clinicId: "test-clinic",
    mustChangePassword: false,
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
import { saveCustomer, createCustomerQuick } from "@/lib/actions"

let clinicId: string

function form(campos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

const VALIDO = { firstName: "Ana", lastName: "Martínez", phone: "600111222" }

beforeAll(async () => {
  clinicId = await getActiveClinicId()
})

afterEach(async () => {
  await prisma.customer.deleteMany({ where: { clinicId } })
})

// El formulario ya marca nombre, primer apellido y teléfono como `required`,
// pero eso solo lo aplica el navegador. La comprobación tiene que estar también
// en el servidor, y ser la misma por los dos caminos de alta.
describe("campos obligatorios del cliente", () => {
  for (const [nombre, accion] of [
    ["saveCustomer", (fd: FormData) => saveCustomer(null, fd)],
    ["createCustomerQuick", (fd: FormData) => createCustomerQuick(fd)],
  ] as const) {
    describe(nombre, () => {
      it("rechaza el alta sin nombre", async () => {
        const res = await accion(form({ ...VALIDO, firstName: "" }))
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/nombre/i)
      })

      it("rechaza el alta sin primer apellido", async () => {
        const res = await accion(form({ ...VALIDO, lastName: "" }))
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/apellido/i)
      })

      it("rechaza el alta sin teléfono", async () => {
        const res = await accion(form({ ...VALIDO, phone: "" }))
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/tel[ée]fono/i)
      })

      it("rechaza un teléfono con formato inválido", async () => {
        const res = await accion(form({ ...VALIDO, phone: "12345" }))
        expect(res.ok).toBe(false)
      })

      it("rechaza un segundo teléfono inválido", async () => {
        const res = await accion(form({ ...VALIDO, phone2: "12345" }))
        expect(res.ok).toBe(false)
      })

      it("rechaza un número español al que le faltan dígitos", async () => {
        const res = await accion(form({ ...VALIDO, phone: "60011122" }))
        expect(res.ok).toBe(false)
      })

      it("rechaza un prefijo que no puede ser un país", async () => {
        const res = await accion(form({ ...VALIDO, phonePrefix: "9999" }))
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/prefijo/i)
      })

      it("usa el prefijo español cuando no se manda ninguno", async () => {
        // Es el caso del alta rápida del TPV, que solo manda el número.
        const res = await accion(form(VALIDO))
        expect(res.ok).toBe(true)
        const guardado = await prisma.customer.findUnique({ where: { id: res.id! } })
        expect(guardado?.phone).toBe("+34600111222")
      })

      it("respeta el prefijo de otro país", async () => {
        const res = await accion(form({ ...VALIDO, phonePrefix: "+351", phone: "912345678" }))
        expect(res.ok).toBe(true)
        const guardado = await prisma.customer.findUnique({ where: { id: res.id! } })
        expect(guardado?.phone).toBe("+351912345678")
      })

      it("acepta el alta con nombre, primer apellido y teléfono", async () => {
        const res = await accion(form(VALIDO))
        expect(res.ok).toBe(true)
      })
    })
  }

  it("saveCustomer tampoco deja vaciar el nombre al editar", async () => {
    const alta = await saveCustomer(null, form(VALIDO))
    expect(alta.ok).toBe(true)

    const res = await saveCustomer(alta.id!, form({ ...VALIDO, firstName: "  " }))
    expect(res.ok).toBe(false)

    const guardado = await prisma.customer.findUnique({ where: { id: alta.id! } })
    expect(guardado?.firstName).toBe("Ana")
  })
})

// El nº de expediente no se teclea: lo pone el sistema y va corrido.
describe("nº de expediente", () => {
  it("se asigna solo y consecutivo", async () => {
    const a = await saveCustomer(null, form({ ...VALIDO, firstName: "Primera", phone: "600111222" }))
    const b = await saveCustomer(null, form({ ...VALIDO, firstName: "Segunda", phone: "600222333" }))

    const [uno, dos] = await Promise.all([
      prisma.customer.findUnique({ where: { id: a.id! } }),
      prisma.customer.findUnique({ where: { id: b.id! } }),
    ])
    expect(dos!.fileNumber).toBe(uno!.fileNumber + 1)
  })
})

// La etiqueta de un teléfono no puede sobrevivir sin su teléfono.
describe("etiquetas de teléfono", () => {
  it("descarta la etiqueta del teléfono 2 si no hay teléfono 2", async () => {
    const res = await saveCustomer(null, form({ ...VALIDO, phone2: "", phone2Label: "Madre" }))
    expect(res.ok).toBe(true)
    const guardado = await prisma.customer.findUnique({ where: { id: res.id! } })
    expect(guardado?.phone2).toBeNull()
    expect(guardado?.phone2Label).toBeNull()
  })

  it("guarda la etiqueta cuando sí hay teléfono 2", async () => {
    const res = await saveCustomer(null, form({ ...VALIDO, phone2: "611222333", phone2Label: "Madre" }))
    expect(res.ok).toBe(true)
    const guardado = await prisma.customer.findUnique({ where: { id: res.id! } })
    expect(guardado?.phone2).toBe("+34611222333")
    expect(guardado?.phone2Label).toBe("Madre")
  })
})

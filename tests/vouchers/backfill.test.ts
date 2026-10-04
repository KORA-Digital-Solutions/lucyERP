import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

/**
 * El relleno retroactivo del precio de las sesiones de bono (M2, D2).
 *
 * Lo que se juega aquí es tocar datos reales ya cobrados: que el simulacro no
 * escriba nada, que el reparto sume al céntimo lo que costó la línea del bono,
 * que se pueda repetir sin estropear lo ya relleno y que no mueva ningún total
 * de venta.
 */

import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { preciosRetroactivos, rellenarPrecioDeSesiones } from "@/lib/voucher-backfill"

describe("preciosRetroactivos", () => {
  const dia = (n: number) => new Date(2026, 8, n)
  const tarifas = new Map([["b1|laser", { finalPriceCents: 25000, totalSessions: 3 }]])

  it("reparte el precio por orden de gasto, sumando exacto", () => {
    const precios = preciosRetroactivos([
      { id: "s3", voucherId: "b1", serviceId: "laser", usedAt: dia(20) },
      { id: "s1", voucherId: "b1", serviceId: "laser", usedAt: dia(1) },
      { id: "s2", voucherId: "b1", serviceId: "laser", usedAt: dia(10) },
    ], tarifas)
    expect([precios.get("s1"), precios.get("s2"), precios.get("s3")]).toEqual([8333, 8334, 8333])
  })

  it("lleva la cuenta por separado en cada bono y en cada servicio", () => {
    const t = new Map([
      ["b1|laser", { finalPriceCents: 9000, totalSessions: 3 }],
      ["b1|facial", { finalPriceCents: 15000, totalSessions: 5 }],
      ["b2|laser", { finalPriceCents: 6000, totalSessions: 2 }],
    ])
    const precios = preciosRetroactivos([
      { id: "a", voucherId: "b1", serviceId: "laser", usedAt: dia(1) },
      { id: "b", voucherId: "b1", serviceId: "facial", usedAt: dia(2) },
      { id: "c", voucherId: "b2", serviceId: "laser", usedAt: dia(3) },
    ], t)
    expect([precios.get("a"), precios.get("b"), precios.get("c")]).toEqual([3000, 3000, 3000])
  })

  it("una sesión de un servicio que el bono no guarda queda a cero", () => {
    const precios = preciosRetroactivos(
      [{ id: "x", voucherId: "b9", serviceId: "otro", usedAt: dia(1) }],
      tarifas,
    )
    expect(precios.get("x")).toBe(0)
  })
})

describe("rellenarPrecioDeSesiones", () => {
  let clinicId: string
  let userId: string
  let familyId: string
  let serviceId: string
  let customerId: string
  const ventas: string[] = []

  beforeAll(async () => {
    clinicId = await getActiveClinicId()
    userId = (await prisma.user.create({ data: { clinicId, name: "Relleno", role: "ADMIN", active: true } })).id
    familyId = (await prisma.serviceFamily.create({ data: { clinicId, name: "Relleno test" } })).id
    serviceId = (await prisma.service.create({
      data: { clinicId, familyId, name: "Láser relleno", durationMinutes: 20, priceCents: 9000 },
    })).id
    customerId = (await prisma.customer.create({
      data: { clinicId, fileNumber: 9401, firstName: "Relleno", lastName: "Cliente", phone: "+34600333444" },
    })).id
  })

  async function limpiar() {
    const bonos = await prisma.customerVoucher.findMany({ where: { customerId }, select: { id: true } })
    const ids = bonos.map((b) => b.id)
    await prisma.voucherSession.deleteMany({ where: { voucherId: { in: ids } } })
    await prisma.customerVoucherService.deleteMany({ where: { voucherId: { in: ids } } })
    await prisma.customerVoucher.deleteMany({ where: { id: { in: ids } } })
    await prisma.saleLine.deleteMany({ where: { saleId: { in: ventas } } })
    await prisma.sale.deleteMany({ where: { id: { in: ventas } } })
    ventas.length = 0
  }

  beforeEach(limpiar)
  afterAll(async () => {
    await limpiar()
    await prisma.customer.deleteMany({ where: { id: customerId } })
    await prisma.service.deleteMany({ where: { id: serviceId } })
    await prisma.serviceFamily.deleteMany({ where: { id: familyId } })
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  /**
   * Un bono de 3 sesiones de láser a 100 € (base 100 €, sin descuento), con
   * tantas sesiones ya gastadas como líneas se pidan, al estilo antiguo: precio
   * 0 y sin descuento. Cada una en su ticket y en su día.
   */
  async function bonoConSesionesViejas(
    lineas: { unitPriceCents: number; discountPercent: number }[],
  ) {
    const bono = await prisma.customerVoucher.create({
      data: {
        clinicId, customerId, name: "Bono relleno", pricePaidCents: 10000,
        services: { create: [{ serviceId, totalSessions: 3, basePriceCents: 10000, discountPercent: 0 }] },
      },
    })
    const lineIds: string[] = []
    for (const [i, l] of lineas.entries()) {
      const venta = await prisma.sale.create({
        data: { clinicId, customerId, userId, subtotalCents: 0, discountCents: 0, totalCents: 0, paidCents: 0 },
      })
      ventas.push(venta.id)
      const linea = await prisma.saleLine.create({
        data: {
          saleId: venta.id, type: "VOUCHER_SESSION", serviceId, description: "Láser relleno",
          quantity: 1, unitPriceCents: l.unitPriceCents, discountPercent: l.discountPercent,
          totalCents: 0, workerId: userId,
        },
      })
      lineIds.push(linea.id)
      await prisma.voucherSession.create({
        data: { voucherId: bono.id, serviceId, workerId: userId, saleLineId: linea.id, usedAt: new Date(2026, 8, 1 + i) },
      })
    }
    return lineIds
  }

  const leer = (ids: string[]) =>
    prisma.saleLine.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })

  it("el simulacro cuenta pero no escribe nada", async () => {
    const ids = await bonoConSesionesViejas([
      { unitPriceCents: 0, discountPercent: 0 }, { unitPriceCents: 0, discountPercent: 0 },
    ])
    const r = await rellenarPrecioDeSesiones(prisma, { aplicar: false })
    expect(r.rellenadas).toBe(2)
    expect(r.valorCents).toBe(3333 + 3334)

    for (const l of await leer(ids)) {
      expect(l.unitPriceCents).toBe(0)
      expect(l.discountPercent).toBe(0)
    }
  })

  it("al aplicarlo pone el precio de bono con un 100 % y las sesiones suman la línea", async () => {
    const ids = await bonoConSesionesViejas([
      { unitPriceCents: 0, discountPercent: 0 }, { unitPriceCents: 0, discountPercent: 0 },
      { unitPriceCents: 0, discountPercent: 0 },
    ])
    const r = await rellenarPrecioDeSesiones(prisma, { aplicar: true })
    expect(r.rellenadas).toBe(3)

    const lineas = await leer(ids)
    expect(lineas.every((l) => l.discountPercent === 100 && l.totalCents === 0)).toBe(true)
    expect(lineas.reduce((a, l) => a + l.unitPriceCents, 0)).toBe(10000)
  })

  it("no mueve ningún total de la venta", async () => {
    await bonoConSesionesViejas([{ unitPriceCents: 0, discountPercent: 0 }])
    await rellenarPrecioDeSesiones(prisma, { aplicar: true })

    const venta = await prisma.sale.findUnique({ where: { id: ventas[0] } })
    expect(venta!.subtotalCents).toBe(0)
    expect(venta!.discountCents).toBe(0)
    expect(venta!.totalCents).toBe(0)
  })

  it("se puede repetir: lo ya relleno no se toca", async () => {
    const ids = await bonoConSesionesViejas([
      { unitPriceCents: 0, discountPercent: 0 }, { unitPriceCents: 0, discountPercent: 0 },
    ])
    await rellenarPrecioDeSesiones(prisma, { aplicar: true })
    const primera = (await leer(ids)).map((l) => l.unitPriceCents)

    const r = await rellenarPrecioDeSesiones(prisma, { aplicar: true })
    expect(r.rellenadas).toBe(0)
    expect(r.yaValoradas).toBe(2)
    expect((await leer(ids)).map((l) => l.unitPriceCents)).toEqual(primera)
  })

  it("las sesiones nuevas ya valoradas cuentan para el orden de las viejas", async () => {
    // La primera ya se vendió con el precio nuevo (3.333); la segunda es vieja y
    // le toca la segunda parte del reparto, no la primera otra vez.
    const ids = await bonoConSesionesViejas([
      { unitPriceCents: 3333, discountPercent: 100 }, { unitPriceCents: 0, discountPercent: 0 },
    ])
    await rellenarPrecioDeSesiones(prisma, { aplicar: true })

    const porId = new Map((await leer(ids)).map((l) => [l.id, l.unitPriceCents]))
    expect(porId.get(ids[0])).toBe(3333)
    expect(porId.get(ids[1])).toBe(3334)
  })
})

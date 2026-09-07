import { describe, expect, it } from "vitest"

/**
 * El saldo tal y como lo ve el mostrador mientras se monta un ticket.
 *
 * Equivocarse a la baja aquí es lo caro: si una sesión disponible no se ofrece,
 * se le cobra otra vez a la clienta algo que ya tenía pagado, y eso el servidor
 * no lo puede impedir porque es una venta perfectamente válida. Ofrecer de más
 * sí lo para al registrar.
 */

import { voucherBalances, type VoucherBalanceInput } from "@/lib/vouchers"

const BONO: VoucherBalanceInput = {
  key: "bono:1",
  name: "Bono láser + facial",
  voucherId: "v1",
  voucherRef: null,
  services: [
    { id: "laser", name: "Láser axilas", totalSessions: 3 },
    { id: "facial", name: "Facial exprés", totalSessions: 5 },
  ],
}

/** El que se está comprando en este mismo ticket: aún no tiene id. */
const RECIEN_COMPRADO: VoucherBalanceInput = {
  ...BONO, key: "nuevo:abc", voucherId: null, voucherRef: "abc",
}

const gasta = (serviceId: string, de: VoucherBalanceInput) =>
  ({ voucherId: de.voucherId, voucherRef: de.voucherRef, serviceId })

describe("voucherBalances", () => {
  it("sin nada gastado devuelve el bono entero", () => {
    const [b] = voucherBalances([BONO], [])
    expect(b.remaining).toBe(8)
    expect(b.services.map((s) => s.remaining)).toEqual([3, 5])
  })

  it("descuenta las sesiones que ya lleva el ticket", () => {
    const [b] = voucherBalances([BONO], [gasta("laser", BONO), gasta("laser", BONO)])
    expect(b.services.find((s) => s.id === "laser")!.remaining).toBe(1)
    expect(b.services.find((s) => s.id === "facial")!.remaining).toBe(5)
    expect(b.remaining).toBe(6)
  })

  it("el servicio agotado desaparece, pero el bono sigue por el otro", () => {
    const tresDeLaser = Array.from({ length: 3 }, () => gasta("laser", BONO))
    const [b] = voucherBalances([BONO], tresDeLaser)
    expect(b.services.map((s) => s.id)).toEqual(["facial"])
    expect(b.remaining).toBe(5)
  })

  it("un bono sin nada que ofrecer se cae de la lista", () => {
    const todas = [
      ...Array.from({ length: 3 }, () => gasta("laser", BONO)),
      ...Array.from({ length: 5 }, () => gasta("facial", BONO)),
    ]
    expect(voucherBalances([BONO], todas)).toEqual([])
  })

  it("no descuenta de un bono lo que se gastó de otro", () => {
    // Mismo servicio, distinto bono: es el fallo que haría pagar dos veces.
    const gastadas = [gasta("laser", RECIEN_COMPRADO)]
    const saldos = voucherBalances([BONO, RECIEN_COMPRADO], gastadas)
    expect(saldos.find((b) => b.key === "bono:1")!.services.find((s) => s.id === "laser")!.remaining).toBe(3)
    expect(saldos.find((b) => b.key === "nuevo:abc")!.services.find((s) => s.id === "laser")!.remaining).toBe(2)
  })

  it("distingue el bono de antes del que se compra ahora aunque se llamen igual", () => {
    // Los dos tienen el mismo nombre y los mismos servicios; lo único que los
    // separa es que uno va por id y el otro por referencia del ticket.
    const saldos = voucherBalances([BONO, RECIEN_COMPRADO], [gasta("facial", BONO)])
    expect(saldos.find((b) => b.key === "bono:1")!.services.find((s) => s.id === "facial")!.remaining).toBe(4)
    expect(saldos.find((b) => b.key === "nuevo:abc")!.services.find((s) => s.id === "facial")!.remaining).toBe(5)
  })

  it("ignora las sesiones de servicios que el bono no cubre", () => {
    const [b] = voucherBalances([BONO], [{ voucherId: "v1", voucherRef: null, serviceId: "masaje" }])
    expect(b.remaining).toBe(8)
  })

  it("respeta el orden en que se le pasan los bonos", () => {
    // El TPV los manda de más antiguo a más nuevo para gastar antes lo que
    // lleva tiempo pagado; el orden es suyo, aquí solo no se toca.
    const saldos = voucherBalances([RECIEN_COMPRADO, BONO], [])
    expect(saldos.map((b) => b.key)).toEqual(["nuevo:abc", "bono:1"])
  })
})

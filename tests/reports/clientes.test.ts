import { describe, expect, it } from "vitest"
import {
  clientesInactivos, deudaPendiente, nuevasVsRecurrentes, porCliente, tarjetasRegalo,
  type ClienteDeCartera, type LineaDeInforme,
} from "@/lib/reports"

// Los informes de clientes son los que más fácil se equivocan a favor: contar
// una tarjeta regalo como gasto de quien la compra, llamar "nueva" a una
// clienta de siempre, o sacar en la lista de perdidos a quien ya tiene hora
// para la semana que viene. Cada una de esas es una llamada de teléfono que
// queda rara, así que van todas probadas.

const HOY = new Date(2026, 7, 31) // 31 de agosto de 2026
const dia = (d: number) => new Date(2026, 7, d)

function linea(p: Partial<LineaDeInforme> & { type: string; totalCents: number }): LineaDeInforme {
  return {
    saleId: "v1", quantity: 1, workerId: null, cobradoPorId: null,
    customerId: null, fecha: dia(15),
    unitPriceCents: p.totalCents,
    serviceId: null, serviceName: null, familyName: null,
    productId: null, productName: null,
    ...p,
  }
}

describe("porCliente", () => {
  it("agrupa por cliente y cuenta tickets, no líneas", () => {
    const r = porCliente([
      linea({ type: "SERVICE", totalCents: 5000, customerId: "ana", saleId: "v1", fecha: dia(1) }),
      linea({ type: "PRODUCT", totalCents: 2000, customerId: "ana", saleId: "v1", fecha: dia(1) }),
      linea({ type: "SERVICE", totalCents: 3000, customerId: "ana", saleId: "v2", fecha: dia(21) }),
    ])
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0]).toMatchObject({ customerId: "ana", tickets: 2, totalCents: 10000, ticketMedioCents: 5000 })
  })

  it("deja fuera las tarjetas regalo: comprar una no es gastarse el dinero en ti", () => {
    const r = porCliente([
      linea({ type: "SERVICE", totalCents: 4000, customerId: "ana", saleId: "v1" }),
      linea({ type: "GIFT_CARD", totalCents: 20000, customerId: "ana", saleId: "v2" }),
    ])
    expect(r.filas[0].totalCents).toBe(4000)
    expect(r.filas[0].tickets).toBe(1)
  })

  it("reparte los días entre visitas por los huecos, no por las visitas", () => {
    // Tres visitas el 1, el 11 y el 21: veinte días en dos huecos, diez de media.
    const r = porCliente([
      linea({ type: "SERVICE", totalCents: 1000, customerId: "ana", saleId: "v1", fecha: dia(1) }),
      linea({ type: "SERVICE", totalCents: 1000, customerId: "ana", saleId: "v2", fecha: dia(11) }),
      linea({ type: "SERVICE", totalCents: 1000, customerId: "ana", saleId: "v3", fecha: dia(21) }),
    ])
    expect(r.filas[0].diasEntreVisitas).toBe(10)
  })

  it("con una sola visita no inventa una frecuencia", () => {
    const r = porCliente([linea({ type: "SERVICE", totalCents: 1000, customerId: "ana" })])
    expect(r.filas[0].diasEntreVisitas).toBeNull()
    expect(r.frecuenciaMediaDias).toBeNull()
    expect(r.repiten).toBe(0)
  })

  it("las ventas sin ficha van aparte, ni repartidas ni tiradas", () => {
    const r = porCliente([
      linea({ type: "SERVICE", totalCents: 5000, customerId: "ana", saleId: "v1" }),
      linea({ type: "SERVICE", totalCents: 1500, customerId: null, saleId: "v2" }),
    ])
    expect(r.filas).toHaveLength(1)
    expect(r.sinClienteCents).toBe(1500)
    expect(r.sinClienteTickets).toBe(1)
    expect(r.gastoMedioCents).toBe(5000)
  })

  it("ordena de más gasto a menos", () => {
    const r = porCliente([
      linea({ type: "SERVICE", totalCents: 1000, customerId: "ana", saleId: "v1" }),
      linea({ type: "SERVICE", totalCents: 9000, customerId: "eva", saleId: "v2" }),
    ])
    expect(r.filas.map((f) => f.customerId)).toEqual(["eva", "ana"])
  })
})

describe("nuevasVsRecurrentes", () => {
  const desde = dia(1)
  const filas = porCliente([
    linea({ type: "SERVICE", totalCents: 6000, customerId: "ana", saleId: "v1", fecha: dia(3) }),
    linea({ type: "SERVICE", totalCents: 4000, customerId: "eva", saleId: "v2", fecha: dia(4) }),
  ]).filas

  it("es nueva quien compra por primera vez dentro del período", () => {
    const r = nuevasVsRecurrentes(filas, new Map([
      ["ana", dia(3)],          // estrena historial este mes
      ["eva", new Date(2024, 0, 9)], // viene de antes
    ]), desde)
    expect(r.nuevos).toMatchObject({ clientes: 1, totalCents: 6000 })
    expect(r.recurrentes).toMatchObject({ clientes: 1, totalCents: 4000 })
    expect(r.porcentajeNuevos).toBe(60)
  })

  it("mira toda la historia, no solo el tramo: quien ya venía no se vuelve nueva", () => {
    const r = nuevasVsRecurrentes(filas, new Map([
      ["ana", new Date(2025, 4, 1)],
      ["eva", new Date(2024, 0, 9)],
    ]), desde)
    expect(r.nuevos.clientes).toBe(0)
    expect(r.porcentajeNuevos).toBe(0)
  })

  it("sin facturación no divide entre cero", () => {
    expect(nuevasVsRecurrentes([], new Map(), desde).porcentajeNuevos).toBe(0)
  })
})

describe("clientesInactivos", () => {
  function ficha(p: Partial<ClienteDeCartera> & { id: string }): ClienteDeCartera {
    return {
      nombre: p.id,
      telefono: null,
      activo: true,
      ultimaCita: null,
      altaEn: new Date(2020, 0, 1),
      gastoHistoricoCents: 0,
      ...p,
    }
  }

  it("saca a quien pasa del umbral y deja a quien no", () => {
    const r = clientesInactivos([
      ficha({ id: "perdida", ultimaCita: new Date(2025, 7, 1) }),  // ~un año
      ficha({ id: "reciente", ultimaCita: new Date(2026, 6, 1) }), // dos meses
    ], 180, HOY)
    expect(r.filas.map((f) => f.id)).toEqual(["perdida"])
  })

  it("una cita futura cuenta como visita: esa clienta no está perdida", () => {
    const r = clientesInactivos(
      [ficha({ id: "vuelve", ultimaCita: new Date(2026, 8, 10) })],
      180, HOY,
    )
    expect(r.filas).toHaveLength(0)
  })

  it("sin ninguna cita se cuentan los días desde el alta de la ficha", () => {
    const r = clientesInactivos(
      [ficha({ id: "nunca-vino", ultimaCita: null, altaEn: new Date(2025, 0, 1) })],
      180, HOY,
    )
    expect(r.filas).toHaveLength(1)
    expect(r.sinNingunaCita).toBe(1)
  })

  it("no saca las fichas desactivadas: darlas de baja ya fue la decisión", () => {
    const r = clientesInactivos(
      [ficha({ id: "de-baja", activo: false, ultimaCita: new Date(2024, 0, 1) })],
      180, HOY,
    )
    expect(r.filas).toHaveLength(0)
  })

  it("ordena por lo que dejaban, para saber a quién llamar primero", () => {
    const vieja = new Date(2024, 0, 1)
    const r = clientesInactivos([
      ficha({ id: "poco", ultimaCita: vieja, gastoHistoricoCents: 3000 }),
      ficha({ id: "mucho", ultimaCita: vieja, gastoHistoricoCents: 90000 }),
    ], 180, HOY)
    expect(r.filas.map((f) => f.id)).toEqual(["mucho", "poco"])
    expect(r.gastoPerdidoCents).toBe(93000)
  })
})

describe("deudaPendiente", () => {
  it("descuenta lo entregado a cuenta en vez de cobrar dos veces esa parte", () => {
    const r = deudaPendiente([
      { customerId: "ana", createdAt: dia(2), totalCents: 10000, paidCents: 4000 },
    ], HOY)
    expect(r.deudaCents).toBe(6000)
  })

  it("agrupa por cliente y se queda con la deuda más antigua", () => {
    const r = deudaPendiente([
      { customerId: "ana", createdAt: dia(20), totalCents: 3000, paidCents: 0 },
      { customerId: "ana", createdAt: dia(1), totalCents: 5000, paidCents: 0 },
    ], HOY)
    expect(r.clientes).toBe(1)
    expect(r.tickets).toBe(2)
    expect(r.filas[0]).toMatchObject({ deudaCents: 8000, diasDesde: 30 })
  })

  it("ignora las ventas que ya están pagadas del todo", () => {
    const r = deudaPendiente([
      { customerId: "ana", createdAt: dia(2), totalCents: 5000, paidCents: 5000 },
    ], HOY)
    expect(r).toMatchObject({ deudaCents: 0, tickets: 0, clientes: 0 })
  })
})

describe("tarjetasRegalo", () => {
  it("separa lo vendido, lo gastado y lo que sigue vivo", () => {
    const r = tarjetasRegalo(
      [
        linea({ type: "GIFT_CARD", totalCents: 20000, quantity: 1 }),
        linea({ type: "SERVICE", totalCents: 5000 }),
      ],
      // El uso de saldo se guarda en negativo.
      [{ type: "BALANCE_USED", amountCents: -3000 }, { type: "GIFT_CARD_IN", amountCents: 20000 }],
      [{ balanceCents: 17000 }, { balanceCents: 0 }],
    )
    expect(r).toMatchObject({
      vendidoCents: 20000,
      tarjetas: 1,
      consumidoCents: 3000,
      saldoVivoCents: 17000,
      clientesConSaldo: 1,
    })
  })
})

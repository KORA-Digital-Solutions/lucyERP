import { describe, expect, it } from "vitest"
import {
  evolucionMensual, facturacionPorEmpleada, fechaDeParametro, finDeEvolucion, ranking,
  resolverPeriodo, totales, variacion, type LineaDeInforme,
} from "@/lib/reports"

// Todo esto es aritmética de calendario, que es donde se cuelan los errores que
// nadie ve: un mes que empieza el día 2, un trimestre que se come diciembre, un
// "+∞ %" en una tarjeta. Se prueba con un "hoy" fijo para que los bordes de mes
// y de año no dependan del día en que se ejecute la batería.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

describe("resolverPeriodo", () => {
  const hoy = new Date(2026, 7, 15) // 15 de agosto de 2026

  it("«este mes» va del día 1 al último, y compara contra el mes anterior", () => {
    const p = resolverPeriodo("mes", { hoy })
    expect(iso(p.desde)).toBe("2026-08-01")
    expect(iso(p.hasta)).toBe("2026-08-31")
    expect(iso(p.anterior.desde)).toBe("2026-07-01")
    expect(iso(p.anterior.hasta)).toBe("2026-07-31")
  })

  it("incluye el último instante del día, no las 00:00", () => {
    const p = resolverPeriodo("mes", { hoy })
    // Una venta cobrada a las 19:40 del día 31 tiene que entrar.
    expect(p.hasta.getHours()).toBe(23)
    expect(p.hasta > new Date(2026, 7, 31, 19, 40)).toBe(true)
  })

  it("«mes pasado» es julio y se compara contra junio", () => {
    const p = resolverPeriodo("anterior", { hoy })
    expect(iso(p.desde)).toBe("2026-07-01")
    expect(iso(p.hasta)).toBe("2026-07-31")
    expect(iso(p.anterior.desde)).toBe("2026-06-01")
  })

  it("el trimestre es el natural en curso, no los últimos tres meses", () => {
    const p = resolverPeriodo("trimestre", { hoy })
    expect(iso(p.desde)).toBe("2026-07-01")
    expect(iso(p.hasta)).toBe("2026-09-30")
    expect(iso(p.anterior.desde)).toBe("2026-04-01")
    expect(iso(p.anterior.hasta)).toBe("2026-06-30")
  })

  it("el año es el natural y se compara contra el anterior entero", () => {
    const p = resolverPeriodo("anio", { hoy })
    expect(iso(p.desde)).toBe("2026-01-01")
    expect(iso(p.hasta)).toBe("2026-12-31")
    expect(iso(p.anterior.desde)).toBe("2025-01-01")
    expect(iso(p.anterior.hasta)).toBe("2025-12-31")
  })

  it("en enero, el mes anterior es diciembre del año pasado", () => {
    const p = resolverPeriodo("mes", { hoy: new Date(2026, 0, 10) })
    expect(iso(p.anterior.desde)).toBe("2025-12-01")
    expect(iso(p.anterior.hasta)).toBe("2025-12-31")
  })

  it("el mes de 28 días no se desborda al de 31", () => {
    const p = resolverPeriodo("mes", { hoy: new Date(2026, 1, 5) })
    expect(iso(p.hasta)).toBe("2026-02-28")
  })

  describe("personalizado", () => {
    it("compara contra un tramo de la misma longitud, acabado el día antes", () => {
      const p = resolverPeriodo("personalizado", { hoy, desde: "2026-08-10", hasta: "2026-08-19" })
      expect(iso(p.desde)).toBe("2026-08-10")
      expect(iso(p.hasta)).toBe("2026-08-19")
      expect(iso(p.anterior.hasta)).toBe("2026-08-09")
      expect(iso(p.anterior.desde)).toBe("2026-07-31") // los 10 días de antes
    })

    it("endereza las fechas si se teclean del revés", () => {
      const p = resolverPeriodo("personalizado", { hoy, desde: "2026-08-19", hasta: "2026-08-10" })
      expect(iso(p.desde)).toBe("2026-08-10")
      expect(iso(p.hasta)).toBe("2026-08-19")
    })
  })
})

describe("fechaDeParametro", () => {
  it("acepta una fecha bien escrita", () => {
    expect(iso(fechaDeParametro("2026-08-31")!)).toBe("2026-08-31")
  })

  it("rechaza un día que no existe en vez de correrlo al mes siguiente", () => {
    expect(fechaDeParametro("2026-02-31")).toBeNull()
  })

  it("rechaza lo que no sea una fecha", () => {
    expect(fechaDeParametro("ayer")).toBeNull()
    expect(fechaDeParametro("")).toBeNull()
    expect(fechaDeParametro(undefined)).toBeNull()
  })
})

describe("variacion", () => {
  it("calcula el porcentaje sobre el tramo anterior", () => {
    expect(variacion(1200, 1000)).toBe(20)
    expect(variacion(800, 1000)).toBe(-20)
  })

  it("devuelve null si antes no había nada, en vez de un porcentaje infinito", () => {
    expect(variacion(5000, 0)).toBeNull()
  })
})

/* ─── Agregados ──────────────────────────────────────────────────────────── */

function linea(p: Partial<LineaDeInforme> & { type: string; totalCents: number }): LineaDeInforme {
  return {
    saleId: "v1", quantity: 1, workerId: null,
    serviceId: null, serviceName: null, familyName: null,
    productId: null, productName: null,
    ...p,
  }
}

describe("totales", () => {
  it("factura servicios y productos, y deja las tarjetas regalo aparte", () => {
    const t = totales([
      linea({ type: "SERVICE", totalCents: 6500, saleId: "v1" }),
      linea({ type: "PRODUCT", totalCents: 2000, saleId: "v1" }),
      linea({ type: "GIFT_CARD", totalCents: 5000, saleId: "v2" }),
    ])
    expect(t.totalCents).toBe(8500)
    expect(t.saldoVendidoCents).toBe(5000)
  })

  it("no cuenta como ticket una venta que solo lleva tarjeta regalo", () => {
    const t = totales([
      linea({ type: "SERVICE", totalCents: 6500, saleId: "v1" }),
      linea({ type: "GIFT_CARD", totalCents: 5000, saleId: "v2" }),
    ])
    expect(t.tickets).toBe(1)
    expect(t.ticketMedioCents).toBe(6500)
  })

  it("sin ventas devuelve ceros y no divide entre cero", () => {
    const t = totales([])
    expect(t.tickets).toBe(0)
    expect(t.ticketMedioCents).toBe(0)
  })
})

describe("facturacionPorEmpleada", () => {
  const lineas = [
    linea({ type: "SERVICE", totalCents: 6500, workerId: "marta", saleId: "v1" }),
    linea({ type: "PRODUCT", totalCents: 2000, workerId: "marta", saleId: "v1" }),
    linea({ type: "SERVICE", totalCents: 8000, workerId: "lola", saleId: "v2" }),
    linea({ type: "GIFT_CARD", totalCents: 5000, workerId: "lola", saleId: "v3" }),
    linea({ type: "PRODUCT", totalCents: 1500, workerId: null, saleId: "v4" }),
  ]

  it("ordena de más a menos y cuenta un ticket aunque tenga dos líneas", () => {
    const filas = facturacionPorEmpleada(lineas)
    expect(filas[0].workerId).toBe("marta")
    expect(filas[0].totalCents).toBe(8500)
    expect(filas[0].tickets).toBe(1)
  })

  it("no le suma a nadie la tarjeta regalo que vendió", () => {
    const lola = facturacionPorEmpleada(lineas).find((f) => f.workerId === "lola")!
    expect(lola.totalCents).toBe(8000)
  })

  it("agrupa las líneas viejas sin trabajadora en vez de descartarlas", () => {
    const filas = facturacionPorEmpleada(lineas)
    const huerfanas = filas.find((f) => f.workerId === null)!
    expect(huerfanas.productsCents).toBe(1500)
    // Lo importante: la tabla suma lo mismo que la tarjeta de facturación.
    const suma = filas.reduce((a, f) => a + f.totalCents, 0)
    expect(suma).toBe(totales(lineas).totalCents)
  })
})

describe("ranking", () => {
  it("acumula unidades e importe por concepto", () => {
    const filas = ranking([
      linea({ type: "SERVICE", totalCents: 6500, quantity: 1, serviceId: "s1", serviceName: "Facial", familyName: "Facial" }),
      linea({ type: "SERVICE", totalCents: 6500, quantity: 1, serviceId: "s1", serviceName: "Facial", familyName: "Facial" }),
      linea({ type: "SERVICE", totalCents: 2500, quantity: 1, serviceId: "s2", serviceName: "Manicura", familyName: "Manicura" }),
      linea({ type: "PRODUCT", totalCents: 9900, quantity: 1, productId: "p1", productName: "Crema" }),
    ], "SERVICE")

    expect(filas).toHaveLength(2)
    expect(filas[0]).toMatchObject({ id: "s1", nombre: "Facial", unidades: 2, totalCents: 13000 })
    expect(filas[1].id).toBe("s2")
  })
})

describe("evolucionMensual", () => {
  const hasta = new Date(2026, 7, 31)

  it("devuelve los meses pedidos en orden y pone a cero los que no tuvieron ventas", () => {
    const meses = evolucionMensual(
      [
        { createdAt: new Date(2026, 7, 3), type: "SERVICE", totalCents: 1000 },
        { createdAt: new Date(2026, 7, 20), type: "PRODUCT", totalCents: 500 },
        { createdAt: new Date(2026, 5, 10), type: "SERVICE", totalCents: 3000 },
      ],
      hasta, 4,
    )
    expect(meses.map((m) => m.clave)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"])
    expect(meses.map((m) => m.cents)).toEqual([0, 3000, 0, 1500])
  })

  it("no acaba en un mes futuro: «Año» llega a diciembre, la gráfica no", () => {
    const hoy = new Date(2026, 7, 15)
    expect(finDeEvolucion(new Date(2026, 11, 31), hoy)).toBe(hoy)
    // Y un período ya cerrado se respeta tal cual.
    const julio = new Date(2026, 6, 31)
    expect(finDeEvolucion(julio, hoy)).toBe(julio)
  })

  it("no mete las tarjetas regalo en la gráfica de facturación", () => {
    const meses = evolucionMensual(
      [{ createdAt: new Date(2026, 7, 3), type: "GIFT_CARD", totalCents: 5000 }],
      hasta, 1,
    )
    expect(meses[0].cents).toBe(0)
  })
})

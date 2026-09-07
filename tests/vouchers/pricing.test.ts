import { describe, expect, it } from "vitest"

/**
 * Las cuentas de un bono, que es lo que se puede equivocar en silencio: el
 * precio por sesión sale en pantalla al dar el bono de alta y es el número con
 * el que se decide el descuento.
 */

import {
  sessionDiscountPercent, sessionSavingsCents,
  suggestedBasePriceCents, suggestedVoucherName,
  voucherFinalPriceCents, voucherPricePerSessionCents,
  voucherRemainingSessions, voucherSavingsCents, voucherTotals,
} from "@/lib/vouchers"

describe("voucherFinalPriceCents", () => {
  it("sin descuento cobra la tarifa entera", () => {
    expect(voucherFinalPriceCents(30000, 0)).toBe(30000)
  })

  it("aplica el porcentaje sobre la tarifa", () => {
    expect(voucherFinalPriceCents(30000, 15)).toBe(25500)
  })

  it("redondea a céntimos en vez de arrastrar decimales", () => {
    // 33,33 € al 10% son 3,333 € de descuento: se cobra 29,997, no 29,9970.
    expect(voucherFinalPriceCents(3333, 10)).toBe(3000)
  })

  it("un descuento del 100% deja el bono a cero", () => {
    expect(voucherFinalPriceCents(30000, 100)).toBe(0)
  })

  it("recorta los porcentajes imposibles en vez de dar precios negativos", () => {
    expect(voucherFinalPriceCents(30000, 150)).toBe(0)
    expect(voucherFinalPriceCents(30000, -20)).toBe(30000)
  })
})

describe("voucherPricePerSessionCents", () => {
  it("reparte el precio del pack entre las sesiones", () => {
    expect(voucherPricePerSessionCents(25500, 10)).toBe(2550)
  })

  it("redondea cuando no cae exacto", () => {
    // 100 € entre 3 son 33,333…: se enseña 33,33 €. Lo que se cobra sigue
    // siendo el precio del pack, así que este redondeo no descuadra el ticket.
    expect(voucherPricePerSessionCents(10000, 3)).toBe(3333)
  })

  it("con cero sesiones devuelve cero en vez de dividir entre cero", () => {
    expect(voucherPricePerSessionCents(25500, 0)).toBe(0)
  })
})

describe("voucherSavingsCents", () => {
  it("es lo que se ahorra frente a pagar las sesiones sueltas", () => {
    expect(voucherSavingsCents(30000, 15)).toBe(4500)
  })

  it("sin descuento no se ahorra nada", () => {
    expect(voucherSavingsCents(30000, 0)).toBe(0)
  })
})

describe("voucherRemainingSessions", () => {
  it("descuenta las gastadas", () => {
    expect(voucherRemainingSessions(10, 3)).toBe(7)
  })

  it("nunca baja de cero", () => {
    // Un saldo negativo en pantalla no lo sabría interpretar nadie.
    expect(voucherRemainingSessions(10, 12)).toBe(0)
  })
})

describe("voucherTotals", () => {
  const laser = { totalSessions: 3, basePriceCents: 9000, discountPercent: 10 }
  const facial = { totalSessions: 5, basePriceCents: 15000, discountPercent: 0 }

  it("suma las sesiones y los precios de todas las líneas", () => {
    const t = voucherTotals([laser, facial])
    expect(t.totalSessions).toBe(8)
    expect(t.basePriceCents).toBe(24000)
    expect(t.finalPriceCents).toBe(23100)
    expect(t.savingsCents).toBe(900)
  })

  it("un bono sin líneas vale cero, no NaN", () => {
    expect(voucherTotals([])).toEqual({
      totalSessions: 0, basePriceCents: 0, finalPriceCents: 0, savingsCents: 0,
    })
  })

  it("aplica el descuento línea a línea, no al total", () => {
    // Si se aplicara el 10% al total, el facial también saldría rebajado.
    const t = voucherTotals([laser, facial])
    expect(t.finalPriceCents).toBe(8100 + 15000)
  })
})

describe("suggestedBasePriceCents", () => {
  it("propone lo que costarían esas sesiones sueltas", () => {
    expect(suggestedBasePriceCents(3000, 3)).toBe(9000)
  })

  it("sin sesiones no propone nada", () => {
    expect(suggestedBasePriceCents(3000, 0)).toBe(0)
  })
})

describe("suggestedVoucherName", () => {
  it("nombra el servicio y sus sesiones", () => {
    expect(suggestedVoucherName([{ serviceName: "Láser ingles", totalSessions: 3 }]))
      .toBe("Bono Láser ingles 3 sesiones")
  })

  it("pone la sesión en singular cuando es una", () => {
    expect(suggestedVoucherName([{ serviceName: "Facial", totalSessions: 1 }]))
      .toBe("Bono Facial 1 sesión")
  })

  it("encadena los servicios y nombra las sesiones si todos llevan las mismas", () => {
    expect(suggestedVoucherName([
      { serviceName: "Láser ingles", totalSessions: 3 },
      { serviceName: "Facial", totalSessions: 3 },
    ])).toBe("Bono Láser ingles + Facial 3 sesiones")
  })

  it("calla el número si cada servicio lleva sesiones distintas", () => {
    // "Bono Láser + Facial 3 sesiones" sería mentira si el facial lleva cinco.
    expect(suggestedVoucherName([
      { serviceName: "Láser ingles", totalSessions: 3 },
      { serviceName: "Facial", totalSessions: 5 },
    ])).toBe("Bono Láser ingles + Facial")
  })

  it("sin servicios no propone nombre", () => {
    expect(suggestedVoucherName([])).toBe("")
  })
})

describe("lo que se le cuenta a la clienta", () => {
  it("dice cuánto se ahorra en cada sesión frente a la tarifa suelta", () => {
    // Láser a 70 € suelto, y el bono lo deja en 56 €.
    expect(sessionSavingsCents(7000, 5600)).toBe(1400)
    expect(sessionDiscountPercent(7000, 5600)).toBe(20)
  })

  it("sin rebaja no hay nada que contar", () => {
    expect(sessionSavingsCents(7000, 7000)).toBe(0)
    expect(sessionDiscountPercent(7000, 7000)).toBe(0)
  })

  it("un bono por encima de la tarifa da ahorro negativo, no un porcentaje raro", () => {
    // Quien llama decide no enseñarlo; aquí lo que importa es no mentir.
    expect(sessionSavingsCents(7000, 8000)).toBe(-1000)
    expect(sessionDiscountPercent(7000, 8000)).toBe(-14)
  })

  it("con el servicio a cero no divide entre cero", () => {
    expect(sessionDiscountPercent(0, 5600)).toBe(0)
  })
})

import { describe, expect, it } from "vitest"
import { hoy } from "@/lib/format"

/**
 * La caja se indexa por la fecha del centro (Europe/Madrid). Con la fecha UTC,
 * una venta entre la medianoche local y la UTC caía en la caja de ayer.
 */
describe("hoy", () => {
  it("en invierno (UTC+1), a las 00:30 locales ya es el día siguiente", () => {
    // 2026-01-14 23:30 UTC = 2026-01-15 00:30 en Madrid.
    expect(hoy(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15")
  })

  it("en verano (UTC+2), a las 01:30 locales ya es el día siguiente", () => {
    // 2026-07-14 23:30 UTC = 2026-07-15 01:30 en Madrid.
    expect(hoy(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15")
  })

  it("a mediodía coincide con la fecha UTC", () => {
    expect(hoy(new Date("2026-03-10T12:00:00Z"))).toBe("2026-03-10")
  })

  it("devuelve el formato YYYY-MM-DD", () => {
    expect(hoy()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

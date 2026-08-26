import { describe, expect, it } from "vitest"
import { isValidPhone, normalizePhone } from "@/lib/format"

// Esta función decide a la vez qué se acepta en el formulario y qué se guarda
// en base de datos, así que las dos cosas no pueden discrepar: cualquier
// formato que pase isValidPhone tiene que guardarse limpio.
describe("normalizePhone", () => {
  it("le pone +34 a un número español de 9 dígitos", () => {
    expect(normalizePhone("600111222")).toBe("+34600111222")
  })

  it("ignora espacios, guiones, puntos y paréntesis", () => {
    expect(normalizePhone("600 111 222")).toBe("+34600111222")
    expect(normalizePhone("600-111-222")).toBe("+34600111222")
    expect(normalizePhone("(600) 111.222")).toBe("+34600111222")
  })

  it("convierte el 00 internacional en +", () => {
    expect(normalizePhone("0034600111222")).toBe("+34600111222")
    expect(normalizePhone("00351912345678")).toBe("+351912345678")
  })

  it("respeta el número que ya trae prefijo", () => {
    expect(normalizePhone("+34600111222")).toBe("+34600111222")
    expect(normalizePhone("+351 912 345 678")).toBe("+351912345678")
  })

  it("devuelve cadena vacía si no hay número", () => {
    // Un teléfono 2 vacío tiene que guardarse como null, no como "+".
    expect(normalizePhone("")).toBe("")
    expect(normalizePhone("   ")).toBe("")
  })

  it("todo lo que valida se guarda ya normalizado", () => {
    for (const entrada of ["600111222", "600 111 222", "600-111-222", "0034600111222", "+34600111222"]) {
      expect(isValidPhone(entrada)).toBe(true)
      expect(normalizePhone(entrada)).toBe("+34600111222")
    }
  })
})

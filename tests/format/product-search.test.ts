import { describe, expect, it } from "vitest"
import { matchesProductSearch } from "@/lib/format"

/**
 * El producto se identifica por su código (name) y se describe con su nombre
 * completo (description). Se busca por cualquiera de los dos.
 */
const crema = {
  name: "XA27_140",
  description: "Limpiador Seborregulador Reparador X.A.27 HIGIENIZANT 140ml",
}

describe("matchesProductSearch", () => {
  it("sin texto, todo coincide", () => {
    expect(matchesProductSearch(crema, "")).toBe(true)
    expect(matchesProductSearch(crema, "   ")).toBe(true)
  })

  it("encuentra por código, sin importar mayúsculas", () => {
    expect(matchesProductSearch(crema, "xa27")).toBe(true)
  })

  it("encuentra por una palabra de la descripción, sin importar acentos", () => {
    expect(matchesProductSearch(crema, "seborregulador")).toBe(true)
    expect(matchesProductSearch(crema, "HIGIENIZANT")).toBe(true)
  })

  it("exige todas las palabras, vengan del código o de la descripción", () => {
    expect(matchesProductSearch(crema, "xa27 limpiador")).toBe(true)
    expect(matchesProductSearch(crema, "xa27 hidratante")).toBe(false)
  })

  it("un producto sin descripción se encuentra por su código", () => {
    expect(matchesProductSearch({ name: "ABC_50", description: null }, "abc")).toBe(true)
    expect(matchesProductSearch({ name: "ABC_50", description: null }, "crema")).toBe(false)
  })
})

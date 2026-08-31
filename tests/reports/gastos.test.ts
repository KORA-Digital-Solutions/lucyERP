import { describe, expect, it } from "vitest"
import {
  consumoInterno, valorDeInventario,
  type MovimientoDeStock, type ProductoDeInforme,
} from "@/lib/reports"

// Los dos informes de gastos se apoyan en la misma tabla de movimientos y en el
// coste del producto, y el error fácil es contar de más: meter en el consumo de
// cabina lo que se ha vendido, o valorar la estantería a precio de venta y
// creerse rica. Eso es lo que se prueba aquí.

function producto(p: Partial<ProductoDeInforme> & { id: string }): ProductoDeInforme {
  return {
    nombre: `Producto ${p.id}`,
    proveedor: null,
    costCents: 1000,
    priceCents: 2500,
    stock: 0,
    stockMin: 0,
    activo: true,
    ...p,
  }
}

const mov = (productId: string, type: string, quantity: number): MovimientoDeStock =>
  ({ productId, type, quantity })

describe("consumoInterno", () => {
  const catalogo = [
    producto({ id: "a", nombre: "Ampollas", costCents: 800 }),
    producto({ id: "b", nombre: "Mascarillas", costCents: 250 }),
  ]

  it("suma solo lo gastado en cabina, no lo vendido ni lo que entra", () => {
    const r = consumoInterno(
      [
        mov("a", "CONSUME", 2),
        mov("a", "SALE", 5),
        mov("a", "ENTRY", 10),
        mov("a", "ADJUST", -3),
      ],
      catalogo,
    )
    expect(r.unidades).toBe(2)
    expect(r.costeCents).toBe(1600)
  })

  it("agrupa por producto y valora al coste que tiene hoy cada uno", () => {
    const r = consumoInterno(
      [mov("a", "CONSUME", 1), mov("b", "CONSUME", 4), mov("a", "CONSUME", 2)],
      catalogo,
    )
    expect(r.referencias).toBe(2)
    // Ampollas: 3 × 8 €. Mascarillas: 4 × 2,50 €.
    expect(r.filas.map((f) => [f.nombre, f.unidades, f.costeCents])).toEqual([
      ["Ampollas", 3, 2400],
      ["Mascarillas", 4, 1000],
    ])
    expect(r.costeCents).toBe(3400)
  })

  it("no se cae si el producto ya no está en el catálogo", () => {
    const r = consumoInterno([mov("fantasma", "CONSUME", 2)], catalogo)
    expect(r.filas[0].nombre).toBe("Producto borrado")
    expect(r.costeCents).toBe(0)
  })

  it("sin consumos devuelve ceros, no NaN", () => {
    const r = consumoInterno([mov("a", "SALE", 3)], catalogo)
    expect(r).toMatchObject({ unidades: 0, costeCents: 0, referencias: 0, filas: [] })
  })
})

describe("valorDeInventario", () => {
  const catalogo = [
    producto({ id: "a", nombre: "Ampollas", costCents: 800, priceCents: 2000, stock: 10, stockMin: 4 }),
    producto({ id: "b", nombre: "Mascarillas", costCents: 250, priceCents: 900, stock: 3, stockMin: 5 }),
    producto({ id: "c", nombre: "Agotado", costCents: 500, priceCents: 1500, stock: 0 }),
  ]

  it("valora a coste y deja fuera lo que no tiene existencias", () => {
    const r = valorDeInventario(catalogo, [])
    // 10 × 8 € + 3 × 2,50 €. El agotado no ocupa dinero y no sale.
    expect(r.valorCents).toBe(8750)
    expect(r.referencias).toBe(2)
    expect(r.unidades).toBe(13)
    expect(r.filas.some((f) => f.nombre === "Agotado")).toBe(false)
  })

  it("lleva el precio de venta aparte, sin mezclarlo con el coste", () => {
    const r = valorDeInventario(catalogo, [])
    expect(r.valorDeVentaCents).toBe(10 * 2000 + 3 * 900)
    expect(r.valorDeVentaCents).not.toBe(r.valorCents)
  })

  it("marca como parado lo que no ha tenido ni una salida en el período", () => {
    const r = valorDeInventario(catalogo, [mov("a", "SALE", 2), mov("a", "CONSUME", 1)])
    const ampollas = r.filas.find((f) => f.productId === "a")!
    const mascarillas = r.filas.find((f) => f.productId === "b")!
    expect(ampollas.salidas).toBe(3)
    expect(ampollas.parado).toBe(false)
    expect(mascarillas.parado).toBe(true)
    expect(r.paradoReferencias).toBe(1)
    expect(r.paradoCents).toBe(750)
  })

  it("las entradas de stock no cuentan como salida: reponer no es rotar", () => {
    const r = valorDeInventario(catalogo, [mov("b", "ENTRY", 20)])
    expect(r.filas.find((f) => f.productId === "b")!.parado).toBe(true)
  })

  it("avisa de lo que está en el mínimo o por debajo", () => {
    const r = valorDeInventario(catalogo, [])
    // Mascarillas: 3 uds con mínimo 5. Ampollas: 10 con mínimo 4.
    expect(r.bajoMinimo).toBe(1)
    expect(r.filas.find((f) => f.productId === "b")!.bajoMinimo).toBe(true)
  })

  it("un producto de baja con existencias sigue siendo dinero parado", () => {
    const r = valorDeInventario([producto({ id: "z", stock: 2, costCents: 100, activo: false })], [])
    expect(r.referencias).toBe(1)
    expect(r.valorCents).toBe(200)
  })
})

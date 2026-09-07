import { prisma } from "@/lib/db"
import { FACTURA, consumoInterno, valorDeInventario } from "@/lib/reports"
import { InformeDeGastos } from "@/components/reports/gastos"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function GastosPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  const [movimientos, productos, facturado] = await Promise.all([
    // Los movimientos de stock no llevan clinicId: se filtran por el producto.
    prisma.stockMovement.findMany({
      where: { product: { clinicId: clinic.id }, createdAt: { gte: p.desde, lte: p.hasta } },
      select: { productId: true, type: true, quantity: true },
    }),
    prisma.product.findMany({
      where: { clinicId: clinic.id },
      select: {
        id: true, name: true, costCents: true, priceCents: true,
        stock: true, stockMin: true, active: true,
        supplier: { select: { name: true } },
      },
    }),
    // Solo hace falta el total facturado, para poder decir qué porcentaje se
    // va en consumo: traerse las líneas enteras para una suma sería tirarlas.
    prisma.saleLine.aggregate({
      _sum: { totalCents: true },
      where: {
        type: { in: FACTURA },
        sale: { clinicId: clinic.id, createdAt: { gte: p.desde, lte: p.hasta } },
      },
    }),
  ])

  const catalogo = productos.map((x) => ({
    id: x.id,
    nombre: x.name,
    proveedor: x.supplier?.name ?? null,
    costCents: x.costCents,
    priceCents: x.priceCents,
    stock: x.stock,
    stockMin: x.stockMin,
    activo: x.active,
  }))

  return (
    <InformeDeGastos
      periodo={enPantalla}
      consumo={consumoInterno(movimientos, catalogo)}
      inventario={valorDeInventario(catalogo, movimientos)}
      facturacionCents={facturado._sum.totalCents ?? 0}
    />
  )
}

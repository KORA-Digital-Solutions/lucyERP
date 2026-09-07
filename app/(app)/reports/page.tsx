import { prisma } from "@/lib/db"
import { FACTURA, totales, variacion } from "@/lib/reports"
import { lineasDelPeriodo } from "@/lib/reports-data"
import { IndiceDeInformes } from "@/components/reports/indice"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function ReportsPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  // El índice solo necesita las cuatro cifras de cabecera y con qué
  // compararlas: cada informe se calcula en su propia pantalla.
  const [lineas, tramoAnterior] = await Promise.all([
    lineasDelPeriodo(clinic.id, p),
    prisma.saleLine.aggregate({
      _sum: { totalCents: true },
      where: {
        type: { in: FACTURA },
        sale: { clinicId: clinic.id, createdAt: { gte: p.anterior.desde, lte: p.anterior.hasta } },
      },
    }),
  ])

  const resumen = totales(lineas)

  return (
    <IndiceDeInformes
      periodo={enPantalla}
      resumen={resumen}
      variacion={variacion(resumen.totalCents, tramoAnterior._sum.totalCents ?? 0)}
    />
  )
}

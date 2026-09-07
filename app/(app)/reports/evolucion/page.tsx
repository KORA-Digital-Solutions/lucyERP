import { prisma } from "@/lib/db"
import { FACTURA, evolucionMensual, finDeEvolucion, inicioDeEvolucion } from "@/lib/reports"
import { InformeDeEvolucion } from "@/components/reports/evolucion"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

const MESES_DE_EVOLUCION = 6

export default async function EvolucionPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  // La gráfica acaba en el mes en curso aunque el período llegue a diciembre.
  const ultimoMes = finDeEvolucion(p.hasta)
  const inicio = inicioDeEvolucion(ultimoMes, MESES_DE_EVOLUCION)

  const filas = await prisma.saleLine.findMany({
    where: {
      type: { in: FACTURA },
      sale: { clinicId: clinic.id, createdAt: { gte: inicio, lte: p.hasta } },
    },
    select: { type: true, totalCents: true, sale: { select: { createdAt: true } } },
  })

  return (
    <InformeDeEvolucion
      periodo={enPantalla}
      meses={evolucionMensual(
        filas.map((l) => ({ createdAt: l.sale.createdAt, type: l.type, totalCents: l.totalCents })),
        ultimoMes,
        MESES_DE_EVOLUCION,
      )}
    />
  )
}

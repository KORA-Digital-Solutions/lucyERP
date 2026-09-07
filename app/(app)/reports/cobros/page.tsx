import { prisma } from "@/lib/db"
import { descuentos, formasDeCobro } from "@/lib/reports"
import { lineasDelPeriodo, usuariasDelCentro } from "@/lib/reports-data"
import { InformeDeCobros } from "@/components/reports/cobros"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function CobrosPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  const [lineas, ventas, { nombreDe }] = await Promise.all([
    lineasDelPeriodo(clinic.id, p),
    // La forma de cobro vive en la venta, no en la línea: se paga el ticket
    // entero de una manera, no cada concepto por su lado.
    prisma.sale.findMany({
      where: { clinicId: clinic.id, createdAt: { gte: p.desde, lte: p.hasta } },
      select: { paymentMethod: true, totalCents: true },
    }),
    usuariasDelCentro(clinic.id),
  ])

  const rebajas = descuentos(lineas)

  return (
    <InformeDeCobros
      periodo={enPantalla}
      cobros={formasDeCobro(ventas)}
      descuentos={{
        ...rebajas,
        filas: rebajas.filas.map((f) => ({ ...f, nombre: nombreDe(f.userId) })),
      }}
    />
  )
}

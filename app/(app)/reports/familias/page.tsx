import { ingresosPorFamilia, ranking, totales } from "@/lib/reports"
import { lineasDelPeriodo } from "@/lib/reports-data"
import { InformeDeFamilias } from "@/components/reports/familias"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function FamiliasPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)
  const lineas = await lineasDelPeriodo(clinic.id, p)

  return (
    <InformeDeFamilias
      periodo={enPantalla}
      familias={ingresosPorFamilia(lineas)}
      servicios={ranking(lineas, "SERVICE")}
      productos={ranking(lineas, "PRODUCT")}
      totalCents={totales(lineas).totalCents}
    />
  )
}

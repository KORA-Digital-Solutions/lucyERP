import { facturacionPorEmpleada, totales } from "@/lib/reports"
import { lineasDelPeriodo, usuariasDelCentro } from "@/lib/reports-data"
import { InformeDeEmpleadas } from "@/components/reports/empleadas"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function EmpleadasPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)
  const [lineas, { porId, nombreDe }] = await Promise.all([
    lineasDelPeriodo(clinic.id, p),
    usuariasDelCentro(clinic.id),
  ])

  const resumen = totales(lineas)
  const filas = facturacionPorEmpleada(lineas).map((e) => {
    const u = e.workerId ? porId.get(e.workerId) : null
    return {
      ...e,
      nombre: nombreDe(e.workerId),
      color: u?.color ?? "#9AA0A6",
      activa: u?.active ?? false,
    }
  })

  return (
    <InformeDeEmpleadas
      periodo={enPantalla}
      filas={filas}
      totalCents={resumen.totalCents}
      saldoVendidoCents={resumen.saldoVendidoCents}
      bonosVendidosCents={resumen.bonosVendidosCents}
    />
  )
}

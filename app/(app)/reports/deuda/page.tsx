import { prisma } from "@/lib/db"
import { deudaPendiente } from "@/lib/reports"
import { fichasDeCliente } from "@/lib/reports-data"
import { InformeDeDeuda } from "@/components/reports/deuda"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function DeudaPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, enPantalla } = await abrirInforme(searchParams)

  const [adeudadas, { nombreDe }] = await Promise.all([
    // La deuda no se acota al período: lo que se debe se debe hasta que se
    // paga, y un informe que la escondiera por fechas no serviría de nada.
    prisma.sale.findMany({
      where: { clinicId: clinic.id, status: "DEBT" },
      select: { customerId: true, createdAt: true, totalCents: true, paidCents: true },
    }),
    fichasDeCliente(clinic.id),
  ])

  const deuda = deudaPendiente(adeudadas)

  return (
    <InformeDeDeuda
      periodo={enPantalla}
      deuda={{
        ...deuda,
        filas: deuda.filas.map((f) => ({
          ...f,
          nombre: f.customerId ? nombreDe.get(f.customerId) ?? "Cliente borrado" : "Venta sin ficha",
          desde: f.desde.toISOString(),
        })),
      }}
    />
  )
}

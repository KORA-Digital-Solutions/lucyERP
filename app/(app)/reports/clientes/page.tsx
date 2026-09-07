import { prisma } from "@/lib/db"
import { nuevasVsRecurrentes, porCliente } from "@/lib/reports"
import { fichasDeCliente, lineasDelPeriodo } from "@/lib/reports-data"
import { InformeDeClientes } from "@/components/reports/clientes"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function ClientesPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  const [lineas, { nombreDe }, historial] = await Promise.all([
    lineasDelPeriodo(clinic.id, p),
    fichasDeCliente(clinic.id),
    // Primera compra y gasto de toda la vida, para saber quién es nueva. Se
    // cuenta el ticket de venta: las tarjetas regalo van por su propio
    // saleType y no entran aquí.
    prisma.sale.groupBy({
      by: ["customerId"],
      where: { clinicId: clinic.id, saleType: "SALE" },
      _min: { createdAt: true },
      _sum: { totalCents: true },
    }),
  ])

  const clientes = porCliente(lineas)
  const primeraCompraDe = new Map(
    historial
      .filter((h): h is typeof h & { customerId: string } => h.customerId !== null)
      .map((h) => [h.customerId, h._min.createdAt ?? p.desde]),
  )

  return (
    <InformeDeClientes
      periodo={enPantalla}
      resumen={{
        sinClienteCents: clientes.sinClienteCents,
        sinClienteTickets: clientes.sinClienteTickets,
        gastoMedioCents: clientes.gastoMedioCents,
        frecuenciaMediaDias: clientes.frecuenciaMediaDias,
        repiten: clientes.repiten,
      }}
      ranking={clientes.filas.map((f) => ({
        ...f,
        nombre: nombreDe.get(f.customerId) ?? "Cliente borrado",
        primeraCompra: f.primeraCompra.toISOString(),
        ultimaCompra: f.ultimaCompra.toISOString(),
      }))}
      captacion={nuevasVsRecurrentes(clientes.filas, primeraCompraDe, p.desde)}
    />
  )
}

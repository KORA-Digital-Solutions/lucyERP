import { prisma } from "@/lib/db"
import { clientesInactivos, type ClienteDeCartera } from "@/lib/reports"
import { fichasDeCliente } from "@/lib/reports-data"
import { InformeDeInactivos } from "@/components/reports/inactivos"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function InactivosPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, enPantalla } = await abrirInforme(searchParams)

  const [{ fichas, nombreDe }, historial, ultimaCita] = await Promise.all([
    fichasDeCliente(clinic.id),
    prisma.sale.groupBy({
      by: ["customerId"],
      where: { clinicId: clinic.id, saleType: "SALE" },
      _sum: { totalCents: true },
    }),
    // Misma definición de "última visita" que el listado de clientes: la
    // última cita de la agenda, futuras incluidas.
    prisma.appointment.groupBy({
      by: ["customerId"],
      where: { clinicId: clinic.id, status: { in: ["DONE", "CONFIRMED", "PENDING"] } },
      _max: { startAt: true },
    }),
  ])

  const gastoDe = new Map(
    historial
      .filter((h): h is typeof h & { customerId: string } => h.customerId !== null)
      .map((h) => [h.customerId, h._sum.totalCents ?? 0]),
  )
  const ultimaCitaDe = new Map(ultimaCita.map((a) => [a.customerId, a._max.startAt]))

  const cartera: ClienteDeCartera[] = fichas.map((c) => ({
    id: c.id,
    nombre: nombreDe.get(c.id) ?? "Cliente borrado",
    telefono: c.phone,
    activo: c.active,
    ultimaCita: ultimaCitaDe.get(c.id) ?? null,
    altaEn: c.createdAt,
    gastoHistoricoCents: gastoDe.get(c.id) ?? 0,
  }))

  const inactivos = clientesInactivos(cartera, clinic.inactivityWarningDays ?? 180)

  return (
    <InformeDeInactivos
      periodo={enPantalla}
      inactivos={{
        ...inactivos,
        filas: inactivos.filas.map((f) => ({
          ...f,
          ultimaCita: f.ultimaCita?.toISOString() ?? null,
        })),
      }}
    />
  )
}

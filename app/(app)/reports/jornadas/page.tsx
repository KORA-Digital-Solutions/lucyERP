import { prisma } from "@/lib/db"
import { finDeEvolucion, horasTrabajadas } from "@/lib/reports"
import { agendaDelPeriodo } from "@/lib/reports-data"
import { InformeDeJornadas } from "@/components/reports/jornadas"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function JornadasPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  // El cupo de vacaciones es anual: se mira el del año en que acaba el período.
  const anio = finDeEvolucion(p.hasta).getFullYear()

  const [{ horas, empleadas, ausencias }, ausenciasDelAnio, cupos] = await Promise.all([
    agendaDelPeriodo(clinic.id, p),
    // Del año entero, no del período: el saldo que queda es anual.
    prisma.workerLeave.findMany({
      where: { clinicId: clinic.id, date: { gte: `${anio}-01-01`, lte: `${anio}-12-31` } },
      select: { workerId: true, date: true, type: true },
    }),
    prisma.workerLeaveBalance.findMany({
      where: { clinicId: clinic.id, year: anio },
      select: { workerId: true, vacationDaysTotal: true, personalDaysTotal: true },
    }),
  ])

  const filas = horasTrabajadas(empleadas, horas, ausencias, ausenciasDelAnio, cupos)
    // Quien ni tenía horario ni faltó ningún día no estaba: la fila sobra.
    .filter((f) => f.minutos > 0 || f.vacaciones + f.asuntosPropios + f.otrasAusencias > 0)

  return <InformeDeJornadas periodo={enPantalla} filas={filas} anio={anio} />
}

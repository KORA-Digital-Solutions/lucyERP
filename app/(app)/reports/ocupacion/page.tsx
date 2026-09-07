import { prisma } from "@/lib/db"
import { cancelacionesYAusencias, ocupacionPorCabina, ocupacionPorEmpleada } from "@/lib/reports"
import { agendaDelPeriodo, citasDelPeriodo } from "@/lib/reports-data"
import { InformeDeOcupacion } from "@/components/reports/ocupacion"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function OcupacionPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  const [{ dias, horas, empleadas }, citas, cabinas] = await Promise.all([
    agendaDelPeriodo(clinic.id, p),
    citasDelPeriodo(clinic.id, p),
    prisma.cabin.findMany({
      where: { clinicId: clinic.id, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ])

  return (
    <InformeDeOcupacion
      periodo={enPantalla}
      empleadas={ocupacionPorEmpleada(citas, horas, empleadas)}
      cabinas={ocupacionPorCabina(citas, horas, cabinas.map((c) => ({ id: c.id, nombre: c.name })))}
      citas={cancelacionesYAusencias(citas)}
      minutosCentro={horas.minutosCentro}
      diasAbiertos={horas.diasAbiertos}
      // Con el período en el futuro no hay actividad que enseñar, y decirlo es
      // más honesto que pintar un montón de ceros.
      diasContados={dias.length}
    />
  )
}

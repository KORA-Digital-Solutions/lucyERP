import { prisma } from "@/lib/db"
import { tarjetasRegalo } from "@/lib/reports"
import { fichasDeCliente, lineasDelPeriodo } from "@/lib/reports-data"
import { InformeDeSaldo } from "@/components/reports/saldo"

import { abrirInforme, type ParamsDeInforme } from "@/lib/reports-data"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

export default async function SaldoPage({ searchParams }: { searchParams: ParamsDeInforme }) {
  const { clinic, p, enPantalla } = await abrirInforme(searchParams)

  const [lineas, movimientos, { fichas }] = await Promise.all([
    lineasDelPeriodo(clinic.id, p),
    prisma.customerBalanceMovement.findMany({
      where: { clinicId: clinic.id, createdAt: { gte: p.desde, lte: p.hasta } },
      select: { type: true, amountCents: true },
    }),
    fichasDeCliente(clinic.id),
  ])

  return (
    <InformeDeSaldo
      periodo={enPantalla}
      tarjetas={tarjetasRegalo(lineas, movimientos, fichas)}
    />
  )
}

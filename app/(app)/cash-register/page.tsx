import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { CashRegisterClient } from "@/components/cash-register-client"

export const dynamic = "force-dynamic"

export default async function CashRegisterPage() {
  const clinic = await getActiveClinic()
  const today = new Date().toISOString().slice(0, 10)

  const [todayRegister, history] = await Promise.all([
    prisma.cashRegister.findUnique({
      where: { clinicId_date: { clinicId: clinic.id, date: today } },
      include: { closedBy: true },
    }),
    prisma.cashRegister.findMany({
      where: { clinicId: clinic.id },
      include: { closedBy: true },
      orderBy: { date: "desc" },
      take: 30,
    }),
  ])

  // Opening cash for today = closingKeptCents of last closed register
  const lastClosed = await prisma.cashRegister.findFirst({
    where: { clinicId: clinic.id, status: "CLOSED" },
    orderBy: { date: "desc" },
  })

  // Mientras no haya ni un PIN repartido se sigue como hasta ahora, con el
  // usuario de la sesión (ver requireOperator en lib/auth.ts).
  const conPin = await prisma.user.count({
    where: { clinicId: clinic.id, active: true, NOT: { pinHash: null } },
  })

  return (
    <CashRegisterClient
      todayRegister={todayRegister as any}
      history={history as any}
      suggestedOpeningCents={lastClosed?.closingKeptCents ?? 0}
      today={today}
      pinRequired={conPin > 0}
    />
  )
}

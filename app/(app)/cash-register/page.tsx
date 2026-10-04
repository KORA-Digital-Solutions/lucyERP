import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { hoy } from "@/lib/format"
import { CashRegisterClient } from "@/components/cash-register-client"

export const dynamic = "force-dynamic"

// En el mostrador solo se ve la caja de hoy. El historial completo, con el
// detalle de cada día y las correcciones, vive en la gestión (/cash-registers).
export default async function CashRegisterPage() {
  const clinic = await getActiveClinic()
  const today = hoy()

  const todayRegister = await prisma.cashRegister.findUnique({
    where: { clinicId_date: { clinicId: clinic.id, date: today } },
    include: {
      closedBy: true,
      edits: { orderBy: { createdAt: "desc" }, take: 1, include: { editedBy: true } },
    },
  })

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

  const { edits = [], ...registro } = todayRegister ?? {}
  const ultima = edits[0]
  const editCount = todayRegister
    ? await prisma.cashRegisterEdit.count({ where: { cashRegisterId: todayRegister.id } })
    : 0

  return (
    <CashRegisterClient
      todayRegister={todayRegister ? (registro as any) : null}
      lastEdit={
        ultima
          ? {
              byName: [ultima.editedBy.name, ultima.editedBy.lastName].filter(Boolean).join(" "),
              at: ultima.createdAt.toISOString(),
              count: editCount,
            }
          : null
      }
      suggestedOpeningCents={lastClosed?.closingKeptCents ?? 0}
      today={today}
      pinRequired={conPin > 0}
    />
  )
}

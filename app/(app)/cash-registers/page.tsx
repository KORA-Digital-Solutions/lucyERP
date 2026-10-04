import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { hoy, parseDateParam } from "@/lib/format"
import { CashRegistersClient, type CashRegisterRow } from "@/components/cash-registers-client"

export const dynamic = "force-dynamic"

interface SearchParams {
  from?: string
  to?: string
}

const nombre = (u: { name: string; lastName: string | null }) =>
  [u.name, u.lastName].filter(Boolean).join(" ")

// Historial de cajas para la gestión: el mostrador solo ve la de hoy. Es de
// consulta; cualquier corrección se hace en el mostrador, el mismo día, y aquí
// queda a la vista con quién la hizo y cómo estaba antes.
export default async function CashRegistersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { from, to } = await searchParams
  const clinic = await getActiveClinic()

  // Las cajas se indexan por "YYYY-MM-DD" (ver hoy()), así que se filtra por
  // texto: el orden alfabético de una fecha ISO es el cronológico.
  const hace30Dias = new Date()
  hace30Dias.setDate(hace30Dias.getDate() - 30)
  const hasta = hoy()
  const desde = hoy(hace30Dias)
  const fromStr = parseDateParam(from, desde)
  const toStr = parseDateParam(to, hasta)

  const cajas = await prisma.cashRegister.findMany({
    where: { clinicId: clinic.id, date: { gte: fromStr, lte: toStr } },
    orderBy: { date: "desc" },
    include: {
      closedBy: true,
      edits: { orderBy: { createdAt: "asc" }, include: { editedBy: true } },
    },
  })

  const rows: CashRegisterRow[] = cajas.map((c) => ({
    id: c.id,
    date: c.date,
    status: c.status,
    openingCashCents: c.openingCashCents,
    totalCashCents: c.totalCashCents,
    totalCardCents: c.totalCardCents,
    closingDeclaredCents: c.closingDeclaredCents,
    closingKeptCents: c.closingKeptCents,
    differenceCents: c.differenceCents,
    denominationNotes: c.denominationNotes,
    closedAt: c.closedAt?.toISOString() ?? null,
    closedByName: c.closedBy ? nombre(c.closedBy) : null,
    edits: c.edits.map((e) => ({
      id: e.id,
      at: e.createdAt.toISOString(),
      byName: nombre(e.editedBy),
      declaredBeforeCents: e.declaredBeforeCents,
      declaredAfterCents: e.declaredAfterCents,
      keptBeforeCents: e.keptBeforeCents,
      keptAfterCents: e.keptAfterCents,
      differenceBeforeCents: e.differenceBeforeCents,
      differenceAfterCents: e.differenceAfterCents,
      notesBefore: e.notesBefore,
      notesAfter: e.notesAfter,
    })),
  }))

  return <CashRegistersClient rows={rows} defaultFrom={fromStr} defaultTo={toStr} />
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { validateAppointmentSlot } from "@/lib/availability"
import { dayRange, toDateInputValue } from "@/lib/format"


// GET /api/appointments?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const clinicId = await getActiveClinicId()
  const date = req.nextUrl.searchParams.get("date") ?? toDateInputValue(new Date())
  const { start, end } = dayRange(date)

  const appointments = await prisma.appointment.findMany({
    where: { clinicId, startAt: { gte: start, lte: end } },
    include: { customer: true, service: true, worker: true, cabin: true },
    orderBy: { startAt: "asc" },
  })
  return NextResponse.json(appointments)
}

// POST /api/appointments
export async function POST(req: NextRequest) {
  try {
    const clinicId = await getActiveClinicId()
    const body = await req.json()
    const service = await prisma.service.findUniqueOrThrow({ where: { id: body.serviceId } })
    const duration = Number(body.durationMinutes) || service.durationMinutes
    const startAt = new Date(body.startAt)
    const endAt = new Date(startAt.getTime() + duration * 60000)

    const conflicts = await validateAppointmentSlot({
      cabinId: body.cabinId,
      workerId: body.workerId,
      startAt,
      endAt,
    })
    if (conflicts.length > 0) {
      return NextResponse.json({ error: conflicts.map((c) => c.message).join(" ") }, { status: 409 })
    }

    const appt = await prisma.appointment.create({
      data: {
        clinicId,
        customerId: body.customerId,
        serviceId: body.serviceId,
        workerId: body.workerId,
        cabinId: body.cabinId,
        startAt,
        endAt,
        durationMinutes: duration,
        status: body.status ?? "PENDING",
        reminderStatus: "PENDING",
        notes: body.notes ?? null,
      },
    })
    return NextResponse.json(appt, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 400 })
  }
}

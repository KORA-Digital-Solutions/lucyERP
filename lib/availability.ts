import { prisma } from "@/lib/db"

// Servicio de disponibilidad (Fase 1): control de solapamientos de cabina y
// trabajador. Las citas CANCELLED no bloquean hueco (RF-CABIN-04, RN 19.3).

const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "DONE", "NO_SHOW"]

type Conflict = { type: "CABIN" | "WORKER"; message: string }

async function findOverlap(
  field: "cabinId" | "workerId",
  id: string,
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string,
) {
  return prisma.appointment.findFirst({
    where: {
      [field]: id,
      status: { in: BLOCKING_STATUSES },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      // Solapan si: nuevo.start < existente.end AND nuevo.end > existente.start
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    include: { customer: true },
  })
}

export async function checkCabinAvailability(
  cabinId: string,
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string,
): Promise<boolean> {
  return !(await findOverlap("cabinId", cabinId, startAt, endAt, excludeAppointmentId))
}

export async function checkWorkerAvailability(
  workerId: string,
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string,
): Promise<boolean> {
  return !(await findOverlap("workerId", workerId, startAt, endAt, excludeAppointmentId))
}

export interface SlotInput {
  cabinId: string
  workerId: string
  startAt: Date
  endAt: Date
  excludeAppointmentId?: string
}

// Valida un hueco completo. Devuelve la lista de conflictos (vacía = OK).
export async function validateAppointmentSlot(input: SlotInput): Promise<Conflict[]> {
  const conflicts: Conflict[] = []

  if (input.endAt <= input.startAt) {
    conflicts.push({ type: "CABIN", message: "La hora de fin debe ser posterior a la de inicio." })
    return conflicts
  }

  const cabinClash = await findOverlap("cabinId", input.cabinId, input.startAt, input.endAt, input.excludeAppointmentId)
  if (cabinClash) {
    conflicts.push({
      type: "CABIN",
      message: "La cabina ya está ocupada en ese horario.",
    })
  }

  const workerClash = await findOverlap("workerId", input.workerId, input.startAt, input.endAt, input.excludeAppointmentId)
  if (workerClash) {
    conflicts.push({
      type: "WORKER",
      message: "El trabajador ya tiene una cita en ese horario.",
    })
  }

  return conflicts
}

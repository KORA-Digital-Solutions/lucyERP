import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"

export { getActiveClinicId }

export async function createWorker(clinicId: string, name: string) {
  return prisma.user.create({
    data: { clinicId, name, role: "WORKER", active: true },
  })
}

export async function deleteWorkers(workerIds: string[]) {
  if (workerIds.length === 0) return
  await prisma.workerScheduleOverride.deleteMany({ where: { workerId: { in: workerIds } } })
  await prisma.workerWeeklySlot.deleteMany({ where: { workerId: { in: workerIds } } })
  await prisma.workerLeave.deleteMany({ where: { workerId: { in: workerIds } } })
  await prisma.workerLeaveBalance.deleteMany({ where: { workerId: { in: workerIds } } })
  await prisma.user.deleteMany({ where: { id: { in: workerIds } } })
}

// Limpia todas las filas de horario/vacaciones/festivos de la clínica de
// test entre casos, sin tocar la fila Clinic en sí (getActiveClinic() la
// necesita viva durante toda la batería).
export async function resetScheduleData(clinicId: string) {
  await prisma.clinicScheduleOverride.deleteMany({ where: { clinicId } })
  await prisma.workerScheduleOverride.deleteMany({ where: { clinicId } })
  await prisma.clinicWeeklySlot.deleteMany({ where: { clinicId } })
  await prisma.workerWeeklySlot.deleteMany({ where: { clinicId } })
  await prisma.holiday.deleteMany({ where: { clinicId } })
  await prisma.workerLeave.deleteMany({ where: { clinicId } })
  await prisma.workerLeaveBalance.deleteMany({ where: { clinicId } })
}

export async function setClinicWeekly(clinicId: string, dayOfWeek: number, slots: { startTime: string; endTime: string }[]) {
  for (const s of slots) {
    await prisma.clinicWeeklySlot.create({ data: { clinicId, dayOfWeek, startTime: s.startTime, endTime: s.endTime } })
  }
}

export async function setWorkerWeekly(clinicId: string, workerId: string, dayOfWeek: number, slots: { startTime: string; endTime: string }[]) {
  for (const s of slots) {
    await prisma.workerWeeklySlot.create({ data: { clinicId, workerId, dayOfWeek, startTime: s.startTime, endTime: s.endTime } })
  }
}

// Semana fija conocida (17-23 agosto 2026) para no depender del reloj del test.
export const TUESDAY = "2026-08-18"
export const TUESDAY_DOW = 2
export const WEDNESDAY = "2026-08-19"
export const WEDNESDAY_DOW = 3
export const THURSDAY = "2026-08-20"
export const THURSDAY_DOW = 4
export const SATURDAY = "2026-08-22"
export const SUNDAY = "2026-08-23"

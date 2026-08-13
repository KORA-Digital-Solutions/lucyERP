import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest"

// addWorkerLeaveRange lee la sesión vía next/headers::cookies() y varias
// acciones llaman revalidatePath — ninguna de las dos funciona fuera de un
// request real de Next.js, así que se sustituyen por no-ops para poder
// probar las server actions directamente.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}))

// vi.mock() se hoista al principio del módulo, así que estos imports
// estáticos ya reciben next/headers y next/cache mockeados.
import { prisma } from "@/lib/db"
import { getEffectiveWorkerHours, getEffectiveClinicHours } from "@/lib/schedule"
import {
  saveWorkerScheduleOverride,
  saveClinicScheduleOverride,
  deleteWorkerScheduleOverride,
  deleteClinicScheduleOverride,
  saveHoliday,
  addWorkerLeaveRange,
  deleteWorkerLeave,
  saveLeaveBalance,
} from "@/lib/actions"
import {
  createWorker,
  deleteWorkers,
  getActiveClinicId,
  resetScheduleData,
  setWorkerWeekly,
  TUESDAY,
  TUESDAY_DOW,
  WEDNESDAY,
  THURSDAY,
  THURSDAY_DOW,
  SATURDAY,
} from "../helpers"

describe("lib/actions — server actions de horario/excepciones/vacaciones", () => {
  let clinicId: string
  let workerId: string

  beforeAll(async () => {
    clinicId = await getActiveClinicId()
  })

  afterAll(async () => {
    await deleteWorkers([workerId])
  })

  beforeEach(async () => {
    await resetScheduleData(clinicId)
    if (workerId) {
      await prisma.workerScheduleOverride.deleteMany({ where: { workerId } })
    } else {
      const w = await createWorker(clinicId, "Empleada test")
      workerId = w.id
    }
  })

  describe("excepción de empleada: cambio de turno, no ausencia", () => {
    it("admite closed=true (cambio de turno) sin tocar vacaciones ni su saldo", async () => {
      const res = await saveWorkerScheduleOverride(workerId, WEDNESDAY, true, [], "Cambia turno esta semana")
      expect(res.ok).toBe(true)
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([])
      const leave = await prisma.workerLeave.findFirst({ where: { workerId, date: WEDNESDAY } })
      expect(leave).toBeNull()
    })

    it(
      "caso Lola: trabaja un martes que normalmente libra y libra un jueves que normalmente trabaja, " +
        "sin generar ningún WorkerLeave (no es una ausencia)",
      async () => {
        await setWorkerWeekly(clinicId, workerId, THURSDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
        // Martes: normalmente no trabaja (sin WorkerWeeklySlot) → excepción que añade franjas.
        await saveWorkerScheduleOverride(workerId, TUESDAY, false, [{ startTime: "09:00", endTime: "17:00" }], "Cambia turno")
        // Jueves: normalmente sí trabaja → excepción que lo cierra.
        await saveWorkerScheduleOverride(workerId, THURSDAY, true, [], "Cambia turno")

        expect(await getEffectiveWorkerHours(workerId, TUESDAY)).toEqual([{ startTime: "09:00", endTime: "17:00" }])
        expect(await getEffectiveWorkerHours(workerId, THURSDAY)).toEqual([])
        const leaves = await prisma.workerLeave.findMany({ where: { workerId, date: { in: [TUESDAY, THURSDAY] } } })
        expect(leaves).toHaveLength(0)
      },
    )

    it("acepta franjas parciales y el resolver las recoge", async () => {
      const res = await saveWorkerScheduleOverride(workerId, WEDNESDAY, false, [{ startTime: "10:00", endTime: "13:00" }], "Cita médica")
      expect(res.ok).toBe(true)
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "10:00", endTime: "13:00" }])
    })

    it("guardar dos veces para la misma fecha actualiza (upsert), no duplica", async () => {
      await saveWorkerScheduleOverride(workerId, WEDNESDAY, false, [{ startTime: "10:00", endTime: "13:00" }], null)
      await saveWorkerScheduleOverride(workerId, WEDNESDAY, false, [{ startTime: "11:00", endTime: "15:00" }], null)
      const rows = await prisma.workerScheduleOverride.findMany({ where: { workerId, date: WEDNESDAY } })
      expect(rows).toHaveLength(1)
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "11:00", endTime: "15:00" }])
    })

    it("deleteWorkerScheduleOverride revierte al horario semanal", async () => {
      const res = await saveWorkerScheduleOverride(workerId, WEDNESDAY, false, [{ startTime: "10:00", endTime: "13:00" }], null)
      await deleteWorkerScheduleOverride(res.id!)
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([])
    })
  })

  describe("excepción de centro: sigue admitiendo día completo cerrado", () => {
    it("closed=true cierra el centro ese día", async () => {
      const res = await saveClinicScheduleOverride(WEDNESDAY, true, [], "Cierre excepcional")
      expect(res.ok).toBe(true)
      const hours = await getEffectiveClinicHours(clinicId, WEDNESDAY)
      expect(hours).toEqual([])
    })

    it("reabre un festivo con franjas concretas", async () => {
      await saveHoliday(null, holidayForm(WEDNESDAY, "Festivo local"))
      await saveClinicScheduleOverride(WEDNESDAY, false, [{ startTime: "10:00", endTime: "14:00" }], null)
      const hours = await getEffectiveClinicHours(clinicId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "10:00", endTime: "14:00" }])
    })

    it("deleteClinicScheduleOverride en un festivo lo vuelve a cerrar", async () => {
      await saveHoliday(null, holidayForm(WEDNESDAY, "Festivo local"))
      const res = await saveClinicScheduleOverride(WEDNESDAY, false, [{ startTime: "10:00", endTime: "14:00" }], null)
      await deleteClinicScheduleOverride(res.id!)
      const hours = await getEffectiveClinicHours(clinicId, WEDNESDAY)
      expect(hours).toEqual([])
    })
  })

  describe("vacaciones ↔ festivos: addWorkerLeaveRange", () => {
    beforeEach(async () => {
      await saveLeaveBalance(workerId, 2026, 5, 2)
    })

    it("salta fines de semana automáticamente y no descuenta saldo por ellos", async () => {
      // Lunes 17 a domingo 23 de agosto 2026: 5 laborables + sáb/dom.
      const res = await addWorkerLeaveRange(workerId, "2026-08-17", "2026-08-23", "VACATION", null)
      expect(res.ok).toBe(true)
      expect(res.assignedCount).toBe(5)
      expect(res.skippedWeekendCount).toBe(2)
    })

    it("salta festivos automáticamente y no los cuenta como día usado", async () => {
      await saveHoliday(null, holidayForm("2026-08-19", "Festivo entre semana"))
      const res = await addWorkerLeaveRange(workerId, "2026-08-17", "2026-08-21", "VACATION", null)
      expect(res.ok).toBe(true)
      expect(res.assignedCount).toBe(4)
      expect(res.skippedHolidayCount).toBe(1)
      const leave = await prisma.workerLeave.findFirst({ where: { workerId, date: "2026-08-19" } })
      expect(leave).toBeNull()
    })

    it("un rango que cae entero en fin de semana/festivo no crea nada y da error", async () => {
      const res = await addWorkerLeaveRange(workerId, SATURDAY, SATURDAY, "VACATION", null)
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/laborable/i)
    })

    it("respeta el saldo anual y falla al superarlo", async () => {
      // Saldo de vacaciones = 5 días (ver beforeEach). Lunes-viernes = 5 ok.
      await addWorkerLeaveRange(workerId, "2026-08-17", "2026-08-21", "VACATION", null)
      const res = await addWorkerLeaveRange(workerId, "2026-08-24", "2026-08-24", "VACATION", null)
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/Saldo insuficiente/i)
    })

    it("no permite duplicar un día que ya tiene vacaciones asignadas", async () => {
      await addWorkerLeaveRange(workerId, WEDNESDAY, WEDNESDAY, "VACATION", null)
      const res = await addWorkerLeaveRange(workerId, WEDNESDAY, WEDNESDAY, "PERSONAL", null)
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/Ya hay día/i)
    })

    it("tras asignar vacaciones, el resolver cierra ese día de inmediato", async () => {
      await addWorkerLeaveRange(workerId, WEDNESDAY, WEDNESDAY, "VACATION", null)
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([])
    })

    it("las vacaciones ganan a una excepción de horario ya guardada para el mismo día", async () => {
      await saveWorkerScheduleOverride(workerId, WEDNESDAY, false, [{ startTime: "10:00", endTime: "13:00" }], null)
      await addWorkerLeaveRange(workerId, WEDNESDAY, WEDNESDAY, "VACATION", null)
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([])
    })

    it("deleteWorkerLeave revierte al horario que hubiera debajo (excepción o semanal)", async () => {
      await saveWorkerScheduleOverride(workerId, WEDNESDAY, false, [{ startTime: "10:00", endTime: "13:00" }], null)
      await addWorkerLeaveRange(workerId, WEDNESDAY, WEDNESDAY, "VACATION", null)
      const leave = await prisma.workerLeave.findFirstOrThrow({ where: { workerId, date: WEDNESDAY } })
      await deleteWorkerLeave(leave.id)
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "10:00", endTime: "13:00" }])
    })
  })
})

function holidayForm(date: string, name: string): FormData {
  const fd = new FormData()
  fd.set("date", date)
  fd.set("name", name)
  fd.set("scope", "LOCAL")
  return fd
}

import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import {
  getEffectiveClinicHours,
  getEffectiveWorkerHours,
  getEffectiveWorkingHours,
} from "@/lib/schedule"
import {
  createWorker,
  deleteWorkers,
  getActiveClinicId,
  resetScheduleData,
  setClinicWeekly,
  setWorkerWeekly,
  WEDNESDAY,
  WEDNESDAY_DOW,
  SATURDAY,
} from "../helpers"

// Batería del motor de resolución (lib/schedule.ts): cómo se combinan
// horario semanal, excepciones puntuales, festivos y vacaciones para dar el
// horario "efectivo" de un día concreto. Esta es la lógica que realmente
// sincroniza los tres conceptos — la UI solo escribe/lee estas mismas tablas.
describe("lib/schedule — resolución de horario efectivo", () => {
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
      await prisma.workerWeeklySlot.deleteMany({ where: { workerId } })
    } else {
      const w = await createWorker(clinicId, "Empleada test")
      workerId = w.id
    }
  })

  describe("centro", () => {
    it("usa el horario semanal cuando no hay festivo ni excepción", async () => {
      await setClinicWeekly(clinicId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "20:00" }])
      const hours = await getEffectiveClinicHours(clinicId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "09:00", endTime: "20:00" }])
    })

    it("un día sin franjas semanales (fin de semana) da cerrado", async () => {
      const hours = await getEffectiveClinicHours(clinicId, SATURDAY)
      expect(hours).toEqual([])
    })

    it("un festivo cierra el centro aunque haya horario semanal ese día", async () => {
      await setClinicWeekly(clinicId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "20:00" }])
      await prisma.holiday.create({ data: { clinicId, date: WEDNESDAY, name: "Festivo local" } })
      const hours = await getEffectiveClinicHours(clinicId, WEDNESDAY)
      expect(hours).toEqual([])
    })

    it("una excepción puntual manda sobre el festivo (reabrir un festivo)", async () => {
      await prisma.holiday.create({ data: { clinicId, date: WEDNESDAY, name: "Festivo local" } })
      await prisma.clinicScheduleOverride.create({
        data: {
          clinicId,
          date: WEDNESDAY,
          closed: false,
          slots: { create: [{ startTime: "10:00", endTime: "14:00" }] },
        },
      })
      const hours = await getEffectiveClinicHours(clinicId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "10:00", endTime: "14:00" }])
    })

    it("una excepción puntual manda sobre el horario semanal aunque no haya festivo", async () => {
      await setClinicWeekly(clinicId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "20:00" }])
      await prisma.clinicScheduleOverride.create({ data: { clinicId, date: WEDNESDAY, closed: true } })
      const hours = await getEffectiveClinicHours(clinicId, WEDNESDAY)
      expect(hours).toEqual([])
    })
  })

  describe("empleada", () => {
    it("usa su horario semanal cuando no hay excepción ni vacaciones", async () => {
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "09:00", endTime: "17:00" }])
    })

    it("un festivo del centro NO afecta su resolución individual", async () => {
      // getEffectiveWorkerHours nunca consulta Holiday (por diseño, ver
      // comentario en lib/schedule.ts) — el cierre del festivo lo aporta
      // solo el lado del centro; la intersección es la que se cierra.
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      await prisma.holiday.create({ data: { clinicId, date: WEDNESDAY, name: "Festivo local" } })
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "09:00", endTime: "17:00" }])
    })

    it("una excepción puntual (franjas) sustituye su horario semanal ese día", async () => {
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      await prisma.workerScheduleOverride.create({
        data: {
          clinicId,
          workerId,
          date: WEDNESDAY,
          closed: false,
          slots: { create: [{ startTime: "12:00", endTime: "16:00" }] },
        },
      })
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "12:00", endTime: "16:00" }])
    })

    it("las vacaciones (WorkerLeave) ganan a una excepción puntual con franjas ese mismo día", async () => {
      // Escenario clave de sincronización: si por lo que sea existe una
      // excepción de horario Y un día de vacaciones para la misma fecha
      // (p.ej. datos antiguos de antes del fix, o insertados fuera de la UI),
      // las vacaciones deben ganar siempre — un día libre es un día libre.
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      await prisma.workerScheduleOverride.create({
        data: {
          clinicId,
          workerId,
          date: WEDNESDAY,
          closed: false,
          slots: { create: [{ startTime: "12:00", endTime: "16:00" }] },
        },
      })
      await prisma.workerLeave.create({ data: { clinicId, workerId, date: WEDNESDAY, type: "VACATION" } })
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([])
    })

    it("las vacaciones cierran el día aunque el horario semanal tuviera franjas", async () => {
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      await prisma.workerLeave.create({ data: { clinicId, workerId, date: WEDNESDAY, type: "PERSONAL" } })
      const hours = await getEffectiveWorkerHours(workerId, WEDNESDAY)
      expect(hours).toEqual([])
    })
  })

  describe("intersección (huecos reales para agendar)", () => {
    it("es la intersección de centro y empleada cuando ambos abren", async () => {
      await setClinicWeekly(clinicId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "14:00" }])
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "12:00", endTime: "20:00" }])
      const hours = await getEffectiveWorkingHours(clinicId, workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "12:00", endTime: "14:00" }])
    })

    it("da vacío si el centro está cerrado por festivo aunque la empleada tenga horario normal", async () => {
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      await prisma.holiday.create({ data: { clinicId, date: WEDNESDAY, name: "Festivo local" } })
      const hours = await getEffectiveWorkingHours(clinicId, workerId, WEDNESDAY)
      expect(hours).toEqual([])
    })

    it("da vacío si la empleada está de vacaciones aunque el centro esté abierto", async () => {
      await setClinicWeekly(clinicId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "20:00" }])
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      await prisma.workerLeave.create({ data: { clinicId, workerId, date: WEDNESDAY, type: "VACATION" } })
      const hours = await getEffectiveWorkingHours(clinicId, workerId, WEDNESDAY)
      expect(hours).toEqual([])
    })

    it("reabrir el centro un festivo devuelve a la empleada su horario normal (intersección completa)", async () => {
      await setClinicWeekly(clinicId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "20:00" }])
      await setWorkerWeekly(clinicId, workerId, WEDNESDAY_DOW, [{ startTime: "09:00", endTime: "17:00" }])
      await prisma.holiday.create({ data: { clinicId, date: WEDNESDAY, name: "Festivo local" } })
      await prisma.clinicScheduleOverride.create({
        data: {
          clinicId,
          date: WEDNESDAY,
          closed: false,
          slots: { create: [{ startTime: "09:00", endTime: "20:00" }] },
        },
      })
      const hours = await getEffectiveWorkingHours(clinicId, workerId, WEDNESDAY)
      expect(hours).toEqual([{ startTime: "09:00", endTime: "17:00" }])
    })
  })
})

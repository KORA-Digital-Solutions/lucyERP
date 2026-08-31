import { describe, expect, it } from "vitest"
import {
  cancelacionesYAusencias, diasDelPeriodo, horasDeAgenda, horasLegibles, horasTrabajadas,
  ocupacionPorCabina, ocupacionPorEmpleada,
  type CitaDeInforme, type DatosDeAgenda,
} from "@/lib/reports"

// La ocupación es el número más fácil de dar mal de toda la pantalla: el
// denominador —cuántas horas HABÍA— sale de cruzar horario del centro, festivos,
// excepciones y vacaciones, y equivocarse en cualquiera de esos cuatro pinta una
// empleada al 40 % que en realidad va a tope. Esta batería repite la misma
// prioridad que lib/schedule.ts para que las dos pantallas no se contradigan.

// Semana del 17 al 21 de agosto de 2026: lunes a viernes.
const LUNES = "2026-08-17"
const MARTES = "2026-08-18"
const MIERCOLES = "2026-08-19"

function agenda(p: Partial<DatosDeAgenda> = {}): DatosDeAgenda {
  return {
    dias: [LUNES, MARTES],
    // Lunes (1) y martes (2), de 9 a 14 y de 16 a 20: nueve horas al día.
    clinicWeekly: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "14:00" },
      { dayOfWeek: 1, startTime: "16:00", endTime: "20:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "14:00" },
      { dayOfWeek: 2, startTime: "16:00", endTime: "20:00" },
    ],
    clinicOverrides: [],
    festivos: [],
    workerWeekly: [
      { workerId: "ana", dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
      { workerId: "ana", dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
    ],
    workerOverrides: [],
    ausencias: [],
    ...p,
  }
}

describe("diasDelPeriodo", () => {
  it("devuelve un día por fecha, con los dos extremos dentro", () => {
    const dias = diasDelPeriodo(new Date(2026, 7, 17), new Date(2026, 7, 19), new Date(2026, 7, 31))
    expect(dias).toEqual([LUNES, MARTES, MIERCOLES])
  })

  it("no cuenta el futuro: «Año» llega a diciembre y ahí no ha pasado nada", () => {
    const dias = diasDelPeriodo(new Date(2026, 7, 30), new Date(2026, 11, 31), new Date(2026, 7, 31))
    expect(dias).toEqual(["2026-08-30", "2026-08-31"])
  })

  it("con el período entero por venir no hay ni un día que mirar", () => {
    expect(diasDelPeriodo(new Date(2026, 9, 1), new Date(2026, 9, 31), new Date(2026, 7, 31))).toEqual([])
  })
})

describe("horasDeAgenda", () => {
  it("suma las horas de apertura del centro, turno partido incluido", () => {
    const h = horasDeAgenda(agenda(), ["ana"])
    expect(h.minutosCentro).toBe(2 * 9 * 60)
    expect(h.diasAbiertos).toBe(2)
  })

  it("cruza el horario de la empleada con el del centro, sin regalarle horas cerradas", () => {
    // Ana ficha de 9 a 17, pero el centro cierra de 14 a 16: son seis horas.
    const h = horasDeAgenda(agenda(), ["ana"])
    expect(h.minutosPorEmpleada.get("ana")).toBe(2 * 6 * 60)
    expect(h.diasPorEmpleada.get("ana")).toBe(2)
  })

  it("no cuenta dos veces lo que se solapa en dos franjas del mismo día", () => {
    const h = horasDeAgenda(agenda({
      dias: [LUNES],
      clinicWeekly: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "14:00" },
        { dayOfWeek: 1, startTime: "13:00", endTime: "20:00" },
      ],
    }), [])
    expect(h.minutosCentro).toBe(11 * 60)
  })

  it("un festivo cierra el centro y, con él, a todo el mundo", () => {
    const h = horasDeAgenda(agenda({ festivos: [LUNES] }), ["ana"])
    expect(h.diasAbiertos).toBe(1)
    expect(h.minutosCentro).toBe(9 * 60)
    expect(h.minutosPorEmpleada.get("ana")).toBe(6 * 60)
  })

  it("una excepción del centro manda sobre el festivo: reabrir un festivo funciona", () => {
    const h = horasDeAgenda(agenda({
      dias: [LUNES],
      festivos: [LUNES],
      clinicOverrides: [{ date: LUNES, closed: false, slots: [{ startTime: "10:00", endTime: "14:00" }] }],
    }), ["ana"])
    expect(h.minutosCentro).toBe(4 * 60)
    // Ana recupera su horario semanal, recortado a lo que abre el centro.
    expect(h.minutosPorEmpleada.get("ana")).toBe(4 * 60)
  })

  it("una excepción cerrada del centro deja el día a cero aunque toque horario", () => {
    const h = horasDeAgenda(agenda({
      dias: [LUNES],
      clinicOverrides: [{ date: LUNES, closed: true, slots: [] }],
    }), ["ana"])
    expect(h.minutosCentro).toBe(0)
    expect(h.diasAbiertos).toBe(0)
  })

  it("una ausencia de la empleada le quita el día a ella, no al centro", () => {
    const h = horasDeAgenda(agenda({
      ausencias: [{ workerId: "ana", date: LUNES, type: "VACATION" }],
    }), ["ana"])
    expect(h.minutosCentro).toBe(2 * 9 * 60)
    expect(h.minutosPorEmpleada.get("ana")).toBe(6 * 60)
    expect(h.diasPorEmpleada.get("ana")).toBe(1)
  })

  it("una excepción de la empleada sustituye a su horario semanal ese día", () => {
    const h = horasDeAgenda(agenda({
      dias: [LUNES],
      workerOverrides: [
        { workerId: "ana", date: LUNES, closed: false, slots: [{ startTime: "16:00", endTime: "20:00" }] },
      ],
    }), ["ana"])
    expect(h.minutosPorEmpleada.get("ana")).toBe(4 * 60)
  })

  it("quien no tiene horario semanal se queda a cero, no en negativo ni en NaN", () => {
    const h = horasDeAgenda(agenda(), ["ana", "sin-horario"])
    expect(h.minutosPorEmpleada.get("sin-horario")).toBe(0)
  })
})

/* ─── Ocupación ──────────────────────────────────────────────────────────── */

function cita(p: Partial<CitaDeInforme> = {}): CitaDeInforme {
  return {
    workerId: "ana",
    cabinId: "c1",
    serviceName: "Facial",
    status: "DONE",
    startAt: new Date(2026, 7, 17, 10, 0),
    durationMinutes: 60,
    ...p,
  }
}

describe("ocupacionPorEmpleada", () => {
  const horas = horasDeAgenda(agenda(), ["ana"]) // 12 h disponibles

  it("mide el hueco ocupado sobre las horas que la empleada tenía", () => {
    const r = ocupacionPorEmpleada(
      [cita({ durationMinutes: 60 }), cita({ durationMinutes: 120 })],
      horas, [{ id: "ana", nombre: "Ana" }],
    )
    expect(r[0]).toMatchObject({ citas: 2, minutosOcupados: 180, minutosDisponibles: 720 })
    expect(r[0].porcentaje).toBe(25)
  })

  it("la cancelada libera el hueco; el «no asistió» se lo queda igualmente", () => {
    const r = ocupacionPorEmpleada(
      [cita({ status: "CANCELLED" }), cita({ status: "NO_SHOW" })],
      horas, [{ id: "ana", nombre: "Ana" }],
    )
    expect(r[0].minutosOcupados).toBe(60)
    expect(r[0].citas).toBe(1)
  })

  it("quien ni tenía horario ni tuvo citas no aporta una fila", () => {
    const r = ocupacionPorEmpleada([], horas, [
      { id: "ana", nombre: "Ana" },
      { id: "nadie", nombre: "Sin horario" },
    ])
    expect(r.map((f) => f.id)).toEqual(["ana"])
  })

  it("quien atendió sin horario asignado sale con la fila, pero sin porcentaje", () => {
    const r = ocupacionPorEmpleada(
      [cita({ workerId: "suplente" })],
      horas, [{ id: "suplente", nombre: "Suplente" }],
    )
    expect(r[0]).toMatchObject({ minutosDisponibles: 0, minutosOcupados: 60, porcentaje: 0 })
  })
})

describe("ocupacionPorCabina", () => {
  it("mide sobre las horas de apertura del centro: una cabina no libra", () => {
    const horas = horasDeAgenda(agenda(), ["ana"])
    const r = ocupacionPorCabina(
      [cita({ cabinId: "c1", durationMinutes: 540 })],
      horas, [{ id: "c1", nombre: "Cabina 1" }, { id: "c2", nombre: "Cabina 2" }],
    )
    expect(r[0]).toMatchObject({ id: "c1", minutosDisponibles: 1080, porcentaje: 50 })
    expect(r[1]).toMatchObject({ id: "c2", minutosOcupados: 0, porcentaje: 0 })
  })
})

describe("cancelacionesYAusencias", () => {
  const citas = [
    cita({ status: "DONE" }),
    cita({ status: "DONE", serviceName: "Láser" }),
    cita({ status: "CANCELLED", serviceName: "Láser" }),
    cita({ status: "NO_SHOW", serviceName: "Láser", durationMinutes: 90 }),
    cita({ status: "CONFIRMED" }),
  ]

  it("cuenta cada estado por su lado y no mezcla cancelar con no venir", () => {
    const r = cancelacionesYAusencias(citas)
    expect(r).toMatchObject({
      total: 5, realizadas: 2, canceladas: 1, noAsistio: 1, abiertas: 1,
      canceladasYAusencias: 2, porcentajeCaida: 40,
    })
  })

  it("solo la ausencia se lleva la hora puesta: la cancelada deja el hueco libre", () => {
    expect(cancelacionesYAusencias(citas).minutosPerdidos).toBe(90)
  })

  it("desglosa por servicio, primero lo que más se cae", () => {
    const r = cancelacionesYAusencias(citas)
    expect(r.porServicio[0]).toMatchObject({ nombre: "Láser", total: 3, canceladas: 1, noAsistio: 1, porcentaje: 67 })
    expect(r.porServicio[1].nombre).toBe("Facial")
  })

  it("el desglose por día va en orden de calendario empezando en lunes", () => {
    const r = cancelacionesYAusencias([
      cita({ startAt: new Date(2026, 7, 22) }), // sábado
      cita({ startAt: new Date(2026, 7, 17) }), // lunes
    ])
    expect(r.porDiaDeSemana.map((f) => f.nombre)).toEqual(["Lunes", "Sábado"])
  })

  it("sin citas no divide entre cero", () => {
    expect(cancelacionesYAusencias([]).porcentajeCaida).toBe(0)
  })
})

describe("horasTrabajadas", () => {
  const horas = horasDeAgenda(agenda(), ["ana"])
  const empleadas = [{ id: "ana", nombre: "Ana" }]

  it("cuenta las ausencias del período y descuenta el cupo del año entero", () => {
    const r = horasTrabajadas(
      empleadas, horas,
      [{ workerId: "ana", date: LUNES, type: "VACATION" }],
      [
        { workerId: "ana", date: LUNES, type: "VACATION" },
        { workerId: "ana", date: "2026-04-02", type: "VACATION" },
        { workerId: "ana", date: "2026-05-05", type: "PERSONAL" },
      ],
      [{ workerId: "ana", vacationDaysTotal: 22, personalDaysTotal: 3 }],
    )
    expect(r[0]).toMatchObject({
      vacaciones: 1, asuntosPropios: 0,
      vacacionesRestantes: 20, asuntosRestantes: 2,
    })
  })

  it("las bajas y las ausencias justificadas van en «otras» y no gastan cupo", () => {
    const r = horasTrabajadas(
      empleadas, horas,
      [{ workerId: "ana", date: LUNES, type: "SICK" }],
      [{ workerId: "ana", date: LUNES, type: "SICK" }],
      [{ workerId: "ana", vacationDaysTotal: 22, personalDaysTotal: 3 }],
    )
    expect(r[0]).toMatchObject({ otrasAusencias: 1, vacacionesRestantes: 22, asuntosRestantes: 3 })
  })

  it("sin cupo asignado no inventa un saldo: deja el hueco en blanco", () => {
    const r = horasTrabajadas(empleadas, horas, [], [], [])
    expect(r[0].vacacionesRestantes).toBeNull()
    expect(r[0].asuntosRestantes).toBeNull()
  })
})

describe("horasLegibles", () => {
  it("escribe los minutos como se dicen en voz alta", () => {
    expect(horasLegibles(450)).toBe("7 h 30 min")
    expect(horasLegibles(120)).toBe("2 h")
    expect(horasLegibles(45)).toBe("45 min")
    expect(horasLegibles(0)).toBe("0 min")
  })
})

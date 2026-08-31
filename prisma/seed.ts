import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { seedHolidays } from "../scripts/seed-holidays-albacete"

// Carga .env si DATABASE_URL no está ya definido (p. ej. al ejecutar con tsx).
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (!m) continue
      const val = (m[2] ?? "").trim().replace(/^["']|["']$/g, "")
      if (!(m[1] in process.env)) process.env[m[1]] = val
    }
  } catch {}
}

const prisma = new PrismaClient()

// Construye un Date para HOY a la hora indicada (local).
function todayAt(hour: number, minute = 0): Date {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

// Un Date a mediodía, N días antes (negativo) o después (positivo) de hoy. A
// mediodía para que la fecha local y la UTC sean la misma sea cual sea el
// desfase horario.
function enDias(offset: number): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Los datos de horarios se anclan al lunes de la semana en curso para que la
// vista "Esta semana" siempre tenga algo que enseñar, se siembre el día que se
// siembre. day(0) = lunes de esta semana, day(7) = lunes de la que viene.
function day(offsetDays: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()) + offsetDays)
  return toDateStr(d)
}

async function main() {
  console.log("🌱 Sembrando datos demo…")

  // Reset (orden por FKs)
  // Ventas y caja van primero: las FK a Clinic/User/Customer son obligatorias y
  // sin `onDelete`, o sea Restrict, así que sembrar sobre una base con ventas
  // reventaba en `customer.deleteMany()` con media base ya borrada.
  await prisma.customerBalanceMovement.deleteMany()
  await prisma.saleLine.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.cashRegister.deleteMany()
  await prisma.customerReminder.deleteMany()
  await prisma.whatsappMessage.deleteMany()
  await prisma.appointment.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.product.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.service.deleteMany()
  await prisma.serviceFamily.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.cabin.deleteMany()
  // Horarios/vacaciones: dependen de User/Clinic, deben borrarse antes.
  await prisma.workerLeave.deleteMany()
  await prisma.workerLeaveBalance.deleteMany()
  await prisma.workerScheduleOverride.deleteMany() // cascade -> slots
  await prisma.workerWeeklySlot.deleteMany()
  await prisma.clinicScheduleOverride.deleteMany() // cascade -> slots
  await prisma.clinicWeeklySlot.deleteMany()
  await prisma.holiday.deleteMany()
  await prisma.user.deleteMany()
  await prisma.clinic.deleteMany()

  // Clínica
  const clinic = await prisma.clinic.create({
    data: {
      name: "Centro de Estética Lucía",
      // Se lee debajo del nombre en la pantalla de encendido, la del PIN. Sin
      // esto esa pantalla sale a medias, que es como estaba hasta ahora.
      slogan: "Cuidarte es nuestro oficio",
      taxId: "B12345678",
      address: "Calle Mayor 12, 28013 Madrid",
      phone: "+34910000000",
      email: "hola@centroesteticalucia.com",
      timezone: "Europe/Madrid",
      openingTime: "09:00",
      closingTime: "20:00",
      whatsappEnabled: false,
      whatsappTemplateName: "appointment_reminder_es",
      whatsappTemplateLang: "es",
      reminderHoursBefore: 24,
    },
  })

  // Usuarios / trabajadores
  const adminPasswordHash = await bcrypt.hash("admin", 12)

  // PIN de mostrador. Sin esto la puerta que se abre por defecto —la del
  // pin-pad— no deja entrar a nadie recién sembrado, y el TPV se queda en el
  // modo de compatibilidad de `requireOperator` (lib/auth.ts), donde cobra
  // siempre quien encendió el ordenador. O sea: sin PINes el seed no enseña
  // nada de cómo funciona el mostrador de verdad.
  //
  // Tienen que ser distintos entre sí: `usuariaDelPin` deduce de quién es un
  // PIN comparando hashes uno a uno, así que dos iguales serían la misma
  // persona para el sistema. El coste 10 es el de `hashearPin` (lib/pin.ts);
  // se repite aquí porque los scripts no resuelven los alias "@/…" y ese
  // fichero arrastra la conexión a la base.
  const PINES = { lucia: "100001", marta: "200002", lola: "300003" }
  const [pinLucia, pinMarta, pinLola] = await Promise.all([
    bcrypt.hash(PINES.lucia, 10),
    bcrypt.hash(PINES.marta, 10),
    bcrypt.hash(PINES.lola, 10),
  ])

  const [admin, marta, lola] = await Promise.all([
    prisma.user.create({
      data: {
        clinicId: clinic.id,
        name: "Lucía",
        lastName: "Martínez",
        email: "lucia.martinez@centroesteticalucia.com",
        role: "ADMIN",
        phone: "+34600000001",
        color: "#A055A6",
        passwordHash: adminPasswordHash,
        pinHash: pinLucia,
      },
    }),
    prisma.user.create({
      // Marta llega con el PIN de un solo uso que le dio la administradora:
      // al entrar la manda a /cambiar-pin y así el seed enseña también el
      // primer acceso, no solo el caso ya rodado.
      data: { clinicId: clinic.id, name: "Marta", lastName: "Sánchez", role: "WORKER", color: "#487F2E", email: "marta.sanchez@centroesteticalucia.com", pinHash: pinMarta, mustChangePin: true },
    }),
    prisma.user.create({
      data: { clinicId: clinic.id, name: "Lola", lastName: "Romero", role: "WORKER", color: "#B25F18", email: "lola.romero@centroesteticalucia.com", pinHash: pinLola },
    }),
  ])

  // Una ficha dada de baja. La lista de usuarios agrupa en administración,
  // equipo y desactivadas, y sin esto el tercer grupo no aparece nunca. No
  // lleva PIN ni horario: se fue, no trabaja.
  //
  // El nombre se lee como falso a propósito. Las otras tres son personajes de
  // la demo de toda la vida y ya se citan por su nombre en otras pantallas;
  // meter aquí una cuarta con nombre creíble haría pensar que existió alguien
  // que no ha existido.
  await prisma.user.create({
    data: { clinicId: clinic.id, name: "Prueba", lastName: "Baja", role: "WORKER", color: "#7A5C99", active: false },
  })

  // Horario semanal del centro: lunes a viernes 9:00-20:00 (sábado y domingo cerrado).
  await prisma.clinicWeeklySlot.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      clinicId: clinic.id,
      dayOfWeek,
      startTime: "09:00",
      endTime: "20:00",
    })),
  })

  // Horario semanal por empleada (ejemplo del contrato de cada una).
  await prisma.workerWeeklySlot.createMany({
    data: [
      // Lola: 40h/semana, lunes a viernes 9:00-17:00.
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
        clinicId: clinic.id, workerId: lola.id, dayOfWeek, startTime: "09:00", endTime: "17:00",
      })),
      // Marta: jornada parcial partida, martes tarde y jueves mañana.
      { clinicId: clinic.id, workerId: marta.id, dayOfWeek: 2, startTime: "16:00", endTime: "20:00" },
      { clinicId: clinic.id, workerId: marta.id, dayOfWeek: 4, startTime: "09:00", endTime: "13:00" },
      // Lucía (admin): jornada completa igual que el centro.
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
        clinicId: clinic.id, workerId: admin.id, dayOfWeek, startTime: "09:00", endTime: "20:00",
      })),
    ],
  })

  // Saldo anual de vacaciones/asuntos propios: 21 días de vacaciones y 1 de
  // libre disposición por empleada.
  const currentYear = new Date().getFullYear()
  await prisma.workerLeaveBalance.createMany({
    data: [admin, marta, lola].map((w) => ({
      clinicId: clinic.id,
      workerId: w.id,
      year: currentYear,
      vacationDaysTotal: 21,
      personalDaysTotal: 1,
    })),
  })

  // Excepción del centro: el viernes de esta semana se cierra antes.
  await prisma.clinicScheduleOverride.create({
    data: {
      clinicId: clinic.id,
      date: day(4),
      closed: false,
      reason: "Cierre anticipado por formación",
      slots: { create: [{ startTime: "09:00", endTime: "14:00" }] },
    },
  })

  // Excepciones de empleada, una de cada tipo: Marta entra un día que no le
  // toca, y Lola libra un día que sí le tocaba (cambio de turno, sin gastar
  // vacaciones).
  await prisma.workerScheduleOverride.create({
    data: {
      clinicId: clinic.id,
      workerId: marta.id,
      date: day(2),
      closed: false,
      reason: "Cubre a Lola",
      slots: { create: [{ startTime: "10:00", endTime: "14:00" }] },
    },
  })
  await prisma.workerScheduleOverride.create({
    data: {
      clinicId: clinic.id,
      workerId: lola.id,
      date: day(3),
      closed: true,
      reason: "Cambia su día libre esta semana",
    },
  })

  // Ausencias: un rango (vacaciones de Lola la semana que viene) y dos días
  // sueltos, para ver los tres colores en la cuadrícula.
  await prisma.workerLeave.createMany({
    data: [
      ...[7, 8, 9].map((offset) => ({
        clinicId: clinic.id,
        workerId: lola.id,
        date: day(offset),
        type: "VACATION",
        notes: "Puente",
        createdByUserId: admin.id,
      })),
      {
        clinicId: clinic.id,
        workerId: admin.id,
        date: day(1),
        type: "PERSONAL",
        notes: "Gestión personal",
        createdByUserId: admin.id,
      },
      {
        clinicId: clinic.id,
        workerId: marta.id,
        date: day(3),
        type: "SICK",
        notes: null,
        createdByUserId: admin.id,
      },
    ],
  })

  // Cabinas: recurso compartido, cualquier empleada puede usar cualquiera.
  const cabins = await Promise.all([
    prisma.cabin.create({ data: { clinicId: clinic.id, name: "Cabina 1", sortOrder: 1, active: true } }),
    prisma.cabin.create({ data: { clinicId: clinic.id, name: "Cabina 2", sortOrder: 2, active: true } }),
  ])

  // Familias de servicio
  const [familyFacial, familyDepilacion, familyCorporal, familyManicura] = await Promise.all([
    prisma.serviceFamily.create({ data: { clinicId: clinic.id, name: "Facial", sortOrder: 1 } }),
    prisma.serviceFamily.create({ data: { clinicId: clinic.id, name: "Depilación", sortOrder: 2 } }),
    prisma.serviceFamily.create({ data: { clinicId: clinic.id, name: "Corporal", sortOrder: 3 } }),
    prisma.serviceFamily.create({ data: { clinicId: clinic.id, name: "Manicura", sortOrder: 4 } }),
  ])

  // Servicios
  const [facial, laser, electrica, masaje, manicura] = await Promise.all([
    prisma.service.create({
      data: { clinicId: clinic.id, familyId: familyFacial.id, name: "Tratamiento facial", durationMinutes: 60, priceCents: 6500 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, familyId: familyDepilacion.id, name: "Depilación láser", durationMinutes: 60, priceCents: 8000 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, familyId: familyDepilacion.id, name: "Depilación eléctrica", durationMinutes: 45, priceCents: 5000 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, familyId: familyCorporal.id, name: "Masaje relajante", durationMinutes: 90, priceCents: 7000 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, familyId: familyManicura.id, name: "Manicura", durationMinutes: 30, priceCents: 2500 },
    }),
  ])

  // Clientes
  const [maria, pepita, fernando, ana, carlos] = await Promise.all([
    // El nº de expediente va explícito porque estas altas van en paralelo y
    // calcularlo aquí daría números repetidos.
    //
    // La fecha de alta también va explícita y escalonada hacia atrás. Con el
    // `now()` por defecto los cinco se daban de alta el día que siembras, y
    // entonces el centro parece recién abierto: no hay clientela antigua, y
    // cualquier cuenta de «nuevos vs. de siempre» sale con todo en la columna
    // de nuevos.
    prisma.customer.create({
      data: {
        clinicId: clinic.id, fileNumber: 1, createdAt: enDias(-1300),
        firstName: "María José", lastName: "Soriano", lastName2: "García",
        sex: "FEMALE", birthDate: new Date("1985-03-14"), profession: "Maestra",
        phone: "+34600111222", address: "C/ Mayor 12, 3ºB, Albacete",
        referralSource: "OTHER_CLIENT", whatsappOptIn: true,
        notes: "Prefiere cita a primera hora, antes de entrar a clase.",
      },
    }),
    prisma.customer.create({
      data: {
        clinicId: clinic.id, fileNumber: 2, createdAt: enDias(-950),
        firstName: "Pepita", lastName: "Pérez", lastName2: "Molina",
        sex: "FEMALE", birthDate: new Date("1992-07-22"), profession: "Comercial",
        // Los dos teléfonos etiquetados: es el caso para el que se hizo la
        // etiqueta, saber a quién llamas antes de marcar.
        phone: "+34600222333", phoneLabel: "Personal",
        phone2: "+34611222333", phone2Label: "Trabajo",
        referralSource: "SOCIAL_MEDIA", allergies: "Alergia al níquel",
        whatsappOptIn: true,
      },
    }),
    prisma.customer.create({
      data: {
        clinicId: clinic.id, fileNumber: 3, createdAt: enDias(-610),
        firstName: "Fernando", lastName: "López", lastName2: "Navarro",
        sex: "MALE", birthDate: new Date("1978-11-05"), profession: "Fontanero",
        phone: "+34600333444", phoneLabel: "Trabajo",
        referralSource: "WALK_BY", whatsappOptIn: true,
        notes: "Solo puede venir por las tardes.",
      },
    }),
    prisma.customer.create({
      data: {
        clinicId: clinic.id, fileNumber: 4, createdAt: enDias(-280),
        firstName: "Ana", lastName: "Martínez", lastName2: "Ruiz",
        sex: "FEMALE", birthDate: new Date("1990-01-30"), profession: "Enfermera",
        phone: "+34600444555", phone2: "+34600999888", phone2Label: "Madre",
        email: "ana@example.com", address: "Avda. de España 45, Albacete",
        referralSource: "INTERNET", allergies: "Alergia al látex",
        whatsappOptIn: false,
        notes: "No quiere WhatsApp: avisarla por teléfono.",
      },
    }),
    prisma.customer.create({
      data: {
        clinicId: clinic.id, fileNumber: 5, createdAt: enDias(-95),
        firstName: "Carlos", lastName: "Ruiz", lastName2: "Fernández",
        sex: "MALE", birthDate: new Date("1983-09-18"), profession: "Informático",
        phone: "+34600555666", referralSource: "ADVERTISING", whatsappOptIn: true,
      },
    }),
  ])

  // Citas de ejemplo (hoy)
  function appt(opts: {
    customerId: string
    serviceId: string
    workerId: string
    cabinId: string
    startHour: number
    startMinute: number
    duration: number
    status: string
    reminderStatus: string
  }) {
    const startAt = todayAt(opts.startHour, opts.startMinute)
    const endAt = new Date(startAt.getTime() + opts.duration * 60000)
    return prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        customerId: opts.customerId,
        serviceId: opts.serviceId,
        workerId: opts.workerId,
        cabinId: opts.cabinId,
        startAt,
        endAt,
        durationMinutes: opts.duration,
        status: opts.status,
        reminderStatus: opts.reminderStatus,
      },
    })
  }

  await Promise.all([
    appt({ customerId: maria.id, serviceId: laser.id, workerId: marta.id, cabinId: cabins[0].id, startHour: 9, startMinute: 45, duration: 60, status: "CONFIRMED", reminderStatus: "SENT" }),
    appt({ customerId: pepita.id, serviceId: facial.id, workerId: lola.id, cabinId: cabins[1].id, startHour: 11, startMinute: 30, duration: 60, status: "PENDING", reminderStatus: "PENDING" }),
    appt({ customerId: fernando.id, serviceId: electrica.id, workerId: admin.id, cabinId: cabins[0].id, startHour: 11, startMinute: 30, duration: 45, status: "CONFIRMED", reminderStatus: "DELIVERED" }),
    appt({ customerId: carlos.id, serviceId: masaje.id, workerId: marta.id, cabinId: cabins[0].id, startHour: 13, startMinute: 0, duration: 90, status: "PENDING", reminderStatus: "PENDING" }),
    appt({ customerId: ana.id, serviceId: manicura.id, workerId: lola.id, cabinId: cabins[1].id, startHour: 16, startMinute: 0, duration: 30, status: "DONE", reminderStatus: "NOT_SCHEDULED" }),
  ])

  // Recordatorios de cliente. Hay dos clases y se comportan distinto, así que
  // hacen falta las dos sembradas: sin fecha es un aviso permanente de la
  // ficha (sale siempre que se atiende a esa persona y no vence solo), y con
  // fecha es una tarea que vence y que el dashboard saca cuando entra en su
  // ventana de aviso. Hasta ahora el seed no creaba ninguno y no se veía
  // ninguna de las dos.
  await prisma.customerReminder.createMany({
    data: [
      // Permanente: el ejemplo de manual, la alergia que hay que tener
      // delante cada vez, no una tarea que se marca hecha y desaparece.
      {
        clinicId: clinic.id, customerId: ana.id, createdByUserId: admin.id,
        title: "Alergia al látex: usar guantes de nitrilo", dueDate: null,
      },
      {
        clinicId: clinic.id, customerId: pepita.id, createdByUserId: admin.id,
        title: "Alergia al níquel: nada de bisutería durante el tratamiento", dueDate: null,
      },
      // Con fecha y dentro de la ventana de aviso: estos dos son los que salen
      // en el dashboard, uno por vencer y otro ya pasado de fecha.
      {
        clinicId: clinic.id, customerId: maria.id, createdByUserId: admin.id,
        title: "Llamar para revisar cómo va el tratamiento facial", dueDate: enDias(3),
      },
      {
        clinicId: clinic.id, customerId: fernando.id, createdByUserId: admin.id,
        title: "Pendiente de decidir si sigue con la depilación eléctrica", dueDate: enDias(-2),
      },
      // Con fecha pero todavía lejos: NO debe salir en el dashboard. Está para
      // que se note que el aviso empieza cuando toca y no en cuanto se crea.
      {
        clinicId: clinic.id, customerId: carlos.id, createdByUserId: admin.id,
        title: "Ofrecerle el bono de masajes cuando se acabe el actual", dueDate: enDias(45),
      },
      // Ya hecho: la ficha del cliente lo separa de los pendientes.
      {
        clinicId: clinic.id, customerId: pepita.id, createdByUserId: admin.id,
        title: "Confirmar que le llegó la tarjeta regalo", dueDate: enDias(-10),
        completedAt: enDias(-9), completedByUserId: lola.id,
      },
    ],
  })

  // Proveedores
  const [dermoder, lamdors] = await Promise.all([
    prisma.supplier.create({
      data: { clinicId: clinic.id, name: "Dermoder", email: "info@dermoder.com", notes: "Cosmética profesional. La original desde 1975." },
    }),
    prisma.supplier.create({
      data: { clinicId: clinic.id, name: "Lamdors", email: "info@lamdors.com", notes: "Cosmética profesional de alta gama para centros de estética." },
    }),
  ])

  // Productos
  await Promise.all([
    // Dermoder
    prisma.product.create({
      data: {
        clinicId: clinic.id,
        supplierId: dermoder.id,
        name: "Crema Ácida Dermoder 100ml",
        description: "Crema post-depilación. Reduce rojeces e irritación.",
        priceCents: 2699,
        costCents: 1500,
        stock: 10,
        stockMin: 2,
      },
    }),
    // Lamdors
    prisma.product.create({
      data: {
        clinicId: clinic.id,
        supplierId: lamdors.id,
        name: "N.T.2 Hialuron Micro Lipid Filler 30ml",
        description: "Crema hidratante con ácido hialurónico. Efecto lifting.",
        priceCents: 6510,
        costCents: 4000,
        stock: 5,
        stockMin: 1,
      },
    }),
    prisma.product.create({
      data: {
        clinicId: clinic.id,
        supplierId: lamdors.id,
        name: "X.A.23 Purimasc 30ml",
        description: "Mascarilla purificante para pieles grasas y mixtas.",
        priceCents: 2350,
        costCents: 1400,
        stock: 8,
        stockMin: 2,
      },
    }),
    prisma.product.create({
      data: {
        clinicId: clinic.id,
        supplierId: lamdors.id,
        name: "T.E.42 Biovital Sérum Antiaging 30ml",
        description: "Sérum vitamínico antiedad. Combate arrugas.",
        priceCents: 5730,
        costCents: 3500,
        stock: 6,
        stockMin: 1,
      },
    }),
    prisma.product.create({
      data: {
        clinicId: clinic.id,
        supplierId: lamdors.id,
        name: "T.S.8 Bio Embrión Sérum Rejuvenecedor",
        description: "Sérum regenerador profundo antiedad.",
        priceCents: 10440,
        costCents: 6500,
        stock: 4,
        stockMin: 1,
      },
    }),
  ])

  // Los festivos reales viven en su propio módulo y se encadenan aquí para que
  // `npm run db:seed` deje la base lista de una vez y en el orden correcto:
  // van después porque este seed borra la tabla Holiday.
  //
  // Las ventas y cajas de demo NO se siembran aquí a propósito: son registros
  // transaccionales y ensucian la caja. Si hacen falta: `npm run db:seed-sales`.
  await seedHolidays(prisma)

  console.log("✅ Seed completado:")
  console.log(`   Clínica: ${clinic.name}`)
  console.log(`   ${cabins.length} cabinas · 3 trabajadoras + 1 desactivada · 5 servicios · 5 clientes · 5 citas`)
  console.log(`   2 proveedores (Dermoder, Lamdors) · 5 productos · 6 recordatorios`)
  console.log(`   Horarios: 3 excepciones · 5 días de ausencia (semana del ${day(0)})`)
  console.log(`   Gestión: ${admin.email} / admin`)
  console.log(`   Mostrador (PIN): Lucía ${PINES.lucia} · Lola ${PINES.lola} · Marta ${PINES.marta} (de un solo uso, se lo cambia al entrar)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

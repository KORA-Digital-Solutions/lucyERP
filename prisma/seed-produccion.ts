/**
 * Base de datos inicial del centro (la que se lleva al PC de la clínica).
 *
 * No es el seed de demo (prisma/seed.ts): aquí no hay clientas inventadas, ni
 * citas, ni ventas, ni cajas. Solo lo imprescindible para que la aplicación
 * arranque y se pueda empezar a trabajar el primer día:
 *
 *   · el centro y su horario semanal
 *   · una administradora (Lucía Martínez), con contraseña y PIN de un solo uso
 *   · dos cabinas
 *   · un catálogo mínimo de servicios y productos
 *   · dos bonos de ejemplo
 *   · los festivos del calendario laboral
 *
 * A diferencia del de demo, este seed NO borra nada: si la base ya tiene datos
 * se planta y avisa, porque el día que alguien lo lance por error contra el PC
 * del centro se llevaría por delante el trabajo de meses. Para volver a
 * empezar de cero, borrar el fichero .db y aplicar las migraciones otra vez.
 *
 *   npm run db:seed-prod
 */
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

/**
 * Credenciales de arranque. Las dos son de un solo uso: la aplicación obliga a
 * cambiarlas la primera vez que se entra por cada puerta (contraseña para la
 * gestión, PIN para el mostrador), así que pueden ir escritas aquí y en las
 * instrucciones de instalación sin que eso deje una puerta abierta.
 */
const ADMIN = {
  name: "Lucía",
  lastName: "Martínez",
  email: "lucia.martinez@centroesteticalucia.com",
  password: "lucia2026",
  pin: "100001",
}

const DOMINIO = ADMIN.email.split("@")[1]

async function main() {
  // El seguro: esto se ejecuta con la base del centro delante.
  const [clinicas, clientes, ventas, citas] = await Promise.all([
    prisma.clinic.count(),
    prisma.customer.count(),
    prisma.sale.count(),
    prisma.appointment.count(),
  ])
  if (clinicas + clientes + ventas + citas > 0) {
    console.error(
      "❌ La base de datos ya tiene datos " +
        `(${clinicas} centro/s, ${clientes} clientes, ${ventas} ventas, ${citas} citas).\n` +
        "   Este seed solo se ejecuta sobre una base vacía. No se ha tocado nada.",
    )
    process.exit(1)
  }

  console.log("🌱 Preparando la base de datos inicial del centro…")

  // ---------------------------------------------------------------- centro --
  const clinic = await prisma.clinic.create({
    data: {
      name: "Centro de Estética Lucía",
      // Se lee debajo del nombre en la pantalla del PIN, que es lo primero que
      // ve el centro al encender. Se cambia desde Configuración.
      slogan: "Sencillamente… lo que tu piel necesita",
      // Los datos fiscales y de contacto se rellenan desde Configuración el
      // primer día: aquí solo va el correo, porque de él sale el dominio con
      // el que se completa el usuario al entrar en la gestión.
      email: `hola@${DOMINIO}`,
      timezone: "Europe/Madrid",
      openingTime: "09:00",
      closingTime: "20:00",
      whatsappEnabled: false,
      whatsappTemplateName: "appointment_reminder_es",
      whatsappTemplateLang: "es",
      reminderHoursBefore: 24,
    },
  })

  // Horario semanal del centro: lunes a viernes, 9:00-20:00. Se ajusta desde
  // Horarios sin tocar la base.
  await prisma.clinicWeeklySlot.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      clinicId: clinic.id,
      dayOfWeek,
      startTime: "09:00",
      endTime: "20:00",
    })),
  })

  // ------------------------------------------------------------ usuarios ----
  // Solo la administradora. Las empleadas se dan de alta desde la gestión
  // (Usuarios), que es donde se les genera el PIN: hacerlo aquí obligaría a
  // inventarse nombres que luego habría que borrar.
  const admin = await prisma.user.create({
    data: {
      clinicId: clinic.id,
      name: ADMIN.name,
      lastName: ADMIN.lastName,
      email: ADMIN.email,
      role: "ADMIN",
      color: "#A055A6",
      passwordHash: await bcrypt.hash(ADMIN.password, 12),
      // Las dos de un solo uso: la aplicación manda a cambiarlas al entrar.
      mustChangePassword: true,
      pinHash: await bcrypt.hash(ADMIN.pin, 10),
      mustChangePin: true,
    },
  })

  // Su horario, igual que el del centro, para que aparezca en la agenda desde
  // el primer día.
  await prisma.workerWeeklySlot.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      clinicId: clinic.id,
      workerId: admin.id,
      dayOfWeek,
      startTime: "09:00",
      endTime: "20:00",
    })),
  })

  // Saldo anual de vacaciones y asuntos propios del año en curso.
  await prisma.workerLeaveBalance.create({
    data: {
      clinicId: clinic.id,
      workerId: admin.id,
      year: new Date().getFullYear(),
      vacationDaysTotal: 21,
      personalDaysTotal: 1,
    },
  })

  // ------------------------------------------------------------- cabinas ----
  await prisma.cabin.createMany({
    data: [
      { clinicId: clinic.id, name: "Cabina 1", sortOrder: 1 },
      { clinicId: clinic.id, name: "Cabina 2", sortOrder: 2 },
    ],
  })

  // ------------------------------------------------------------ servicios ---
  // Catálogo de arranque: las cuatro familias del centro y un servicio típico
  // de cada una. Precios y duraciones se ajustan desde Servicios.
  const familias = {
    facial: await prisma.serviceFamily.create({
      data: { clinicId: clinic.id, name: "Facial", sortOrder: 1 },
    }),
    depilacion: await prisma.serviceFamily.create({
      data: { clinicId: clinic.id, name: "Depilación", sortOrder: 2 },
    }),
    corporal: await prisma.serviceFamily.create({
      data: { clinicId: clinic.id, name: "Corporal", sortOrder: 3 },
    }),
    manos: await prisma.serviceFamily.create({
      data: { clinicId: clinic.id, name: "Manos y pies", sortOrder: 4 },
    }),
  }

  const limpiezaFacial = await prisma.service.create({
    data: {
      clinicId: clinic.id, familyId: familias.facial.id,
      name: "Limpieza facial", durationMinutes: 60, priceCents: 4500,
    },
  })
  const laser = await prisma.service.create({
    data: {
      clinicId: clinic.id, familyId: familias.depilacion.id,
      name: "Depilación láser", durationMinutes: 60, priceCents: 8000,
    },
  })
  const masaje = await prisma.service.create({
    data: {
      clinicId: clinic.id, familyId: familias.corporal.id,
      name: "Masaje relajante", durationMinutes: 60, priceCents: 5500,
    },
  })
  await prisma.service.createMany({
    data: [
      {
        clinicId: clinic.id, familyId: familias.depilacion.id,
        name: "Depilación con cera", durationMinutes: 30, priceCents: 2500,
      },
      {
        clinicId: clinic.id, familyId: familias.manos.id,
        name: "Manicura", durationMinutes: 30, priceCents: 2500,
      },
      {
        clinicId: clinic.id, familyId: familias.manos.id,
        name: "Pedicura", durationMinutes: 45, priceCents: 3000,
      },
    ],
  })

  // ------------------------------------------------------------ productos ---
  // Dos productos de mostrador para que la venta de producto y el stock tengan
  // con qué probarse. Sin existencias: las de verdad entran por Stock, con su
  // movimiento de entrada, que es como debe quedar apuntado.
  await prisma.product.createMany({
    data: [
      {
        clinicId: clinic.id,
        name: "Crema hidratante facial 50ml",
        description: "Hidratación diaria para todo tipo de piel.",
        priceCents: 2490, costCents: 1400, stock: 0, stockMin: 0,
      },
      {
        clinicId: clinic.id,
        name: "Crema post-depilación 100ml",
        description: "Calma la piel y reduce rojeces después de la depilación.",
        priceCents: 1690, costCents: 900, stock: 0, stockMin: 0,
      },
    ],
  })

  // ---------------------------------------------------------------- bonos ---
  // Dos ejemplos, uno por cada forma de montarlos: un pack de sesiones del
  // mismo servicio y uno que mezcla dos. La tarifa se guarda escrita (precio
  // del servicio x sesiones) y el descuento es lo que se le regala por
  // pagarlo por adelantado.
  await prisma.voucherTemplate.create({
    data: {
      clinicId: clinic.id,
      name: "Bono 5 sesiones de depilación láser",
      sortOrder: 1,
      services: {
        create: [
          {
            serviceId: laser.id,
            totalSessions: 5,
            basePriceCents: 5 * 8000,
            discountPercent: 10,
          },
        ],
      },
    },
  })
  await prisma.voucherTemplate.create({
    data: {
      clinicId: clinic.id,
      name: "Bono facial: 3 limpiezas + 1 masaje",
      sortOrder: 2,
      services: {
        create: [
          {
            serviceId: limpiezaFacial.id,
            totalSessions: 3,
            basePriceCents: 3 * 4500,
            discountPercent: 10,
          },
          {
            serviceId: masaje.id,
            totalSessions: 1,
            basePriceCents: 5500,
            discountPercent: 0,
          },
        ],
      },
    },
  })

  // ------------------------------------------------------------- festivos ---
  // Calendario laboral (Albacete). Es aditivo e idempotente, así que puede
  // volver a lanzarse cada año sin tocar lo que ya hay.
  await seedHolidays(prisma)

  console.log("✅ Base de datos inicial creada:")
  console.log(`   Centro: ${clinic.name}`)
  console.log("   2 cabinas · 4 familias · 6 servicios · 2 productos · 2 bonos")
  console.log("   Sin clientes, sin citas, sin ventas y sin cajas.")
  console.log("")
  console.log("   Gestión del centro:  usuario `lucia.martinez` · contraseña `" + ADMIN.password + "`")
  console.log("   Mostrador (PIN):     " + ADMIN.pin)
  console.log("   Las dos son de un solo uso: la aplicación pide cambiarlas al entrar.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PrismaClient } from "@prisma/client"

// Carga .env si DATABASE_URL no está ya definido (p. ej. al ejecutar con tsx).
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (!m) continue
      let val = (m[2] ?? "").trim().replace(/^["']|["']$/g, "")
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

async function main() {
  console.log("🌱 Sembrando datos demo…")

  // Reset (orden por FKs)
  await prisma.whatsappMessage.deleteMany()
  await prisma.appointment.deleteMany()
  await prisma.service.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.cabin.deleteMany()
  await prisma.user.deleteMany()
  await prisma.clinic.deleteMany()

  // Clínica
  const clinic = await prisma.clinic.create({
    data: {
      name: "Clínica Estética Lucía",
      taxId: "B12345678",
      address: "Calle Mayor 12, 28013 Madrid",
      phone: "+34910000000",
      email: "hola@clinicalucia.es",
      timezone: "Europe/Madrid",
      openingTime: "09:00",
      closingTime: "20:00",
      whatsappEnabled: true,
      whatsappTemplateName: "appointment_reminder_es",
      whatsappTemplateLang: "es",
      reminderHoursBefore: 24,
    },
  })

  // Usuarios / trabajadores
  const [admin, marta, lola, lucia] = await Promise.all([
    prisma.user.create({
      data: {
        clinicId: clinic.id,
        name: "María García",
        email: "admin@clinicalucia.es",
        role: "ADMIN",
        phone: "+34600000001",
        color: "#274775",
      },
    }),
    prisma.user.create({
      data: { clinicId: clinic.id, name: "Marta", role: "WORKER", color: "#3C54A4" },
    }),
    prisma.user.create({
      data: { clinicId: clinic.id, name: "Lola", role: "WORKER", color: "#5F73B4" },
    }),
    prisma.user.create({
      data: { clinicId: clinic.id, name: "Lucía", role: "WORKER", color: "#AFB9D9" },
    }),
  ])

  // Cabinas
  const cabins = await Promise.all(
    [1, 2, 3].map((n) =>
      prisma.cabin.create({
        data: {
          clinicId: clinic.id,
          name: `Cabina ${n}`,
          sortOrder: n,
          active: true,
        },
      }),
    ),
  )

  // Servicios
  const [facial, laser, electrica, masaje, manicura] = await Promise.all([
    prisma.service.create({
      data: { clinicId: clinic.id, name: "Tratamiento facial", durationMinutes: 60, priceCents: 6500 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, name: "Depilación láser", durationMinutes: 60, priceCents: 8000 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, name: "Depilación eléctrica", durationMinutes: 45, priceCents: 5000 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, name: "Masaje relajante", durationMinutes: 90, priceCents: 7000 },
    }),
    prisma.service.create({
      data: { clinicId: clinic.id, name: "Manicura", durationMinutes: 30, priceCents: 2500 },
    }),
  ])

  // Clientes
  const [maria, pepita, fernando, ana, carlos] = await Promise.all([
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "María José", lastName: "Soriano", phone: "+34600111222", whatsappOptIn: true },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Pepita", lastName: "Pérez", phone: "+34600222333", whatsappOptIn: true },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Fernando", lastName: "López", phone: "+34600333444", whatsappOptIn: true },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Ana", lastName: "Martínez", phone: "+34600444555", email: "ana@example.com", whatsappOptIn: false },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Carlos", lastName: "Ruiz", phone: "+34600555666", whatsappOptIn: true },
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
    appt({ customerId: fernando.id, serviceId: electrica.id, workerId: lucia.id, cabinId: cabins[2].id, startHour: 11, startMinute: 30, duration: 45, status: "CONFIRMED", reminderStatus: "DELIVERED" }),
    appt({ customerId: carlos.id, serviceId: masaje.id, workerId: marta.id, cabinId: cabins[0].id, startHour: 13, startMinute: 0, duration: 90, status: "PENDING", reminderStatus: "PENDING" }),
    appt({ customerId: ana.id, serviceId: manicura.id, workerId: lola.id, cabinId: cabins[1].id, startHour: 16, startMinute: 0, duration: 30, status: "DONE", reminderStatus: "NOT_SCHEDULED" }),
  ])

  console.log("✅ Seed completado:")
  console.log(`   Clínica: ${clinic.name}`)
  console.log(`   ${cabins.length} cabinas · 4 trabajadores · 5 servicios · 5 clientes · 5 citas`)
  console.log(`   Login demo: ${admin.email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

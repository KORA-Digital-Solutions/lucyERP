import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

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

async function main() {
  console.log("🌱 Sembrando datos demo…")

  // Reset (orden por FKs)
  await prisma.whatsappMessage.deleteMany()
  await prisma.appointment.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.product.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.service.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.cabin.deleteMany()
  await prisma.user.deleteMany()
  await prisma.clinic.deleteMany()

  // Clínica
  const clinic = await prisma.clinic.create({
    data: {
      name: "Centro de Estética Lucía",
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

  const [admin, marta, lola] = await Promise.all([
    prisma.user.create({
      data: {
        clinicId: clinic.id,
        name: "Lucía",
        lastName: "Martínez",
        email: "lucia.martinez@centroesteticalucia.com",
        role: "ADMIN",
        phone: "+34600000001",
        color: "#274775",
        passwordHash: adminPasswordHash,
      },
    }),
    prisma.user.create({
      data: { clinicId: clinic.id, name: "Marta", lastName: "Sánchez", role: "WORKER", color: "#3C54A4" },
    }),
    prisma.user.create({
      data: { clinicId: clinic.id, name: "Lola", lastName: "Romero", role: "WORKER", color: "#5F73B4" },
    }),
  ])

  // Cabinas
  const cabins = await Promise.all([
    prisma.cabin.create({ data: { clinicId: clinic.id, name: "Cabina 1", sortOrder: 1, active: true, defaultWorkerId: marta.id } }),
    prisma.cabin.create({ data: { clinicId: clinic.id, name: "Cabina 2", sortOrder: 2, active: true, defaultWorkerId: lola.id } }),
    prisma.cabin.create({ data: { clinicId: clinic.id, name: "Cabina 3", sortOrder: 3, active: true, defaultWorkerId: admin.id } }),
  ])

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
      data: { clinicId: clinic.id, firstName: "María José", lastName: "Soriano", lastName2: "García", birthDate: new Date("1985-03-14"), phone: "600111222", whatsappOptIn: true },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Pepita", lastName: "Pérez", lastName2: "Molina", birthDate: new Date("1992-07-22"), phone: "600222333", whatsappOptIn: true },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Fernando", lastName: "López", lastName2: "Navarro", birthDate: new Date("1978-11-05"), phone: "600333444", whatsappOptIn: true },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Ana", lastName: "Martínez", lastName2: "Ruiz", birthDate: new Date("1990-01-30"), phone: "600444555", email: "ana@example.com", whatsappOptIn: false },
    }),
    prisma.customer.create({
      data: { clinicId: clinic.id, firstName: "Carlos", lastName: "Ruiz", lastName2: "Fernández", birthDate: new Date("1983-09-18"), phone: "600555666", whatsappOptIn: true },
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
    appt({ customerId: fernando.id, serviceId: electrica.id, workerId: lola.id, cabinId: cabins[2].id, startHour: 11, startMinute: 30, duration: 45, status: "CONFIRMED", reminderStatus: "DELIVERED" }),
    appt({ customerId: carlos.id, serviceId: masaje.id, workerId: marta.id, cabinId: cabins[0].id, startHour: 13, startMinute: 0, duration: 90, status: "PENDING", reminderStatus: "PENDING" }),
    appt({ customerId: ana.id, serviceId: manicura.id, workerId: lola.id, cabinId: cabins[1].id, startHour: 16, startMinute: 0, duration: 30, status: "DONE", reminderStatus: "NOT_SCHEDULED" }),
  ])

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

  console.log("✅ Seed completado:")
  console.log(`   Clínica: ${clinic.name}`)
  console.log(`   ${cabins.length} cabinas · 3 trabajadores · 5 servicios · 5 clientes · 5 citas`)
  console.log(`   2 proveedores (Dermoder, Lamdors) · 5 productos`)
  console.log(`   Login demo: ${admin.email} / admin`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

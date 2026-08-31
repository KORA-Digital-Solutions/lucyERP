/**
 * Datos de prueba SOLO para desarrollo local.
 *
 * Genera el historial que hace falta para que los informes digan algo: clientes
 * de demo, citas pasadas, ventas, cajas cerradas y movimientos de stock de los
 * últimos meses. NO toca prisma/seed.ts ni el día de hoy.
 *
 *   npx tsx scripts/seed-demo-sales.ts            → crea los datos
 *   npx tsx scripts/seed-demo-sales.ts --limpiar  → borra lo que creó
 *
 * Todo lo generado queda marcado con el prefijo "[demo]", y eso es lo que usa
 * --limpiar para revertirlo. En `Sale.notes`, `CashRegister.denominationNotes`
 * y `StockMovement.notes` el marcador es invisible, porque esos campos no se
 * pintan en ninguna pantalla. En `Customer.notes` y `Appointment.notes` SÍ se
 * ve, y se deja a propósito: son fichas y citas de gente inventada, y vale más
 * que cante al abrirlas que confundirlas con clientas de verdad.
 *
 * Es dato de demo, no de referencia: no debe ejecutarse contra producción.
 */
import { PrismaClient } from "@prisma/client"

// El cliente lo inyecta quien llama: prisma/seed.ts reutiliza el suyo y la
// entrada por CLI crea uno propio.

const MARKER = "[demo]"

/**
 * Meses de historia hacia atrás. Es la constante que hay que subir cuando los
 * informes anuales necesiten con qué compararse: con 4 salen bien "este mes",
 * "mes pasado" y "trimestre", pero "año" y la comparativa contra el año pasado
 * siguen siendo el mismo dato, y con el umbral de inactividad en 180 días no
 * puede haber ni un cliente inactivo. Subirlo alarga la ejecución en
 * proporción.
 */
const MESES = 4

/**
 * Las altas de cliente se reparten mucho más atrás que las ventas. Si toda la
 * clientela fuese de estos cuatro meses, el centro parecería recién abierto y
 * cualquier cuenta de "nuevos vs. de siempre" saldría con todo en la columna
 * de nuevos.
 */
const MESES_DE_ALTAS = 30

const CLIENTES_DEMO = 12
const FLOAT_CENTS = 15000 // 150 € que se quedan en caja de un día para otro

/** A cuántas unidades sube el pedido mensual al proveedor cada producto. */
const STOCK_OBJETIVO = 12

/* ─── Aleatoriedad determinista (misma salida en cada ejecución) ──────────── */

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260813)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))

/* ─── Fechas ─────────────────────────────────────────────────────────────── */

// La caja se indexa por fecha UTC (ver openCashRegister), así que los días se
// manejan a mediodía para que la fecha local y la UTC coincidan siempre.
function dateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Un Date en ese día, a los N minutos desde medianoche (hora local). */
function aLaHora(dia: Date, minutos: number) {
  const d = new Date(dia)
  d.setHours(Math.floor(minutos / 60), minutos % 60, 0, 0)
  return d
}

function aMinutos(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

function haceDias(n: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

/* ─── Clientes de demo ───────────────────────────────────────────────────── */

/**
 * Gente inventada. Los cinco clientes de `prisma/seed.ts` no dan para ningún
 * informe de clientela —ni ranking, ni ticket medio creíble, ni nuevos contra
 * recurrentes—, así que aquí se añaden unos cuantos más.
 *
 * Van en este script y no en el seed principal a propósito: son relleno para
 * mirar informes en local, y el día que sobren se borran con --limpiar sin
 * tocar los datos de referencia.
 */
const NOMBRES_DEMO = [
  { firstName: "Beatriz", lastName: "Cano", lastName2: "Gil", sex: "FEMALE" },
  { firstName: "Rocío", lastName: "Herrera", lastName2: "Vidal", sex: "FEMALE" },
  { firstName: "Nuria", lastName: "Ibáñez", lastName2: "Ortega", sex: "FEMALE" },
  { firstName: "Silvia", lastName: "Peña", lastName2: "Redondo", sex: "FEMALE" },
  { firstName: "Miguel", lastName: "Duarte", lastName2: "Cuesta", sex: "MALE" },
  { firstName: "Elena", lastName: "Prieto", lastName2: "Vargas", sex: "FEMALE" },
  { firstName: "Cristina", lastName: "Bravo", lastName2: "Nieto", sex: "FEMALE" },
  { firstName: "Javier", lastName: "Sáez", lastName2: "Lorenzo", sex: "MALE" },
  { firstName: "Marina", lastName: "Calvo", lastName2: "Espinosa", sex: "FEMALE" },
  { firstName: "Patricia", lastName: "Nogales", lastName2: "Rey", sex: "FEMALE" },
  { firstName: "Alicia", lastName: "Ferrer", lastName2: "Santos", sex: "FEMALE" },
  { firstName: "Óscar", lastName: "Benítez", lastName2: "Aguilar", sex: "MALE" },
] as const

const ORIGENES = ["OTHER_CLIENT", "SOCIAL_MEDIA", "INTERNET", "ADVERTISING", "WALK_BY", "OTHER"]

async function crearClientesDemo(prisma: PrismaClient, clinicId: string) {
  // Los expedientes siguen la numeración del centro, sin huecos ni rangos
  // reservados: es el número de la carpeta física y no puede saltar.
  const { _max } = await prisma.customer.aggregate({ where: { clinicId }, _max: { fileNumber: true } })
  let siguiente = (_max.fileNumber ?? 0) + 1

  for (let i = 0; i < Math.min(CLIENTES_DEMO, NOMBRES_DEMO.length); i++) {
    const p = NOMBRES_DEMO[i]
    const alta = haceDias(between(20, MESES_DE_ALTAS * 30))
    await prisma.customer.create({
      data: {
        clinicId,
        fileNumber: siguiente++,
        firstName: p.firstName,
        lastName: p.lastName,
        lastName2: p.lastName2,
        sex: p.sex,
        phone: `+346${20000000 + i * 111}`,
        referralSource: pick(ORIGENES),
        whatsappOptIn: rnd() < 0.8,
        notes: `${MARKER} Cliente inventado por scripts/seed-demo-sales.ts`,
        createdAt: alta,
        updatedAt: alta,
      },
    })
  }
}

/* ─── Limpieza ───────────────────────────────────────────────────────────── */

async function limpiar(prisma: PrismaClient) {
  const sales = await prisma.sale.findMany({
    where: { notes: { startsWith: MARKER } },
    select: { id: true },
  })
  const saleIds = sales.map((s) => s.id)

  if (saleIds.length > 0) {
    // Deshacer el saldo movido por las tarjetas regalo de prueba y por lo que
    // se pagó con saldo. `amountCents` ya viene con signo (positivo al
    // regalar, negativo al gastar), así que el mismo decrement vale para los
    // dos casos.
    const movements = await prisma.customerBalanceMovement.findMany({
      where: { saleId: { in: saleIds } },
      select: { customerId: true, amountCents: true },
    })
    for (const m of movements) {
      await prisma.customer.update({
        where: { id: m.customerId },
        data: { balanceCents: { decrement: m.amountCents } },
      })
    }
    await prisma.customerBalanceMovement.deleteMany({ where: { saleId: { in: saleIds } } })

    // Las líneas caen en cascada con la venta, y con ellas la referencia a la
    // cita: por eso las ventas se borran antes que las citas.
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } })
  }

  // Devolver el stock que movió el script, del tipo que fuera. El signo lo
  // pone el tipo salvo en ADJUST, donde ya viene en `quantity`.
  //
  // Se buscan por dos caminos porque la versión anterior de este script no
  // marcaba los movimientos: los suyos solo se reconocen por la venta de la
  // que colgaban. Sin esta segunda vía, limpiar una base sembrada con la
  // versión vieja borraba las ventas pero dejaba los movimientos huérfanos y
  // el stock descontado para siempre.
  const dondeEstan = { OR: [{ notes: { startsWith: MARKER } }, { saleId: { in: saleIds } }] }
  const stockMovs = await prisma.stockMovement.findMany({
    where: dondeEstan,
    select: { id: true, productId: true, type: true, quantity: true },
  })
  for (const sm of stockMovs) {
    const delta =
      sm.type === "ENTRY" ? -sm.quantity
      : sm.type === "ADJUST" ? -sm.quantity
      : sm.quantity // CONSUME y SALE descontaron, así que se devuelven
    await prisma.product.update({ where: { id: sm.productId }, data: { stock: { increment: delta } } })
  }
  await prisma.stockMovement.deleteMany({ where: dondeEstan })

  const citas = await prisma.appointment.deleteMany({ where: { notes: { startsWith: MARKER } } })
  const cajas = await prisma.cashRegister.deleteMany({
    where: { denominationNotes: { startsWith: MARKER } },
  })
  // Los recordatorios no los crea este script, pero si alguien le ha puesto
  // uno a mano a un cliente de prueba, la FK impediría borrarlo.
  const demo = await prisma.customer.findMany({ where: { notes: { startsWith: MARKER } }, select: { id: true } })
  const demoIds = demo.map((c) => c.id)
  await prisma.customerReminder.deleteMany({ where: { customerId: { in: demoIds } } })
  const clientes = await prisma.customer.deleteMany({ where: { id: { in: demoIds } } })

  console.log(
    `Borrado: ${saleIds.length} ventas · ${citas.count} citas · ${cajas.count} cajas · ` +
    `${stockMovs.length} movimientos de stock · ${clientes.count} clientes de prueba.`,
  )
}

/* ─── Generación ─────────────────────────────────────────────────────────── */

async function generar(prisma: PrismaClient) {
  const clinic = await prisma.clinic.findFirst({ orderBy: { createdAt: "asc" } })
  if (!clinic) throw new Error("No hay ninguna clínica en la BD. Ejecuta antes npm run db:seed.")

  await crearClientesDemo(prisma, clinic.id)

  const [users, customers, services, products, cabins, clinicSlots, workerSlots, holidays] =
    await Promise.all([
      prisma.user.findMany({ where: { clinicId: clinic.id, active: true }, select: { id: true, name: true } }),
      prisma.customer.findMany({ where: { clinicId: clinic.id, active: true }, select: { id: true, createdAt: true, balanceCents: true } }),
      prisma.service.findMany({ where: { clinicId: clinic.id, active: true } }),
      prisma.product.findMany({ where: { clinicId: clinic.id, active: true } }),
      prisma.cabin.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.clinicWeeklySlot.findMany({ where: { clinicId: clinic.id } }),
      prisma.workerWeeklySlot.findMany({ where: { clinicId: clinic.id } }),
      prisma.holiday.findMany({ where: { clinicId: clinic.id }, select: { date: true } }),
    ])

  if (!users.length || !customers.length || !services.length || !cabins.length) {
    throw new Error("Faltan usuarios, clientes, servicios o cabinas. Ejecuta antes npm run db:seed.")
  }

  const festivos = new Set(holidays.map((h) => h.date))

  // Horario de cada trabajadora por día de la semana. Sin esto las citas
  // pasadas caerían fuera del contrato de cada una —Marta trabaja martes tarde
  // y jueves mañana— y la ocupación por empleada sería una cifra inventada.
  const horario = new Map<string, Map<number, { from: number; to: number }[]>>()
  for (const s of workerSlots) {
    const porDia = horario.get(s.workerId) ?? new Map<number, { from: number; to: number }[]>()
    const tramos = porDia.get(s.dayOfWeek) ?? []
    tramos.push({ from: aMinutos(s.startTime), to: aMinutos(s.endTime) })
    porDia.set(s.dayOfWeek, tramos)
    horario.set(s.workerId, porDia)
  }
  const trabajaEn = (workerId: string, dow: number, from: number, to: number) =>
    (horario.get(workerId)?.get(dow) ?? []).some((t) => from >= t.from && to <= t.to)

  // Stock y saldo se llevan en memoria y se vuelcan al final: así no hace
  // falta un UPDATE por cada movimiento.
  const stockLeft = new Map(products.map((p) => [p.id, p.stock]))
  // Parte del saldo que ya tuviera cada cliente: al final se escribe el valor
  // absoluto, así que hay que arrancar del que hay y no de cero.
  const saldo = new Map(customers.map((c) => [c.id, c.balanceCents]))
  const saldoInicial = new Map(saldo)

  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  const desde = new Date(hoy)
  desde.setMonth(desde.getMonth() - MESES)

  let carryOverCents = FLOAT_CENTS
  let mesDelUltimoPedido = -1
  let ajusteHecho = false
  let ventas = 0, citasCreadas = 0, canceladas = 0, cajasCreadas = 0, movimientos = 0
  const porMes = new Map<string, { ventas: number; cents: number }>()

  for (const cursor = new Date(desde); cursor < hoy; cursor.setDate(cursor.getDate() + 1)) {
    const dia = new Date(cursor)
    const key = dateKey(dia)
    const dow = dia.getDay()

    // El centro abre cuando dice su horario semanal, no cuando lo diga este
    // script: si el seed cierra los sábados, aquí tampoco se factura.
    const slotsHoy = clinicSlots.filter((s) => s.dayOfWeek === dow)
    if (!slotsHoy.length || festivos.has(key)) continue

    const abre = Math.min(...slotsHoy.map((s) => aMinutos(s.startTime)))
    const cierra = Math.max(...slotsHoy.map((s) => aMinutos(s.endTime)))

    if (await prisma.cashRegister.findUnique({ where: { clinicId_date: { clinicId: clinic.id, date: key } } })) {
      continue // ya había caja de ese día: no se pisa
    }

    /* Pedido al proveedor, el primer día abierto de cada mes. Es lo que lee el
       informe de compras, valorado a coste. */
    if (dia.getMonth() !== mesDelUltimoPedido) {
      mesDelUltimoPedido = dia.getMonth()
      for (const p of products) {
        const faltan = STOCK_OBJETIVO - (stockLeft.get(p.id) ?? 0)
        if (faltan <= 0) continue
        await prisma.stockMovement.create({
          data: {
            productId: p.id, userId: pick(users).id, type: "ENTRY", quantity: faltan,
            notes: `${MARKER} Pedido mensual al proveedor`, createdAt: aLaHora(dia, abre),
          },
        })
        stockLeft.set(p.id, (stockLeft.get(p.id) ?? 0) + faltan)
        movimientos++
      }
    }

    /* Consumo en cabina, una vez por semana. */
    if (dow === 1 && products.length) {
      const p = pick(products)
      if ((stockLeft.get(p.id) ?? 0) > 0) {
        await prisma.stockMovement.create({
          data: {
            productId: p.id, userId: pick(users).id, type: "CONSUME", quantity: 1,
            notes: `${MARKER} Consumo en cabina`, createdAt: aLaHora(dia, abre + 30),
          },
        })
        stockLeft.set(p.id, (stockLeft.get(p.id) ?? 0) - 1)
        movimientos++
      }
    }

    /* Una regularización de recuento en todo el período, para que el tipo
       ADJUST tenga al menos un ejemplo. */
    if (!ajusteHecho && dia.getMonth() === hoy.getMonth() && products.length) {
      ajusteHecho = true
      const p = pick(products)
      await prisma.stockMovement.create({
        data: {
          productId: p.id, userId: pick(users).id, type: "ADJUST", quantity: -1,
          notes: `${MARKER} Recuento: faltaba una unidad`, createdAt: aLaHora(dia, cierra - 30),
        },
      })
      stockLeft.set(p.id, (stockLeft.get(p.id) ?? 0) - 1)
      movimientos++
    }

    // Solo puede tener cita quien ya era cliente ese día. Es lo que hace que
    // "nuevos vs. recurrentes" signifique algo.
    const clientela = customers.filter((c) => c.createdAt <= dia)
    if (!clientela.length) continue

    /* La agenda del día. Las citas se colocan una detrás de otra en cada
       cabina y solo con una trabajadora que tenga horario a esa hora, así que
       la agenda de los meses pasados es una agenda posible: nadie en dos
       sitios a la vez ni dos personas en la misma cabina. La ocupación se mide
       sobre esto; si se solapasen, el informe mentiría. */
    const libreEnCabina = cabins.map(() => abre)
    const ocupadaHasta = new Map(users.map((u) => [u.id, 0]))
    const agenda: {
      cabinId: string; workerId: string; customerId: string
      servicio: (typeof services)[number]; inicio: number
    }[] = []

    for (let i = 0; i < between(3, 6); i++) {
      const servicio = pick(services)
      const dur = servicio.durationMinutes
      const orden = cabins.map((_, idx) => idx).sort((a, b) => libreEnCabina[a] - libreEnCabina[b])
      let colocada = false

      for (const idx of orden) {
        const inicio = libreEnCabina[idx]
        if (inicio + dur > cierra) continue
        // El barrido empieza en una distinta cada vez: si no, la primera de la
        // lista se llevaría casi todas las citas.
        const desdeIdx = between(0, users.length - 1)
        const libre = users
          .map((_, k) => users[(desdeIdx + k) % users.length])
          .find((u) => (ocupadaHasta.get(u.id) ?? 0) <= inicio && trabajaEn(u.id, dow, inicio, inicio + dur))
        if (!libre) continue

        libreEnCabina[idx] = inicio + dur
        ocupadaHasta.set(libre.id, inicio + dur)
        agenda.push({ cabinId: cabins[idx].id, workerId: libre.id, customerId: pick(clientela).id, servicio, inicio })
        colocada = true
        break
      }
      if (!colocada) break // no cabe una más: el día está lleno
    }

    let cashCents = 0
    let cardCents = 0

    for (const c of agenda) {
      const startAt = aLaHora(dia, c.inicio)
      const endAt = aLaHora(dia, c.inicio + c.servicio.durationMinutes)
      const pedidaEl = new Date(startAt.getTime() - between(2, 14) * 86_400_000)

      // Una de cada diez se cae: unas avisan y otras no aparecen. Sin esto
      // saldría un centro donde no falla nadie nunca.
      const suerte = rnd()
      const status = suerte < 0.06 ? "CANCELLED" : suerte < 0.10 ? "NO_SHOW" : "DONE"

      const cita = await prisma.appointment.create({
        data: {
          clinicId: clinic.id,
          customerId: c.customerId,
          serviceId: c.servicio.id,
          workerId: c.workerId,
          cabinId: c.cabinId,
          startAt,
          endAt,
          durationMinutes: c.servicio.durationMinutes,
          status,
          reminderStatus: "SENT",
          notes: `${MARKER} Cita generada por scripts/seed-demo-sales.ts`,
          cancelledAt: status === "CANCELLED" ? new Date(startAt.getTime() - 86_400_000) : null,
          cancelledByUserId: status === "CANCELLED" ? pick(users).id : null,
          cancelReason: status === "CANCELLED"
            ? pick(["Le ha surgido un imprevisto", "Se encuentra mal", "Cambia de día"])
            : null,
          createdAt: pedidaEl,
          updatedAt: pedidaEl,
        },
      })
      citasCreadas++
      if (status !== "DONE") { canceladas++; continue }

      // Se cobra al terminar, que es como sale del panel de la agenda.
      const createdAt = endAt
      const cobra = pick(users) // quien está en el mostrador, no quien atiende
      const precio = c.servicio.pricingType === "PER_MINUTE" && c.servicio.pricePerMinuteCents
        ? c.servicio.pricePerMinuteCents * c.servicio.durationMinutes
        : c.servicio.priceCents
      const dtoServicio = rnd() < 0.2 ? pick([10, 15, 20]) : 0

      const lines: {
        type: string; serviceId?: string; productId?: string; description: string
        quantity: number; unitPriceCents: number; discountPercent: number
        durationMinutes?: number | null; totalCents: number
        workerId?: string | null; appointmentId?: string | null
      }[] = [{
        type: "SERVICE",
        serviceId: c.servicio.id,
        description: c.servicio.name,
        quantity: 1,
        unitPriceCents: precio,
        discountPercent: dtoServicio,
        durationMinutes: c.servicio.pricingType === "PER_MINUTE" ? c.servicio.durationMinutes : null,
        totalCents: Math.round(precio * (1 - dtoServicio / 100)),
        // Quien atiende no es quien cobra: es justo lo que mide el informe de
        // facturación por empleada.
        workerId: c.workerId,
        appointmentId: cita.id,
      }]

      // A veces se lleva algo para casa.
      if (products.length && rnd() < 0.3) {
        const p = pick(products)
        if ((stockLeft.get(p.id) ?? 0) > 0) {
          const dto = rnd() < 0.2 ? pick([10, 15]) : 0
          lines.push({
            type: "PRODUCT", productId: p.id, description: p.name, quantity: 1,
            unitPriceCents: p.priceCents, discountPercent: dto,
            totalCents: Math.round(p.priceCents * (1 - dto / 100)),
            workerId: c.workerId,
          })
          stockLeft.set(p.id, (stockLeft.get(p.id) ?? 0) - 1)
        }
      }

      const subtotalCents = lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0)
      const totalCents = lines.reduce((a, l) => a + l.totalCents, 0)

      // Mismo reparto que en el TPV: la mayoría en efectivo, algo en tarjeta,
      // alguna que se paga con el saldo de una tarjeta regalo y alguna que se
      // queda a deber (esa no entra en caja).
      const disponible = saldo.get(c.customerId) ?? 0
      const r = rnd()
      const paymentMethod =
        disponible >= totalCents && r < 0.35 ? "GIFT_CARD"
        : r < 0.55 ? "CASH"
        : r < 0.90 ? "CARD"
        : "DEBT"
      const status_ = paymentMethod === "DEBT" ? "DEBT" : "PAID"

      const sale = await prisma.sale.create({
        data: {
          clinicId: clinic.id,
          customerId: c.customerId,
          userId: cobra.id,
          saleType: "SALE",
          status: status_,
          paymentMethod,
          subtotalCents,
          discountCents: subtotalCents - totalCents,
          totalCents,
          paidCents: paymentMethod === "DEBT" ? 0 : totalCents,
          notes: MARKER,
          createdAt,
          updatedAt: createdAt,
          lines: { create: lines },
        },
      })

      for (const l of lines.filter((x) => x.type === "PRODUCT")) {
        await prisma.stockMovement.create({
          data: {
            productId: l.productId!, userId: cobra.id, type: "SALE", quantity: l.quantity,
            saleId: sale.id, notes: `${MARKER} Venta en mostrador`, createdAt,
          },
        })
        movimientos++
      }

      if (paymentMethod === "GIFT_CARD") {
        await prisma.customerBalanceMovement.create({
          data: {
            clinicId: clinic.id, customerId: c.customerId, userId: cobra.id,
            type: "BALANCE_USED", amountCents: -totalCents, saleId: sale.id, createdAt,
          },
        })
        saldo.set(c.customerId, disponible - totalCents)
      }

      if (paymentMethod === "CASH") cashCents += totalCents
      if (paymentMethod === "CARD") cardCents += totalCents
      ventas++
      const mes = key.slice(0, 7)
      const acc = porMes.get(mes) ?? { ventas: 0, cents: 0 }
      porMes.set(mes, { ventas: acc.ventas + 1, cents: acc.cents + totalCents })
    }

    /* Alguna tarjeta regalo suelta: no lleva cita, se vende en el mostrador y
       abona saldo a otra persona. Es lo que alimenta el informe de tarjetas
       regalo (vendido contra pendiente de consumir). */
    if (clientela.length > 1 && rnd() < 0.12) {
      const compra = pick(clientela)
      const destinatario = pick(clientela.filter((x) => x.id !== compra.id))
      const importe = pick([3000, 5000, 8000, 10000])
      const cobra = pick(users)
      const atiende = pick(users)
      const createdAt = aLaHora(dia, between(abre, cierra - 30))
      const paymentMethod = rnd() < 0.5 ? "CASH" : "CARD"

      const sale = await prisma.sale.create({
        data: {
          clinicId: clinic.id, customerId: compra.id, userId: cobra.id,
          saleType: "GIFT_CARD", status: "PAID", paymentMethod,
          subtotalCents: importe, discountCents: 0, totalCents: importe, paidCents: importe,
          notes: MARKER, createdAt, updatedAt: createdAt,
          lines: {
            create: [{
              type: "GIFT_CARD", description: "Tarjeta regalo", quantity: 1,
              unitPriceCents: importe, discountPercent: 0, totalCents: importe,
              workerId: atiende.id, notes: "Para un tratamiento facial",
            }],
          },
        },
      })
      await prisma.customerBalanceMovement.create({
        data: {
          clinicId: clinic.id, customerId: destinatario.id, userId: cobra.id,
          type: "GIFT_CARD_IN", amountCents: importe, saleId: sale.id,
          notes: "Tarjeta regalo", createdAt,
        },
      })
      saldo.set(destinatario.id, (saldo.get(destinatario.id) ?? 0) + importe)

      if (paymentMethod === "CASH") cashCents += importe
      else cardCents += importe
      ventas++
      const mes = key.slice(0, 7)
      const acc = porMes.get(mes) ?? { ventas: 0, cents: 0 }
      porMes.set(mes, { ventas: acc.ventas + 1, cents: acc.cents + importe })
    }

    /* Caja del día, ya cerrada. Alguna con descuadre para ver el aviso. */
    const openingCashCents = carryOverCents
    const expectedCash = openingCashCents + cashCents
    const descuadre = rnd() < 0.15 ? pick([-500, -250, 250, 1000]) : 0
    const closingDeclaredCents = Math.max(0, expectedCash + descuadre)
    await prisma.cashRegister.create({
      data: {
        clinicId: clinic.id,
        date: key,
        status: "CLOSED",
        openingCashCents,
        totalCardCents: cardCents,
        totalCashCents: cashCents,
        closingDeclaredCents,
        closingKeptCents: FLOAT_CENTS,
        differenceCents: closingDeclaredCents - expectedCash,
        denominationNotes: `${MARKER} 2×50€, 4×20€, 3×10€`,
        closedByUserId: pick(users).id,
        closedAt: aLaHora(dia, cierra + 15),
        createdAt: aLaHora(dia, abre),
        updatedAt: aLaHora(dia, cierra + 15),
      },
    })
    cajasCreadas++
    carryOverCents = FLOAT_CENTS
  }

  // Volcado final de stock y saldo, una escritura por fila tocada.
  for (const [productId, stock] of stockLeft) {
    await prisma.product.update({ where: { id: productId }, data: { stock } })
  }
  for (const [customerId, cents] of saldo) {
    if (cents === saldoInicial.get(customerId)) continue
    await prisma.customer.update({ where: { id: customerId }, data: { balanceCents: cents } })
  }

  for (const [mes, d] of [...porMes.entries()].sort()) {
    console.log(`${mes}   ${String(d.ventas).padStart(3)} ventas   ${(d.cents / 100).toFixed(2).padStart(10)} €`)
  }
  console.log(
    `\nCreados: ${CLIENTES_DEMO} clientes · ${citasCreadas} citas (${canceladas} caídas) · ` +
    `${ventas} ventas · ${cajasCreadas} cajas cerradas · ${movimientos} movimientos de stock.`,
  )
}

/* ─── Entrada ────────────────────────────────────────────────────────────── */

/**
 * Siembra los últimos meses de actividad de demostración. Reejecutable:
 * siempre limpia antes lo suyo (identificado por el MARKER) y regenera con la
 * misma semilla, así que produce el mismo resultado cada vez.
 *
 * Es dato de demo, no de referencia: no debe ejecutarse contra producción.
 */
export async function seedDemoSales(prisma: PrismaClient, opts: { limpiarSolo?: boolean } = {}) {
  await limpiar(prisma) // siempre se limpia antes, así el script es reejecutable
  if (!opts.limpiarSolo) await generar(prisma)
}

// Entrada por CLI: `tsx scripts/seed-demo-sales.ts [--limpiar]`.
// No se ejecuta al importar.
if (require.main === module) {
  const prisma = new PrismaClient()
  seedDemoSales(prisma, { limpiarSolo: process.argv.includes("--limpiar") })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}

/**
 * Los datos que necesita cada informe, uno a uno.
 *
 * Antes esto era un único fichero que lanzaba veinticinco consultas y armaba
 * un objeto gigante con los catorce informes dentro, se mirara el que se
 * mirara. Ahora cada informe tiene su pantalla y pide lo suyo: entrar a ver la
 * deuda ya no cuesta calcular la ocupación de la agenda de todo el año.
 *
 * Lo que se repite —resolver el período, traerse las líneas de venta, poner
 * nombre a las empleadas— vive aquí para que las doce pantallas cuenten lo
 * mismo. Los cálculos siguen en lib/reports.ts, que es puro y se testea solo;
 * esto es únicamente el ir a buscar.
 */

import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { customerLabel } from "@/lib/format"
import {
  esPeriodoId, resolverPeriodo,
  diasDelPeriodo, horasDeAgenda,
  type CitaDeInforme, type LineaDeInforme, type Periodo,
} from "@/lib/reports"

/** Lo que llega por la URL en cualquier informe. */
export type ParamsDeInforme = Promise<{ periodo?: string; desde?: string; hasta?: string }>

/** El período tal cual lo pinta la pantalla: fechas como texto ISO. */
export type PeriodoEnPantalla = {
  id: ReturnType<typeof resolverPeriodo>["id"]
  etiqueta: string
  etiquetaAnterior: string
  desde: string
  hasta: string
}

/**
 * El arranque común de todo informe: qué centro y qué período.
 *
 * Lo que llegue raro por la URL cae en «este mes» en vez de reventar: son
 * pantallas a las que se llega con enlaces guardados y compartidos por chat.
 */
export async function abrirInforme(searchParams: ParamsDeInforme) {
  const { periodo, desde, hasta } = await searchParams
  const clinic = await getActiveClinic()
  const p = resolverPeriodo(esPeriodoId(periodo) ? periodo : "mes", { desde, hasta })
  return { clinic, p, enPantalla: aPantalla(p) }
}

export function aPantalla(p: Periodo): PeriodoEnPantalla {
  return {
    id: p.id,
    etiqueta: p.etiqueta,
    etiquetaAnterior: p.anterior.etiqueta,
    desde: p.desde.toISOString(),
    hasta: p.hasta.toISOString(),
  }
}

/* ─── Líneas de venta ────────────────────────────────────────────────────── */

/**
 * Las líneas de venta del período, que es de donde sale casi todo.
 *
 * Sin filtrar por tipo: las tarjetas regalo y los bonos no facturan, pero hay
 * informes que dicen cuánto saldo se ha vendido y para eso hacen falta sus
 * líneas. Cada informe se queda con los tipos que le tocan.
 */
export async function lineasDelPeriodo(clinicId: string, p: Periodo): Promise<LineaDeInforme[]> {
  const filas = await prisma.saleLine.findMany({
    where: { sale: { clinicId, createdAt: { gte: p.desde, lte: p.hasta } } },
    select: {
      saleId: true, type: true, quantity: true, totalCents: true, workerId: true,
      unitPriceCents: true, serviceId: true, productId: true,
      service: { select: { name: true, family: { select: { name: true } } } },
      product: { select: { name: true } },
      // Quién cobró el ticket y de quién es: es quien aplica el descuento y
      // quien se lo gasta.
      sale: { select: { userId: true, customerId: true, createdAt: true } },
    },
  })

  return filas.map((l) => ({
    saleId: l.saleId,
    type: l.type,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    totalCents: l.totalCents,
    workerId: l.workerId,
    cobradoPorId: l.sale.userId,
    customerId: l.sale.customerId,
    fecha: l.sale.createdAt,
    serviceId: l.serviceId,
    serviceName: l.service?.name ?? null,
    familyName: l.service?.family.name ?? null,
    productId: l.productId,
    productName: l.product?.name ?? null,
  }))
}

/* ─── Personas ───────────────────────────────────────────────────────────── */

/**
 * Las usuarias del centro, con las desactivadas incluidas: si alguien facturó
 * en el período y luego se fue, su fila tiene que seguir teniendo nombre.
 */
export async function usuariasDelCentro(clinicId: string) {
  const usuarias = await prisma.user.findMany({
    where: { clinicId },
    select: { id: true, name: true, lastName: true, color: true, active: true },
  })
  const porId = new Map(usuarias.map((u) => [u.id, u]))
  const nombreDe = (id: string | null) => {
    const u = id ? porId.get(id) : null
    return u ? [u.name, u.lastName].filter(Boolean).join(" ") : "Sin asignar"
  }
  return { usuarias, porId, nombreDe }
}

/* ─── Fichas de cliente ──────────────────────────────────────────────────── */

/** Las fichas del centro, con su nombre ya montado como se lee en pantalla. */
export async function fichasDeCliente(clinicId: string) {
  const fichas = await prisma.customer.findMany({
    where: { clinicId },
    select: {
      id: true, firstName: true, lastName: true, lastName2: true,
      phone: true, active: true, createdAt: true, balanceCents: true,
    },
  })
  const nombreDe = new Map(fichas.map((c) => [c.id, customerLabel(c)]))
  return { fichas, nombreDe }
}

/* ─── Agenda y horarios ──────────────────────────────────────────────────── */

/** Último instante del día. */
function finDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/**
 * Las horas de agenda del período: las que el centro y cada empleada tenían
 * disponibles, que es el denominador de la ocupación y de las jornadas.
 *
 * La actividad se corta en el día de hoy: «Año» llega al 31 de diciembre, y
 * contar como horas disponibles las de los meses que no han pasado hundiría la
 * ocupación sin que nadie hubiera hecho nada mal.
 */
export async function agendaDelPeriodo(clinicId: string, p: Periodo, hoy = new Date()) {
  const dias = diasDelPeriodo(p.desde, p.hasta, hoy)
  // Con el período entero en el futuro no hay ni un día que mirar; el rango
  // vacío evita traerse el histórico completo de horarios por error.
  const primerDia = dias[0] ?? "9999-12-31"
  const ultimoDia = dias[dias.length - 1] ?? "0000-01-01"

  const [
    clinicWeekly, clinicOverrides, festivos, workerWeekly, workerOverrides, ausencias,
  ] = await Promise.all([
    prisma.clinicWeeklySlot.findMany({
      where: { clinicId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.clinicScheduleOverride.findMany({
      where: { clinicId, date: { gte: primerDia, lte: ultimoDia } },
      select: { date: true, closed: true, slots: { select: { startTime: true, endTime: true } } },
    }),
    prisma.holiday.findMany({
      where: { clinicId, date: { gte: primerDia, lte: ultimoDia } },
      select: { date: true },
    }),
    prisma.workerWeeklySlot.findMany({
      where: { clinicId },
      select: { workerId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.workerScheduleOverride.findMany({
      where: { clinicId, date: { gte: primerDia, lte: ultimoDia } },
      select: {
        workerId: true, date: true, closed: true,
        slots: { select: { startTime: true, endTime: true } },
      },
    }),
    prisma.workerLeave.findMany({
      where: { clinicId, date: { gte: primerDia, lte: ultimoDia } },
      select: { workerId: true, date: true, type: true },
    }),
  ])

  const { usuarias, nombreDe } = await usuariasDelCentro(clinicId)
  const empleadas = usuarias.map((u) => ({ id: u.id, nombre: nombreDe(u.id) }))

  const horas = horasDeAgenda(
    {
      dias,
      clinicWeekly,
      clinicOverrides,
      festivos: festivos.map((f) => f.date),
      workerWeekly,
      workerOverrides,
      ausencias,
    },
    empleadas.map((e) => e.id),
  )

  return { dias, horas, empleadas, ausencias, primerDia, ultimoDia }
}

/** Las citas del período, cortadas también en el día de hoy. */
export async function citasDelPeriodo(clinicId: string, p: Periodo, hoy = new Date()): Promise<CitaDeInforme[]> {
  const hastaVivido = p.hasta > hoy ? finDelDia(hoy) : p.hasta
  const citas = await prisma.appointment.findMany({
    where: { clinicId, startAt: { gte: p.desde, lte: hastaVivido } },
    select: {
      workerId: true, cabinId: true, status: true, startAt: true, durationMinutes: true,
      service: { select: { name: true } },
    },
  })
  return citas.map((c) => ({
    workerId: c.workerId,
    cabinId: c.cabinId,
    serviceName: c.service.name,
    status: c.status,
    startAt: c.startAt,
    durationMinutes: c.durationMinutes,
  }))
}

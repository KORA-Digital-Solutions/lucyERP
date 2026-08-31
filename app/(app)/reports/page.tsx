import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { customerLabel } from "@/lib/format"
import {
  FACTURA, cancelacionesYAusencias, clientesInactivos, consumoInterno, descuentos,
  deudaPendiente, diasDelPeriodo, esPeriodoId, evolucionMensual, facturacionPorEmpleada,
  finDeEvolucion, formasDeCobro, horasDeAgenda, horasTrabajadas, ingresosPorFamilia,
  inicioDeEvolucion, nuevasVsRecurrentes, ocupacionPorCabina, ocupacionPorEmpleada,
  porCliente, ranking, resolverPeriodo, tarjetasRegalo, totales, valorDeInventario, variacion,
  type CitaDeInforme, type ClienteDeCartera, type LineaDeInforme,
} from "@/lib/reports"
import { ReportsClient } from "@/components/reports-client"

// Las cifras cambian con cada cobro: la pantalla se calcula al pedirla.
export const dynamic = "force-dynamic"

const MESES_DE_EVOLUCION = 6

/** Último instante del día. */
function finDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>
}) {
  const { periodo, desde, hasta } = await searchParams
  const clinic = await getActiveClinic()
  const hoy = new Date()

  // Lo que llegue raro por la URL cae en "este mes" en vez de reventar: es una
  // pantalla a la que se llega con enlaces guardados.
  const p = resolverPeriodo(esPeriodoId(periodo) ? periodo : "mes", { desde, hasta })

  const delCentroEntre = (gte: Date, lte: Date) => ({
    sale: { clinicId: clinic.id, createdAt: { gte, lte } },
  })
  // La gráfica acaba en el mes en curso aunque el período llegue a diciembre.
  const ultimoMes = finDeEvolucion(p.hasta)
  const inicioEvolucion = inicioDeEvolucion(ultimoMes, MESES_DE_EVOLUCION)

  // La actividad se corta en el día de hoy: "Año" llega al 31 de diciembre, y
  // contar como horas disponibles —o como citas— las de los meses que no han
  // pasado hundiría la ocupación sin que nadie hubiera hecho nada mal.
  const dias = diasDelPeriodo(p.desde, p.hasta, hoy)
  const hastaVivido = p.hasta > hoy ? finDelDia(hoy) : p.hasta
  // Con el período entero en el futuro no hay ni un día que mirar; el rango
  // vacío evita traerse el histórico completo de horarios por error.
  const primerDia = dias[0] ?? "9999-12-31"
  const ultimoDia = dias[dias.length - 1] ?? "0000-01-01"
  // El cupo de vacaciones es anual: se mira el del año en que acaba el período.
  const anioDelPeriodo = ultimoMes.getFullYear()

  const [
    filas, ventas, tramoAnterior, filasEvolucion, usuarias,
  ] = await Promise.all([
    // Sin filtrar por tipo: las tarjetas regalo no facturan, pero la pantalla
    // dice cuánto saldo se ha vendido y para eso hacen falta sus líneas.
    prisma.saleLine.findMany({
      where: delCentroEntre(p.desde, p.hasta),
      select: {
        saleId: true, type: true, quantity: true, totalCents: true, workerId: true,
        unitPriceCents: true, serviceId: true, productId: true,
        service: { select: { name: true, family: { select: { name: true } } } },
        product: { select: { name: true } },
        // Quién cobró el ticket y de quién es: es quien aplica el descuento y
        // quien se lo gasta.
        sale: { select: { userId: true, customerId: true, createdAt: true } },
      },
    }),
    // La forma de cobro vive en la venta, no en la línea: se paga el ticket
    // entero de una manera, no cada concepto por su lado.
    prisma.sale.findMany({
      where: { clinicId: clinic.id, createdAt: { gte: p.desde, lte: p.hasta } },
      select: { paymentMethod: true, totalCents: true },
    }),
    prisma.saleLine.aggregate({
      _sum: { totalCents: true },
      where: { type: { in: FACTURA }, ...delCentroEntre(p.anterior.desde, p.anterior.hasta) },
    }),
    prisma.saleLine.findMany({
      where: { type: { in: FACTURA }, ...delCentroEntre(inicioEvolucion, p.hasta) },
      select: { type: true, totalCents: true, sale: { select: { createdAt: true } } },
    }),
    // También las desactivadas: si alguien facturó en el período y luego se
    // fue, su fila tiene que seguir teniendo nombre.
    prisma.user.findMany({
      where: { clinicId: clinic.id },
      select: { id: true, name: true, lastName: true, color: true, active: true },
    }),
  ])

  const [
    movimientos, productos, fichas, historialPorCliente, ultimaCitaPorCliente,
    ventasAdeudadas, movimientosDeSaldo,
  ] = await Promise.all([
    // Los movimientos de stock no llevan clinicId: se filtran por el producto.
    prisma.stockMovement.findMany({
      where: { product: { clinicId: clinic.id }, createdAt: { gte: p.desde, lte: p.hasta } },
      select: { productId: true, type: true, quantity: true },
    }),
    prisma.product.findMany({
      where: { clinicId: clinic.id },
      select: {
        id: true, name: true, costCents: true, priceCents: true,
        stock: true, stockMin: true, active: true,
        supplier: { select: { name: true } },
      },
    }),
    prisma.customer.findMany({
      where: { clinicId: clinic.id },
      select: {
        id: true, firstName: true, lastName: true, lastName2: true,
        phone: true, active: true, createdAt: true, balanceCents: true,
      },
    }),
    // Primera compra y gasto de toda la vida, para saber quién es nuevo y a
    // quién merece la pena recuperar. Se cuenta el ticket de venta (las
    // tarjetas regalo van por su propio saleType y no entran aquí).
    prisma.sale.groupBy({
      by: ["customerId"],
      where: { clinicId: clinic.id, saleType: "SALE" },
      _min: { createdAt: true },
      _sum: { totalCents: true },
    }),
    // Misma definición de "última visita" que el listado de clientes: la última
    // cita de la agenda, futuras incluidas.
    prisma.appointment.groupBy({
      by: ["customerId"],
      where: { clinicId: clinic.id, status: { in: ["DONE", "CONFIRMED", "PENDING"] } },
      _max: { startAt: true },
    }),
    // La deuda no se acota al período: lo que se debe se debe hasta que se paga.
    prisma.sale.findMany({
      where: { clinicId: clinic.id, status: "DEBT" },
      select: { customerId: true, createdAt: true, totalCents: true, paidCents: true },
    }),
    prisma.customerBalanceMovement.findMany({
      where: { clinicId: clinic.id, createdAt: { gte: p.desde, lte: p.hasta } },
      select: { type: true, amountCents: true },
    }),
  ])

  const [
    citas, cabinas, clinicWeekly, clinicOverrides, festivos,
    workerWeekly, workerOverrides, ausenciasDelPeriodo, ausenciasDelAnio, cupos,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, startAt: { gte: p.desde, lte: hastaVivido } },
      select: {
        workerId: true, cabinId: true, status: true, startAt: true, durationMinutes: true,
        service: { select: { name: true } },
      },
    }),
    prisma.cabin.findMany({
      where: { clinicId: clinic.id, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.clinicWeeklySlot.findMany({
      where: { clinicId: clinic.id },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.clinicScheduleOverride.findMany({
      where: { clinicId: clinic.id, date: { gte: primerDia, lte: ultimoDia } },
      select: { date: true, closed: true, slots: { select: { startTime: true, endTime: true } } },
    }),
    prisma.holiday.findMany({
      where: { clinicId: clinic.id, date: { gte: primerDia, lte: ultimoDia } },
      select: { date: true },
    }),
    prisma.workerWeeklySlot.findMany({
      where: { clinicId: clinic.id },
      select: { workerId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.workerScheduleOverride.findMany({
      where: { clinicId: clinic.id, date: { gte: primerDia, lte: ultimoDia } },
      select: {
        workerId: true, date: true, closed: true,
        slots: { select: { startTime: true, endTime: true } },
      },
    }),
    prisma.workerLeave.findMany({
      where: { clinicId: clinic.id, date: { gte: primerDia, lte: ultimoDia } },
      select: { workerId: true, date: true, type: true },
    }),
    // Del año entero, no del período: el saldo que queda es anual.
    prisma.workerLeave.findMany({
      where: { clinicId: clinic.id, date: { gte: `${anioDelPeriodo}-01-01`, lte: `${anioDelPeriodo}-12-31` } },
      select: { workerId: true, date: true, type: true },
    }),
    prisma.workerLeaveBalance.findMany({
      where: { clinicId: clinic.id, year: anioDelPeriodo },
      select: { workerId: true, vacationDaysTotal: true, personalDaysTotal: true },
    }),
  ])

  /* ─── Ingresos ─────────────────────────────────────────────────────────── */

  const lineas: LineaDeInforme[] = filas.map((l) => ({
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

  const resumen = totales(lineas)
  const rebajas = descuentos(lineas)
  const porNombre = new Map(usuarias.map((u) => [u.id, u]))
  const nombreDe = (id: string | null) => {
    const u = id ? porNombre.get(id) : null
    return u ? [u.name, u.lastName].filter(Boolean).join(" ") : "Sin asignar"
  }

  /* ─── Gastos ───────────────────────────────────────────────────────────── */

  const catalogo = productos.map((p) => ({
    id: p.id,
    nombre: p.name,
    proveedor: p.supplier?.name ?? null,
    costCents: p.costCents,
    priceCents: p.priceCents,
    stock: p.stock,
    stockMin: p.stockMin,
    activo: p.active,
  }))

  /* ─── Clientes ─────────────────────────────────────────────────────────── */

  const clientes = porCliente(lineas)
  const nombreDeCliente = new Map(fichas.map((c) => [c.id, customerLabel(c)]))
  const primeraCompraDe = new Map(
    historialPorCliente
      .filter((h): h is typeof h & { customerId: string } => h.customerId !== null)
      .map((h) => [h.customerId, h._min.createdAt ?? p.desde]),
  )
  const gastoHistoricoDe = new Map(
    historialPorCliente
      .filter((h): h is typeof h & { customerId: string } => h.customerId !== null)
      .map((h) => [h.customerId, h._sum.totalCents ?? 0]),
  )
  const ultimaCitaDe = new Map(
    ultimaCitaPorCliente.map((a) => [a.customerId, a._max.startAt]),
  )

  const cartera: ClienteDeCartera[] = fichas.map((c) => ({
    id: c.id,
    nombre: customerLabel(c),
    telefono: c.phone,
    activo: c.active,
    ultimaCita: ultimaCitaDe.get(c.id) ?? null,
    altaEn: c.createdAt,
    gastoHistoricoCents: gastoHistoricoDe.get(c.id) ?? 0,
  }))

  const inactivos = clientesInactivos(cartera, clinic.inactivityWarningDays ?? 180, hoy)
  const deuda = deudaPendiente(ventasAdeudadas, hoy)

  /* ─── Actividad ────────────────────────────────────────────────────────── */

  const citasDelPeriodo: CitaDeInforme[] = citas.map((c) => ({
    workerId: c.workerId,
    cabinId: c.cabinId,
    serviceName: c.service.name,
    status: c.status,
    startAt: c.startAt,
    durationMinutes: c.durationMinutes,
  }))

  const empleadas = usuarias.map((u) => ({ id: u.id, nombre: nombreDe(u.id) }))
  const horas = horasDeAgenda(
    {
      dias,
      clinicWeekly,
      clinicOverrides,
      festivos: festivos.map((f) => f.date),
      workerWeekly,
      workerOverrides,
      ausencias: ausenciasDelPeriodo,
    },
    empleadas.map((e) => e.id),
  )

  const jornadas = horasTrabajadas(
    empleadas, horas, ausenciasDelPeriodo, ausenciasDelAnio, cupos,
  // Quien ni tenía horario ni faltó ningún día no estaba: la fila sobra.
  ).filter((f) => f.minutos > 0 || f.vacaciones + f.asuntosPropios + f.otrasAusencias > 0)

  return (
    <ReportsClient
      periodo={{
        id: p.id,
        etiqueta: p.etiqueta,
        etiquetaAnterior: p.anterior.etiqueta,
        desde: p.desde.toISOString(),
        hasta: p.hasta.toISOString(),
      }}
      resumen={resumen}
      variacion={variacion(resumen.totalCents, tramoAnterior._sum.totalCents ?? 0)}
      ingresos={{
        empleadas: facturacionPorEmpleada(lineas).map((e) => {
          const u = e.workerId ? porNombre.get(e.workerId) : null
          return {
            ...e,
            nombre: nombreDe(e.workerId),
            color: u?.color ?? "#9AA0A6",
            activa: u?.active ?? false,
          }
        }),
        servicios: ranking(lineas, "SERVICE"),
        productos: ranking(lineas, "PRODUCT"),
        familias: ingresosPorFamilia(lineas),
        cobros: formasDeCobro(ventas),
        descuentos: {
          ...rebajas,
          filas: rebajas.filas.map((f) => ({ ...f, nombre: nombreDe(f.userId) })),
        },
        evolucion: evolucionMensual(
          filasEvolucion.map((l) => ({ createdAt: l.sale.createdAt, type: l.type, totalCents: l.totalCents })),
          ultimoMes,
          MESES_DE_EVOLUCION,
        ),
      }}
      gastos={{
        consumo: consumoInterno(movimientos, catalogo),
        inventario: valorDeInventario(catalogo, movimientos),
      }}
      clientes={{
        ranking: clientes.filas.map((f) => ({
          ...f,
          nombre: nombreDeCliente.get(f.customerId) ?? "Cliente borrado",
          primeraCompra: f.primeraCompra.toISOString(),
          ultimaCompra: f.ultimaCompra.toISOString(),
        })),
        sinClienteCents: clientes.sinClienteCents,
        sinClienteTickets: clientes.sinClienteTickets,
        gastoMedioCents: clientes.gastoMedioCents,
        frecuenciaMediaDias: clientes.frecuenciaMediaDias,
        repiten: clientes.repiten,
        captacion: nuevasVsRecurrentes(clientes.filas, primeraCompraDe, p.desde),
        inactivos: {
          ...inactivos,
          filas: inactivos.filas.map((f) => ({
            ...f,
            ultimaCita: f.ultimaCita?.toISOString() ?? null,
          })),
        },
        deuda: {
          ...deuda,
          filas: deuda.filas.map((f) => ({
            ...f,
            nombre: f.customerId
              ? nombreDeCliente.get(f.customerId) ?? "Cliente borrado"
              : "Venta sin ficha",
            desde: f.desde.toISOString(),
          })),
        },
        tarjetas: tarjetasRegalo(lineas, movimientosDeSaldo, fichas),
      }}
      actividad={{
        empleadas: ocupacionPorEmpleada(citasDelPeriodo, horas, empleadas),
        cabinas: ocupacionPorCabina(citasDelPeriodo, horas, cabinas.map((c) => ({ id: c.id, nombre: c.name }))),
        citas: cancelacionesYAusencias(citasDelPeriodo),
        jornadas,
        minutosCentro: horas.minutosCentro,
        diasAbiertos: horas.diasAbiertos,
        anio: anioDelPeriodo,
        // Con el período en el futuro no hay actividad que enseñar, y decirlo
        // es más honesto que pintar un montón de ceros.
        diasContados: dias.length,
      }}
    />
  )
}

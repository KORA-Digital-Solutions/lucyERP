/**
 * Los informes, en la parte que no toca la base de datos.
 *
 * Aquí vive lo que se puede equivocar en silencio: dónde empieza y acaba un
 * período, contra qué tramo se compara, y qué suma y qué no. Las consultas las
 * hace la página (app/(app)/reports/page.tsx) y le pasa las filas a estas
 * funciones, que así se pueden probar sin base de datos —ver tests/reports/.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ CUENTA COMO FACTURACIÓN
 *
 * Servicios y productos, y punto. Las tarjetas regalo NO se suman, aunque sean
 * dinero que entra por caja: una tarjeta se factura cuando se gasta, no cuando
 * se vende. Si contaran las dos veces —al venderla y al usar el saldo en un
 * tratamiento— el mes en que se regalan saldría inflado y el total del año no
 * cuadraría con nada. Se llevan aparte, en `saldoVendidoCents`.
 *
 * Sí entra lo que se queda a deber (`Sale.status = DEBT`): el servicio se ha
 * dado y está facturado, lo que falta es cobrarlo. Quién debe cuánto es otro
 * informe.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { HOME_CARE_FAMILY, WEEKDAY_LABELS } from "@/lib/enums"

/* ─── Períodos ───────────────────────────────────────────────────────────── */

export type PeriodoId = "mes" | "anterior" | "trimestre" | "anio" | "personalizado"

export const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: "mes", label: "Este mes" },
  { id: "anterior", label: "Mes pasado" },
  { id: "trimestre", label: "Trimestre" },
  { id: "anio", label: "Año" },
  { id: "personalizado", label: "Personalizado" },
]

/**
 * Hasta dónde atrás puede pedirse un período personalizado. Diez años son más
 * de lo que ningún centro va a mirar de una vez, y dejan el tramo de
 * comparación —otros diez años antes— dentro de fechas que la base entiende.
 */
export const MAX_ANIOS_PERSONALIZADO = 10

export type Periodo = {
  id: PeriodoId
  desde: Date
  hasta: Date
  etiqueta: string
  /** El tramo equivalente inmediatamente anterior: contra esto se compara. */
  anterior: { desde: Date; hasta: Date; etiqueta: string }
}

function inicioDelDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function finDelDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function inicioDelMes(anio: number, mes: number): Date {
  return new Date(anio, mes, 1, 0, 0, 0, 0)
}

/** Último instante del mes: el día 0 del siguiente es el último del actual. */
function finDelMes(anio: number, mes: number): Date {
  return new Date(anio, mes + 1, 0, 23, 59, 59, 999)
}

function sumarDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/**
 * Días de calendario entre dos fechas. Cuenta en UTC a propósito: restar
 * milisegundos sobre horas locales se equivoca en un día cada vez que el tramo
 * cruza un cambio de hora, porque esa madrugada dura 23 o 25 horas.
 */
function diasEntre(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86_400_000)
}

export function esPeriodoId(v: string | null | undefined): v is PeriodoId {
  return PERIODOS.some((p) => p.id === v)
}

/**
 * Convierte lo que llega por la URL en un rango de fechas concreto.
 *
 * `hoy` es un parámetro y no `new Date()` a secas para poder probar los bordes
 * —un 1 de enero, un 31 de marzo— sin depender del día en que se ejecute.
 *
 * Los rangos son naturales (el mes entero, el trimestre entero), no "los
 * últimos 30 días": la pregunta que se hace la propietaria es "cómo va agosto",
 * no "cómo han ido los últimos 30 días". Y como no hay ventas en el futuro,
 * coger el mes entero o hasta hoy da lo mismo en el mes en curso.
 */
export function resolverPeriodo(
  id: PeriodoId,
  opts: { hoy?: Date; desde?: string; hasta?: string } = {},
): Periodo {
  const hoy = opts.hoy ?? new Date()
  const anio = hoy.getFullYear()
  const mes = hoy.getMonth()

  const construir = (
    desde: Date, hasta: Date,
    antDesde: Date, antHasta: Date,
  ): Periodo => ({
    id, desde, hasta,
    etiqueta: rangoLegible(desde, hasta),
    anterior: { desde: antDesde, hasta: antHasta, etiqueta: rangoLegible(antDesde, antHasta) },
  })

  if (id === "anterior") {
    return construir(
      inicioDelMes(anio, mes - 1), finDelMes(anio, mes - 1),
      inicioDelMes(anio, mes - 2), finDelMes(anio, mes - 2),
    )
  }

  if (id === "trimestre") {
    const primerMes = Math.floor(mes / 3) * 3
    return construir(
      inicioDelMes(anio, primerMes), finDelMes(anio, primerMes + 2),
      inicioDelMes(anio, primerMes - 3), finDelMes(anio, primerMes - 1),
    )
  }

  if (id === "anio") {
    return construir(
      inicioDelMes(anio, 0), finDelMes(anio, 11),
      inicioDelMes(anio - 1, 0), finDelMes(anio - 1, 11),
    )
  }

  if (id === "personalizado") {
    // Las dos fechas se meten a la fuerza en una ventana con suelo y techo.
    //
    // No es paranoia: las escribe cualquiera en la URL, y un rango como
    // 0001-01-01 → 9999-12-31 son casi tres millones de días. El tramo de
    // comparación es igual de largo y va justo antes, así que restarlos
    // aterriza en el año −5960, que Prisma no sabe convertir a fecha y tumba
    // la página con un 500. Además, un informe de ocho mil años tampoco es una
    // pregunta que nadie se haga: el centro existe desde hace lo que existe.
    const suelo = inicioDelDia(new Date(anio - MAX_ANIOS_PERSONALIZADO, mes, hoy.getDate()))
    const techo = inicioDelDia(new Date(anio, 11, 31))
    const acotar = (d: Date) => (d < suelo ? suelo : d > techo ? techo : d)

    const desde = acotar(inicioDelDia(fechaDeParametro(opts.desde) ?? inicioDelMes(anio, mes)))
    const hastaBruto = acotar(inicioDelDia(fechaDeParametro(opts.hasta) ?? hoy))
    // Si vienen del revés se enderezan en vez de devolver un rango vacío: se
    // teclean a mano y equivocarse de orden es lo más fácil del mundo.
    const [ini, fin] = desde <= hastaBruto ? [desde, hastaBruto] : [hastaBruto, desde]
    // El tramo anterior es igual de largo y acaba la víspera. Contando ambos
    // extremos: del 10 al 19 son diez días, así que el anterior va del 31 al 9.
    const dias = diasEntre(ini, fin) + 1
    return construir(
      ini, finDelDia(fin),
      inicioDelDia(sumarDias(ini, -dias)), finDelDia(sumarDias(ini, -1)),
    )
  }

  // "mes" y cualquier cosa rara que llegue por la URL.
  return construir(
    inicioDelMes(anio, mes), finDelMes(anio, mes),
    inicioDelMes(anio, mes - 1), finDelMes(anio, mes - 1),
  )
}

/** "2026-08-31" → Date, o null si no es una fecha válida. */
export function fechaDeParametro(v: string | null | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [a, m, d] = v.split("-").map(Number)
  const fecha = new Date(a, m - 1, d)
  // Rechaza un 31 de febrero, que el constructor colaría como 3 de marzo.
  if (fecha.getFullYear() !== a || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null
  return fecha
}

export function aValorDeInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** "1 – 31 de agosto de 2026", "1 de julio – 30 de septiembre de 2026". */
export function rangoLegible(desde: Date, hasta: Date): string {
  const mismoAnio = desde.getFullYear() === hasta.getFullYear()
  const mesYAnio = hasta.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
  if (mismoAnio && desde.getMonth() === hasta.getMonth()) {
    return `${desde.getDate()} – ${hasta.getDate()} de ${mesYAnio}`
  }
  const ini = desde.toLocaleDateString("es-ES", {
    day: "numeric", month: "long", ...(mismoAnio ? {} : { year: "numeric" }),
  })
  return `${ini} – ${hasta.getDate()} de ${mesYAnio}`
}

/* ─── Agregados ──────────────────────────────────────────────────────────── */

/** Una línea de venta, con lo justo para los informes de esta pantalla. */
export type LineaDeInforme = {
  saleId: string
  type: string // SERVICE | PRODUCT | GIFT_CARD
  quantity: number
  /** Precio de tarifa, antes del descuento. */
  unitPriceCents: number
  totalCents: number
  /** Quien atiende o vende. */
  workerId: string | null
  /** Quien cobró el ticket del que cuelga la línea. */
  cobradoPorId: string | null
  /** De quién es el ticket. Null en las ventas de mostrador sin ficha. */
  customerId: string | null
  /** Cuándo se cobró el ticket. */
  fecha: Date
  serviceId: string | null
  serviceName: string | null
  familyName: string | null
  productId: string | null
  productName: string | null
}

export const FACTURA = ["SERVICE", "PRODUCT"]

export type Totales = {
  servicesCents: number
  productsCents: number
  totalCents: number
  /** Aparte a propósito: ver la cabecera de este fichero. */
  saldoVendidoCents: number
  tickets: number
  ticketMedioCents: number
}

export function totales(lineas: LineaDeInforme[]): Totales {
  let servicesCents = 0, productsCents = 0, saldoVendidoCents = 0
  const tickets = new Set<string>()
  for (const l of lineas) {
    if (l.type === "SERVICE") { servicesCents += l.totalCents; tickets.add(l.saleId) }
    else if (l.type === "PRODUCT") { productsCents += l.totalCents; tickets.add(l.saleId) }
    else if (l.type === "GIFT_CARD") saldoVendidoCents += l.totalCents
  }
  const totalCents = servicesCents + productsCents
  return {
    servicesCents, productsCents, totalCents, saldoVendidoCents,
    tickets: tickets.size,
    // Sin tickets no hay media: 0 es una respuesta más honesta que dividir
    // entre cero y escribir "NaN €" en una tarjeta.
    ticketMedioCents: tickets.size ? Math.round(totalCents / tickets.size) : 0,
  }
}

export type FilaDeEmpleada = {
  workerId: string | null
  servicesCents: number
  productsCents: number
  totalCents: number
  tickets: number
}

/**
 * Qué ha facturado cada una.
 *
 * Cuenta por `SaleLine.workerId` —quien atiende— y no por `Sale.userId`, que es
 * quien cobra. En el mostrador cobra una y atiende otra, y lo que se quiere
 * medir aquí es el trabajo, no quién estaba en la caja.
 *
 * Las líneas viejas sin trabajadora se agrupan en una fila con `workerId` a
 * null en vez de repartirse o descartarse: si se descartaran, la suma de la
 * tabla no cuadraría con la tarjeta de facturación de arriba y nadie sabría
 * por qué.
 */
export function facturacionPorEmpleada(lineas: LineaDeInforme[]): FilaDeEmpleada[] {
  const porEmpleada = new Map<string, { fila: FilaDeEmpleada; tickets: Set<string> }>()
  for (const l of lineas) {
    if (!FACTURA.includes(l.type)) continue
    const clave = l.workerId ?? ""
    const acc = porEmpleada.get(clave) ?? {
      fila: { workerId: l.workerId, servicesCents: 0, productsCents: 0, totalCents: 0, tickets: 0 },
      tickets: new Set<string>(),
    }
    if (l.type === "SERVICE") acc.fila.servicesCents += l.totalCents
    else acc.fila.productsCents += l.totalCents
    acc.fila.totalCents += l.totalCents
    acc.tickets.add(l.saleId)
    porEmpleada.set(clave, acc)
  }
  return [...porEmpleada.values()]
    .map(({ fila, tickets }) => ({ ...fila, tickets: tickets.size }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

export type FilaDeConcepto = {
  id: string
  nombre: string
  /** Familia del servicio; en producto no aplica y va vacío. */
  grupo: string | null
  unidades: number
  totalCents: number
}

/**
 * Lo más vendido, agrupado por servicio o por producto.
 *
 * Ordena por unidades, que es lo que quiere decir "más vendido": cuántas veces
 * se ha hecho o se ha despachado. El importe va en la tabla como dato, pero no
 * ordena — un tratamiento caro que se hace dos veces no es "lo más vendido",
 * es lo más caro, y eso se ve en los ingresos por familia.
 *
 * Devuelve TODO, ordenado; recortar a los diez primeros es cosa de quien lo
 * pinta. Así la misma lista sirve para el top y para el total, y el porcentaje
 * se calcula sobre lo que de verdad se ha vendido y no sobre los diez que se
 * enseñan.
 */
export function ranking(lineas: LineaDeInforme[], tipo: "SERVICE" | "PRODUCT"): FilaDeConcepto[] {
  const porConcepto = new Map<string, FilaDeConcepto>()
  for (const l of lineas) {
    if (l.type !== tipo) continue
    const id = (tipo === "SERVICE" ? l.serviceId : l.productId) ?? ""
    const nombre = (tipo === "SERVICE" ? l.serviceName : l.productName) ?? "Sin catalogar"
    const acc = porConcepto.get(id) ?? {
      id, nombre, grupo: tipo === "SERVICE" ? l.familyName : null, unidades: 0, totalCents: 0,
    }
    acc.unidades += l.quantity
    acc.totalCents += l.totalCents
    porConcepto.set(id, acc)
  }
  // A igualdad de unidades manda el importe, para que el orden no dependa de
  // en qué orden vinieran las filas de la base.
  return [...porConcepto.values()]
    .sort((a, b) => b.unidades - a.unidades || b.totalCents - a.totalCents)
}

/* ─── Ingresos por familia ───────────────────────────────────────────────── */

export type FilaDeFamilia = { nombre: string; unidades: number; totalCents: number }

/**
 * Qué familia de tratamientos sostiene el centro.
 *
 * Los productos entran como una familia más, "Tto. domiciliario", que es como
 * se han clasificado siempre en los listados de la casa (ver HOME_CARE_FAMILY
 * en lib/enums.ts, y cómo lo hacen ya el informe de empleada y el del cliente).
 * Dejarlos fuera daría un total distinto al de la tarjeta de facturación.
 */
export function ingresosPorFamilia(lineas: LineaDeInforme[]): FilaDeFamilia[] {
  const porFamilia = new Map<string, FilaDeFamilia>()
  for (const l of lineas) {
    if (!FACTURA.includes(l.type)) continue
    const nombre = l.type === "PRODUCT" ? HOME_CARE_FAMILY : l.familyName ?? "Sin familia"
    const acc = porFamilia.get(nombre) ?? { nombre, unidades: 0, totalCents: 0 }
    acc.unidades += l.quantity
    acc.totalCents += l.totalCents
    porFamilia.set(nombre, acc)
  }
  return [...porFamilia.values()].sort((a, b) => b.totalCents - a.totalCents)
}

/* ─── Formas de cobro ────────────────────────────────────────────────────── */

export type VentaDeInforme = { paymentMethod: string; totalCents: number }
export type FilaDeCobro = { metodo: string; etiqueta: string; ventas: number; totalCents: number }

export const ETIQUETA_DE_COBRO: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  GIFT_CARD: "Saldo de tarjeta regalo",
  DEBT: "Queda a deber",
}

/**
 * Por dónde entra el dinero.
 *
 * OJO: esto NO suma lo mismo que la facturación, y es correcto que no lo haga.
 * Aquí se cuenta el ticket entero, tarjetas regalo vendidas incluidas, porque
 * la pregunta es cuánto ha pasado por cada vía de cobro. La facturación mide
 * otra cosa —lo que se ha dado— y por eso deja las tarjetas fuera.
 *
 * "Queda a deber" tampoco es dinero que haya entrado: es lo que falta por
 * cobrar, y va en la lista porque la alternativa es que desaparezca.
 */
export function formasDeCobro(ventas: VentaDeInforme[]): FilaDeCobro[] {
  const porMetodo = new Map<string, FilaDeCobro>()
  for (const v of ventas) {
    const acc = porMetodo.get(v.paymentMethod) ?? {
      metodo: v.paymentMethod,
      etiqueta: ETIQUETA_DE_COBRO[v.paymentMethod] ?? v.paymentMethod,
      ventas: 0, totalCents: 0,
    }
    acc.ventas++
    acc.totalCents += v.totalCents
    porMetodo.set(v.paymentMethod, acc)
  }
  return [...porMetodo.values()].sort((a, b) => b.totalCents - a.totalCents)
}

/* ─── Descuentos ─────────────────────────────────────────────────────────── */

export type ResumenDeDescuentos = {
  /** Lo que habrían sumado las líneas a precio de tarifa. */
  brutoCents: number
  descuentoCents: number
  /** Qué parte del bruto se ha regalado, en porcentaje con un decimal. */
  porcentaje: number
  filas: { userId: string | null; descuentoCents: number; lineas: number }[]
}

/**
 * Cuánto se deja de ingresar en descuentos, y en manos de quién.
 *
 * Se reparte por quien COBRA (`Sale.userId`) y no por quien atiende, al revés
 * que la facturación: el descuento se decide en el mostrador, en el momento de
 * cobrar, y quien lo hace es quien está en la caja.
 */
export function descuentos(lineas: LineaDeInforme[]): ResumenDeDescuentos {
  let brutoCents = 0
  let descuentoCents = 0
  const porUsuaria = new Map<string, { userId: string | null; descuentoCents: number; lineas: number }>()

  for (const l of lineas) {
    if (!FACTURA.includes(l.type)) continue
    const bruto = l.unitPriceCents * l.quantity
    const rebaja = bruto - l.totalCents
    brutoCents += bruto
    if (rebaja <= 0) continue
    descuentoCents += rebaja
    const clave = l.cobradoPorId ?? ""
    const acc = porUsuaria.get(clave) ?? { userId: l.cobradoPorId, descuentoCents: 0, lineas: 0 }
    acc.descuentoCents += rebaja
    acc.lineas++
    porUsuaria.set(clave, acc)
  }

  return {
    brutoCents,
    descuentoCents,
    porcentaje: brutoCents > 0 ? Math.round((descuentoCents / brutoCents) * 1000) / 10 : 0,
    filas: [...porUsuaria.values()].sort((a, b) => b.descuentoCents - a.descuentoCents),
  }
}

export type MesDeEvolucion = { clave: string; etiqueta: string; cents: number }

/**
 * Los últimos N meses acabando en el del período elegido, con los meses sin
 * una sola venta puestos a cero.
 *
 * Los ceros importan: si se omitieran, un mes cerrado por vacaciones
 * desaparecería de la gráfica y las barras de los meses de al lado quedarían
 * pegadas, como si no hubiera pasado nada.
 */
export function evolucionMensual(
  lineas: { createdAt: Date; type: string; totalCents: number }[],
  hasta: Date,
  meses = 6,
): MesDeEvolucion[] {
  const acumulado = new Map<string, number>()
  for (const l of lineas) {
    if (!FACTURA.includes(l.type)) continue
    const clave = claveDeMes(l.createdAt)
    acumulado.set(clave, (acumulado.get(clave) ?? 0) + l.totalCents)
  }

  const salida: MesDeEvolucion[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const m = new Date(hasta.getFullYear(), hasta.getMonth() - i, 1)
    const clave = claveDeMes(m)
    salida.push({
      clave,
      etiqueta: m.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""),
      cents: acumulado.get(clave) ?? 0,
    })
  }
  return salida
}

export function claveDeMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** El primer día del mes que abre la ventana de evolución. */
export function inicioDeEvolucion(hasta: Date, meses = 6): Date {
  return new Date(hasta.getFullYear(), hasta.getMonth() - (meses - 1), 1, 0, 0, 0, 0)
}

/**
 * En qué mes acaba la gráfica: nunca en uno que no ha pasado.
 *
 * El período elegido puede llegar al futuro —"Año" acaba el 31 de diciembre—, y
 * anclar ahí la gráfica llenaba media de barras a cero, como si el centro
 * hubiera dejado de facturar en septiembre.
 */
export function finDeEvolucion(hasta: Date, hoy = new Date()): Date {
  return hasta > hoy ? hoy : hasta
}

/**
 * Cuánto ha subido o bajado, en porcentaje entero.
 *
 * Devuelve null si antes no había nada: pasar de 0 € a 5.000 € no es "un
 * aumento del infinito por ciento", es que antes no había con qué comparar, y
 * la pantalla debe decir eso y no un número.
 */
export function variacion(ahora: number, antes: number): number | null {
  if (antes <= 0) return null
  return Math.round(((ahora - antes) / antes) * 100)
}

/* ══════════════════════════════════════════════════════════════════════════
   GASTOS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un movimiento de stock, con lo justo para valorarlo.
 *
 * `quantity` viene siempre en positivo salvo en ADJUST, donde el signo dice si
 * el recuento sumó o restó (ver el comentario del modelo en schema.prisma).
 */
export type MovimientoDeStock = {
  productId: string
  type: string // ENTRY | CONSUME | SALE | ADJUST
  quantity: number
}

/** Un producto del catálogo, con lo que hace falta para valorar la estantería. */
export type ProductoDeInforme = {
  id: string
  nombre: string
  proveedor: string | null
  costCents: number
  priceCents: number
  stock: number
  stockMin: number
  activo: boolean
}

export type FilaDeConsumo = {
  productId: string
  nombre: string
  proveedor: string | null
  unidades: number
  costeUnitarioCents: number
  costeCents: number
}

export type ResumenDeConsumo = {
  unidades: number
  costeCents: number
  /** Cuántas referencias distintas se han gastado en cabina. */
  referencias: number
  filas: FilaDeConsumo[]
}

/**
 * Cuánto producto se ha gastado en cabina y qué cuesta.
 *
 * OJO con el precio: se valora al COSTE ACTUAL del producto, no al que tenía el
 * día que se consumió, porque el movimiento de stock no guarda importe. Si el
 * proveedor sube la tarifa, el histórico se recalcula con la nueva. Es la
 * aproximación honesta con lo que hay guardado, y para la pregunta que se hace
 * —cuánto cuesta trabajar— vale: dice lo que costaría reponerlo hoy.
 *
 * Las salidas por venta (SALE) no entran: eso no es gasto de cabina, es género
 * despachado, y ya está contado en la facturación.
 */
export function consumoInterno(
  movimientos: MovimientoDeStock[],
  productos: ProductoDeInforme[],
): ResumenDeConsumo {
  const porId = new Map(productos.map((p) => [p.id, p]))
  const filas = new Map<string, FilaDeConsumo>()

  for (const m of movimientos) {
    if (m.type !== "CONSUME") continue
    const p = porId.get(m.productId)
    const acc = filas.get(m.productId) ?? {
      productId: m.productId,
      nombre: p?.nombre ?? "Producto borrado",
      proveedor: p?.proveedor ?? null,
      unidades: 0,
      costeUnitarioCents: p?.costCents ?? 0,
      costeCents: 0,
    }
    acc.unidades += m.quantity
    acc.costeCents += m.quantity * acc.costeUnitarioCents
    filas.set(m.productId, acc)
  }

  const salida = [...filas.values()]
    .sort((a, b) => b.costeCents - a.costeCents || b.unidades - a.unidades)
  return {
    unidades: salida.reduce((a, f) => a + f.unidades, 0),
    costeCents: salida.reduce((a, f) => a + f.costeCents, 0),
    referencias: salida.length,
    filas: salida,
  }
}

export type FilaDeInventario = {
  productId: string
  nombre: string
  proveedor: string | null
  stock: number
  stockMin: number
  costeUnitarioCents: number
  valorCents: number
  /** Unidades que han salido en el período: vendidas + gastadas en cabina. */
  salidas: number
  /** Con stock pero sin una sola salida en el período. */
  parado: boolean
  bajoMinimo: boolean
}

export type ResumenDeInventario = {
  valorCents: number
  unidades: number
  /** Referencias con stock: las que están a cero no tienen dinero dentro. */
  referencias: number
  /** Lo que no se ha movido en todo el período: el dinero que de verdad duerme. */
  paradoCents: number
  paradoReferencias: number
  bajoMinimo: number
  /** Lo que valdría en el mostrador, a precio de venta. */
  valorDeVentaCents: number
  filas: FilaDeInventario[]
}

/**
 * Cuánto dinero hay parado en las estanterías, y qué parte no se mueve.
 *
 * Se valora a COSTE, no a precio de venta: la pregunta es cuánto se ha pagado
 * por lo que hay ahí, no cuánto se sacaría si se vendiera todo, que no va a
 * pasar. El precio de venta va aparte, como referencia.
 *
 * Es una foto de HOY, no del período: el stock es el que hay ahora mismo, no el
 * que había el día 1, porque `Product.stock` es un contador vivo y de él no se
 * guarda histórico. Lo único que mira el período son las salidas, que es lo que
 * permite decir qué rota y qué no.
 */
export function valorDeInventario(
  productos: ProductoDeInforme[],
  movimientos: MovimientoDeStock[],
): ResumenDeInventario {
  const salidasPorProducto = new Map<string, number>()
  for (const m of movimientos) {
    if (m.type !== "SALE" && m.type !== "CONSUME") continue
    salidasPorProducto.set(m.productId, (salidasPorProducto.get(m.productId) ?? 0) + m.quantity)
  }

  // Un producto de baja con existencias sigue siendo dinero parado, así que se
  // queda; los que están a cero no aportan nada y solo alargan la tabla.
  const conStock = productos.filter((p) => p.stock > 0)

  const filas: FilaDeInventario[] = conStock
    .map((p) => {
      const salidas = salidasPorProducto.get(p.id) ?? 0
      return {
        productId: p.id,
        nombre: p.nombre,
        proveedor: p.proveedor,
        stock: p.stock,
        stockMin: p.stockMin,
        costeUnitarioCents: p.costCents,
        valorCents: p.stock * p.costCents,
        salidas,
        parado: salidas === 0,
        bajoMinimo: p.stockMin > 0 && p.stock <= p.stockMin,
      }
    })
    .sort((a, b) => b.valorCents - a.valorCents || a.nombre.localeCompare(b.nombre, "es"))

  const parados = filas.filter((f) => f.parado)
  return {
    valorCents: filas.reduce((a, f) => a + f.valorCents, 0),
    unidades: filas.reduce((a, f) => a + f.stock, 0),
    referencias: filas.length,
    paradoCents: parados.reduce((a, f) => a + f.valorCents, 0),
    paradoReferencias: parados.length,
    bajoMinimo: filas.filter((f) => f.bajoMinimo).length,
    valorDeVentaCents: conStock.reduce((a, p) => a + p.stock * p.priceCents, 0),
    filas,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CLIENTES
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaDeCliente = {
  customerId: string
  tickets: number
  totalCents: number
  ticketMedioCents: number
  primeraCompra: Date
  ultimaCompra: Date
  /**
   * Cada cuántos días vuelve, de media, dentro del período. Null con un solo
   * ticket: con una visita no hay dos fechas que restar, y poner 0 diría que
   * viene todos los días.
   */
  diasEntreVisitas: number | null
}

export type ResumenDeClientes = {
  filas: FilaDeCliente[]
  /** Facturación de tickets sin ficha (venta suelta de mostrador). */
  sinClienteCents: number
  sinClienteTickets: number
  gastoMedioCents: number
  /** Media de días entre visitas de quienes han venido más de una vez. */
  frecuenciaMediaDias: number | null
  /** Cuántos han venido más de una vez en el período. */
  repiten: number
}

/**
 * Qué se deja cada cliente y cada cuánto vuelve.
 *
 * Cuenta facturación (servicios y producto), no el ticket entero: si entrara la
 * tarjeta regalo, quien compra una de 200 € para su hermana saldría como el
 * mejor cliente del mes sin haberse hecho nada. Mismo criterio que el resto de
 * la pantalla, explicado en la cabecera de este fichero.
 *
 * Las ventas sin ficha no se reparten ni se descartan: se llevan aparte, para
 * que se vea cuánto se cobra sin saber a quién en vez de tener que cuadrar la
 * tabla a la fuerza con la facturación de arriba.
 */
export function porCliente(lineas: LineaDeInforme[]): ResumenDeClientes {
  const acumulado = new Map<string, { totalCents: number; tickets: Map<string, Date> }>()
  const sinCliente = { totalCents: 0, tickets: new Set<string>() }

  for (const l of lineas) {
    if (!FACTURA.includes(l.type)) continue
    if (!l.customerId) {
      sinCliente.totalCents += l.totalCents
      sinCliente.tickets.add(l.saleId)
      continue
    }
    const acc = acumulado.get(l.customerId) ?? { totalCents: 0, tickets: new Map<string, Date>() }
    acc.totalCents += l.totalCents
    acc.tickets.set(l.saleId, l.fecha)
    acumulado.set(l.customerId, acc)
  }

  const filas: FilaDeCliente[] = [...acumulado.entries()].map(([customerId, acc]) => {
    const fechas = [...acc.tickets.values()].sort((a, b) => a.getTime() - b.getTime())
    const primeraCompra = fechas[0]
    const ultimaCompra = fechas[fechas.length - 1]
    return {
      customerId,
      tickets: fechas.length,
      totalCents: acc.totalCents,
      ticketMedioCents: Math.round(acc.totalCents / fechas.length),
      primeraCompra,
      ultimaCompra,
      // Entre N visitas hay N−1 huecos: repartir el tramo entre N daría una
      // frecuencia más corta de la real.
      diasEntreVisitas:
        fechas.length > 1
          ? Math.round(diasEntre(primeraCompra, ultimaCompra) / (fechas.length - 1))
          : null,
    }
  })

  filas.sort((a, b) => b.totalCents - a.totalCents || b.tickets - a.tickets)

  const conFrecuencia = filas.filter((f) => f.diasEntreVisitas !== null)
  return {
    filas,
    sinClienteCents: sinCliente.totalCents,
    sinClienteTickets: sinCliente.tickets.size,
    gastoMedioCents: filas.length
      ? Math.round(filas.reduce((a, f) => a + f.totalCents, 0) / filas.length)
      : 0,
    frecuenciaMediaDias: conFrecuencia.length
      ? Math.round(conFrecuencia.reduce((a, f) => a + (f.diasEntreVisitas ?? 0), 0) / conFrecuencia.length)
      : null,
    repiten: conFrecuencia.length,
  }
}

export type TramoDeCaptacion = { clientes: number; tickets: number; totalCents: number }

export type ResumenDeCaptacion = {
  nuevos: TramoDeCaptacion
  recurrentes: TramoDeCaptacion
  /** Qué parte de la facturación con ficha viene de clientes nuevos. */
  porcentajeNuevos: number
}

/**
 * ¿Se está captando gente o se vive de los de siempre?
 *
 * "Nuevo" es quien compró por primera vez DENTRO del período, mirando toda su
 * historia y no solo el tramo elegido: si se mirara únicamente el período, en
 * el primer mes todo el mundo sería nuevo y el informe no diría nada.
 *
 * Se mide por la primera compra y no por el alta de la ficha a propósito: una
 * ficha abierta hace dos años que hoy compra por primera vez es una clienta
 * captada hoy, no una recurrente.
 */
export function nuevasVsRecurrentes(
  filas: FilaDeCliente[],
  primeraCompraDe: Map<string, Date>,
  desde: Date,
): ResumenDeCaptacion {
  const vacio = (): TramoDeCaptacion => ({ clientes: 0, tickets: 0, totalCents: 0 })
  const nuevos = vacio()
  const recurrentes = vacio()

  for (const f of filas) {
    // Sin dato previo se toma la primera compra del propio período: es lo que
    // pasa cuando el cliente estrena historial justo aquí.
    const primera = primeraCompraDe.get(f.customerId) ?? f.primeraCompra
    const tramo = primera >= desde ? nuevos : recurrentes
    tramo.clientes++
    tramo.tickets += f.tickets
    tramo.totalCents += f.totalCents
  }

  const total = nuevos.totalCents + recurrentes.totalCents
  return {
    nuevos,
    recurrentes,
    porcentajeNuevos: total > 0 ? Math.round((nuevos.totalCents / total) * 100) : 0,
  }
}

export type ClienteDeCartera = {
  id: string
  nombre: string
  telefono: string | null
  activo: boolean
  /**
   * Última cita de la agenda, futuras incluidas. Mismo criterio que el listado
   * de clientes, para que las dos pantallas no digan cosas distintas del mismo
   * cliente. Null si nunca ha tenido cita.
   */
  ultimaCita: Date | null
  altaEn: Date
  gastoHistoricoCents: number
}

export type FilaDeInactivo = {
  id: string
  nombre: string
  telefono: string | null
  diasSinVenir: number
  ultimaCita: Date | null
  gastoHistoricoCents: number
}

export type ResumenDeInactivos = {
  umbralDias: number
  filas: FilaDeInactivo[]
  /** Lo que dejaban entre todos: el tamaño del agujero. */
  gastoPerdidoCents: number
  /** Fichas activas que nunca han pasado por la agenda. */
  sinNingunaCita: number
}

/**
 * Quién lleva demasiado tiempo sin aparecer.
 *
 * El umbral es el de Configuración, el mismo que pinta el aviso en el listado
 * de clientes, para que "inactivo" quiera decir lo mismo en toda la aplicación.
 *
 * Una cita futura cuenta como visita: quien ya tiene hora dada no se ha
 * perdido, y llamarla para recuperarla quedaría raro. Por eso los días pueden
 * salir negativos, y esos se descartan solos al comparar con el umbral.
 *
 * Ordena por gasto histórico y no por días: de cien clientes perdidos interesa
 * llamar primero a quien más dejaba, que es lo que hace la lista accionable.
 *
 * Las fichas desactivadas no salen: darlas de baja ya fue la decisión.
 */
export function clientesInactivos(
  clientes: ClienteDeCartera[],
  umbralDias: number,
  hoy = new Date(),
): ResumenDeInactivos {
  const filas: FilaDeInactivo[] = []
  let sinNingunaCita = 0

  for (const c of clientes) {
    if (!c.activo) continue
    // Sin ninguna cita se cuentan los días desde el alta: una ficha abierta
    // hace ocho meses que nunca ha venido es exactamente el cliente perdido
    // que este informe busca.
    const dias = diasEntre(c.ultimaCita ?? c.altaEn, hoy)
    if (dias <= umbralDias) continue
    if (!c.ultimaCita) sinNingunaCita++
    filas.push({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      diasSinVenir: dias,
      ultimaCita: c.ultimaCita,
      gastoHistoricoCents: c.gastoHistoricoCents,
    })
  }

  filas.sort((a, b) => b.gastoHistoricoCents - a.gastoHistoricoCents || b.diasSinVenir - a.diasSinVenir)
  return {
    umbralDias,
    filas,
    gastoPerdidoCents: filas.reduce((a, f) => a + f.gastoHistoricoCents, 0),
    sinNingunaCita,
  }
}

export type VentaAdeudada = {
  customerId: string | null
  createdAt: Date
  totalCents: number
  paidCents: number
}

export type FilaDeDeuda = {
  customerId: string | null
  tickets: number
  deudaCents: number
  /** Desde cuándo arrastra la más vieja. */
  desde: Date
  diasDesde: number
}

export type ResumenDeDeuda = {
  deudaCents: number
  tickets: number
  clientes: number
  filas: FilaDeDeuda[]
}

/**
 * Quién debe dinero y desde cuándo.
 *
 * No mira el período: una deuda no caduca al cambiar de mes. Se enseña todo lo
 * que sigue sin cobrar hoy, sea de agosto o del año pasado, porque un informe
 * de deuda acotado al mes escondería justo la que más preocupa.
 *
 * Lo pendiente es `total − pagado`: en una venta a deber puede haberse
 * entregado algo a cuenta, y cobrar dos veces esa parte sería un error caro.
 */
export function deudaPendiente(ventas: VentaAdeudada[], hoy = new Date()): ResumenDeDeuda {
  const porDeudor = new Map<string, FilaDeDeuda>()
  let deudaCents = 0
  let tickets = 0

  for (const v of ventas) {
    const pendiente = v.totalCents - v.paidCents
    if (pendiente <= 0) continue
    deudaCents += pendiente
    tickets++
    const clave = v.customerId ?? ""
    const acc = porDeudor.get(clave) ?? {
      customerId: v.customerId, tickets: 0, deudaCents: 0, desde: v.createdAt, diasDesde: 0,
    }
    acc.tickets++
    acc.deudaCents += pendiente
    if (v.createdAt < acc.desde) acc.desde = v.createdAt
    porDeudor.set(clave, acc)
  }

  const filas = [...porDeudor.values()]
    .map((f) => ({ ...f, diasDesde: diasEntre(f.desde, hoy) }))
    .sort((a, b) => b.deudaCents - a.deudaCents)

  return { deudaCents, tickets, clientes: filas.length, filas }
}

export type ResumenDeTarjetas = {
  /** Saldo vendido dentro del período. */
  vendidoCents: number
  tarjetas: number
  /** Saldo gastado dentro del período. */
  consumidoCents: number
  /** Lo que queda sin gastar HOY, sea de cuando sea. */
  saldoVivoCents: number
  clientesConSaldo: number
}

/**
 * Cuánto saldo se ha vendido y cuánto sigue sin consumirse.
 *
 * El saldo vivo es dinero cobrado por un servicio que todavía no se ha dado:
 * está en la caja pero no es beneficio, es un compromiso pendiente. Por eso va
 * en su propia tarjeta y no sumando con la facturación.
 *
 * Los movimientos de uso de saldo se guardan en negativo (ver createSale en
 * lib/actions.ts), así que se les da la vuelta para enseñarlos.
 */
export function tarjetasRegalo(
  lineas: LineaDeInforme[],
  movimientos: { type: string; amountCents: number }[],
  saldos: { balanceCents: number }[],
): ResumenDeTarjetas {
  const regalos = lineas.filter((l) => l.type === "GIFT_CARD")
  const conSaldo = saldos.filter((s) => s.balanceCents > 0)
  return {
    vendidoCents: regalos.reduce((a, l) => a + l.totalCents, 0),
    tarjetas: regalos.reduce((a, l) => a + l.quantity, 0),
    consumidoCents: movimientos
      .filter((m) => m.type === "BALANCE_USED")
      .reduce((a, m) => a + Math.abs(m.amountCents), 0),
    saldoVivoCents: conSaldo.reduce((a, s) => a + s.balanceCents, 0),
    clientesConSaldo: conSaldo.length,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTIVIDAD DEL CENTRO
   ══════════════════════════════════════════════════════════════════════════ */

export type FranjaHoraria = { startTime: string; endTime: string }
export type HorarioSemanal = FranjaHoraria & { dayOfWeek: number }
export type HorarioSemanalDeEmpleada = HorarioSemanal & { workerId: string }
export type ExcepcionDeHorario = { date: string; closed: boolean; slots: FranjaHoraria[] }
export type ExcepcionDeEmpleada = ExcepcionDeHorario & { workerId: string }
export type AusenciaDeEmpleada = { workerId: string; date: string; type: string }

/**
 * Todo lo que hace falta para saber cuántas horas se podía trabajar, ya leído
 * de la base y acotado al período.
 *
 * Viene entero y se resuelve en memoria en vez de preguntar día a día como hace
 * lib/schedule.ts: un año son 365 fechas, y a cuatro consultas por fecha y
 * empleada esta pantalla no abriría nunca.
 */
export type DatosDeAgenda = {
  /** Fechas "YYYY-MM-DD" del período, ya recortadas para no contar el futuro. */
  dias: string[]
  clinicWeekly: HorarioSemanal[]
  clinicOverrides: ExcepcionDeHorario[]
  festivos: string[]
  workerWeekly: HorarioSemanalDeEmpleada[]
  workerOverrides: ExcepcionDeEmpleada[]
  ausencias: AusenciaDeEmpleada[]
}

/** Un tramo del día, en minutos desde medianoche. */
type Tramo = [number, number]

function aMinutos(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + (m || 0)
}

function aTramos(franjas: FranjaHoraria[]): Tramo[] {
  return franjas
    .map((f) => [aMinutos(f.startTime), aMinutos(f.endTime)] as Tramo)
    .filter(([ini, fin]) => fin > ini)
}

/**
 * Cuántos minutos cubren unos tramos. Lo que se solapa se cuenta una sola vez:
 * un turno partido mal metido (09:00–14:00 y 13:00–20:00) no da once horas.
 */
function minutosDeTramos(tramos: Tramo[]): number {
  let total = 0
  let hasta = -1
  for (const [ini, fin] of [...tramos].sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, fin - Math.max(ini, hasta))
    hasta = Math.max(hasta, fin)
  }
  return total
}

/** Los trozos que dos conjuntos de tramos tienen en común. */
function cruzar(a: Tramo[], b: Tramo[]): Tramo[] {
  const salida: Tramo[] = []
  for (const [ai, af] of a) {
    for (const [bi, bf] of b) {
      const ini = Math.max(ai, bi)
      const fin = Math.min(af, bf)
      if (ini < fin) salida.push([ini, fin])
    }
  }
  return salida
}

/** 0=domingo … 6=sábado, igual que Date.getDay(). */
export function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number)
  return new Date(a, m - 1, d).getDay()
}

/**
 * Las fechas "YYYY-MM-DD" del período, sin pasar de hoy.
 *
 * El recorte no es un detalle: "Año" llega al 31 de diciembre, y contar como
 * horas disponibles las de los meses que no han pasado hundiría la ocupación a
 * la mitad sin que nadie hubiera hecho nada mal.
 */
export function diasDelPeriodo(desde: Date, hasta: Date, hoy = new Date()): string[] {
  const fin = hasta > hoy ? hoy : hasta
  const dias: string[] = []
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const limite = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate())
  while (cursor <= limite) {
    dias.push(aValorDeInput(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

export type HorasDeAgenda = {
  /** Minutos que el centro ha estado abierto en el período. */
  minutosCentro: number
  /** Minutos de horario efectivo de cada empleada (centro ∩ su horario). */
  minutosPorEmpleada: Map<string, number>
  /** Días en los que el centro abrió alguna franja. */
  diasAbiertos: number
  /** Días en los que cada empleada tenía horario. */
  diasPorEmpleada: Map<string, number>
}

/**
 * Cuántas horas había disponibles, del centro y de cada empleada.
 *
 * Repite la misma prioridad que lib/schedule.ts, que es donde está explicada:
 * excepción del día > festivo (solo el centro) > horario semanal; y en la
 * empleada, una ausencia manda sobre todo lo demás. Si allí cambia el orden,
 * aquí tiene que cambiar también, o la ocupación dejará de cuadrar con lo que
 * enseña la pantalla de horarios.
 *
 * El horario de una empleada se cruza con el del centro en vez de tomarse tal
 * cual: las horas a las que el centro está cerrado no son horas disponibles por
 * mucho que estén en su turno.
 */
export function horasDeAgenda(datos: DatosDeAgenda, workerIds: string[]): HorasDeAgenda {
  const semanalCentro = new Map<number, FranjaHoraria[]>()
  for (const s of datos.clinicWeekly) {
    semanalCentro.set(s.dayOfWeek, [...(semanalCentro.get(s.dayOfWeek) ?? []), s])
  }
  const excepcionesCentro = new Map(datos.clinicOverrides.map((o) => [o.date, o]))
  const festivos = new Set(datos.festivos)

  const semanalEmpleada = new Map<string, Map<number, FranjaHoraria[]>>()
  for (const s of datos.workerWeekly) {
    const suyo = semanalEmpleada.get(s.workerId) ?? new Map<number, FranjaHoraria[]>()
    suyo.set(s.dayOfWeek, [...(suyo.get(s.dayOfWeek) ?? []), s])
    semanalEmpleada.set(s.workerId, suyo)
  }
  const excepcionesEmpleada = new Map(datos.workerOverrides.map((o) => [`${o.workerId}|${o.date}`, o]))
  const ausencias = new Set(datos.ausencias.map((a) => `${a.workerId}|${a.date}`))

  const minutosPorEmpleada = new Map<string, number>(workerIds.map((id) => [id, 0]))
  const diasPorEmpleada = new Map<string, number>(workerIds.map((id) => [id, 0]))
  let minutosCentro = 0
  let diasAbiertos = 0

  for (const dia of datos.dias) {
    const dow = diaDeLaSemana(dia)
    const excCentro = excepcionesCentro.get(dia)
    const franjasCentro = excCentro
      ? (excCentro.closed ? [] : excCentro.slots)
      : festivos.has(dia)
        ? []
        : semanalCentro.get(dow) ?? []

    const tramosCentro = aTramos(franjasCentro)
    const abierto = minutosDeTramos(tramosCentro)
    // Con el centro cerrado no hay nada disponible: ni del centro ni de nadie.
    if (abierto === 0) continue
    minutosCentro += abierto
    diasAbiertos++

    for (const workerId of workerIds) {
      if (ausencias.has(`${workerId}|${dia}`)) continue
      const exc = excepcionesEmpleada.get(`${workerId}|${dia}`)
      const suyas = exc
        ? (exc.closed ? [] : exc.slots)
        : semanalEmpleada.get(workerId)?.get(dow) ?? []
      const minutos = minutosDeTramos(cruzar(tramosCentro, aTramos(suyas)))
      if (minutos === 0) continue
      minutosPorEmpleada.set(workerId, (minutosPorEmpleada.get(workerId) ?? 0) + minutos)
      diasPorEmpleada.set(workerId, (diasPorEmpleada.get(workerId) ?? 0) + 1)
    }
  }

  return { minutosCentro, minutosPorEmpleada, diasAbiertos, diasPorEmpleada }
}

export type CitaDeInforme = {
  workerId: string
  cabinId: string
  serviceName: string
  status: string
  startAt: Date
  durationMinutes: number
}

/**
 * Estados que ocupan hueco en la agenda.
 *
 * El «no asistió» entra a propósito: la hora estaba reservada, nadie más podía
 * cogerla y se perdió igual. Dejarlo fuera pintaría un centro con huecos libres
 * que en realidad no lo estaban. La cancelada sí sale: libera el hueco y otra
 * clienta puede ocuparlo.
 */
export const CITAS_QUE_OCUPAN = ["PENDING", "CONFIRMED", "DONE", "NO_SHOW"]

export type FilaDeOcupacion = {
  id: string
  nombre: string
  minutosDisponibles: number
  minutosOcupados: number
  citas: number
  /** Porcentaje entero. Puede pasar de 100 si se ha atendido fuera de horario. */
  porcentaje: number
}

function filaDeOcupacion(
  id: string, nombre: string, disponibles: number, ocupados: number, citas: number,
): FilaDeOcupacion {
  return {
    id, nombre, citas,
    minutosDisponibles: disponibles,
    minutosOcupados: ocupados,
    // Sin horario no hay porcentaje: dividir entre cero pintaría una barra
    // infinita para quien no tenía que estar.
    porcentaje: disponibles > 0 ? Math.round((ocupados / disponibles) * 100) : 0,
  }
}

function minutosOcupados(citas: CitaDeInforme[], clave: (c: CitaDeInforme) => string) {
  const acumulado = new Map<string, { minutos: number; citas: number }>()
  for (const c of citas) {
    if (!CITAS_QUE_OCUPAN.includes(c.status)) continue
    const acc = acumulado.get(clave(c)) ?? { minutos: 0, citas: 0 }
    acc.minutos += c.durationMinutes
    acc.citas++
    acumulado.set(clave(c), acc)
  }
  return acumulado
}

/** Cuánto de su horario ha tenido llena cada empleada: mide carga de trabajo. */
export function ocupacionPorEmpleada(
  citas: CitaDeInforme[],
  horas: HorasDeAgenda,
  empleadas: { id: string; nombre: string }[],
): FilaDeOcupacion[] {
  const ocupados = minutosOcupados(citas, (c) => c.workerId)
  return empleadas
    .map((e) => {
      const o = ocupados.get(e.id) ?? { minutos: 0, citas: 0 }
      return filaDeOcupacion(e.id, e.nombre, horas.minutosPorEmpleada.get(e.id) ?? 0, o.minutos, o.citas)
    })
    // Quien ni tenía horario ni tuvo citas no aporta una fila, solo ruido.
    .filter((f) => f.minutosDisponibles > 0 || f.minutosOcupados > 0)
    .sort((a, b) => b.porcentaje - a.porcentaje)
}

/**
 * Cuánto se han usado las cabinas.
 *
 * Las horas disponibles de una cabina son las que el centro está abierto: una
 * cabina no libra ni se va de vacaciones. Y como son puestos calientes —hoy la
 * usa una, mañana otra—, este número no mide el rendimiento de nadie: dice si
 * hacen falta más puestos.
 */
export function ocupacionPorCabina(
  citas: CitaDeInforme[],
  horas: HorasDeAgenda,
  cabinas: { id: string; nombre: string }[],
): FilaDeOcupacion[] {
  const ocupados = minutosOcupados(citas, (c) => c.cabinId)
  return cabinas
    .map((c) => {
      const o = ocupados.get(c.id) ?? { minutos: 0, citas: 0 }
      return filaDeOcupacion(c.id, c.nombre, horas.minutosCentro, o.minutos, o.citas)
    })
    .sort((a, b) => b.porcentaje - a.porcentaje)
}

export type FilaDeCaida = {
  nombre: string
  total: number
  canceladas: number
  noAsistio: number
  porcentaje: number
}

export type ResumenDeCitas = {
  total: number
  realizadas: number
  canceladas: number
  noAsistio: number
  /** Citas del período que siguen sin cerrar: ni hechas ni caídas. */
  abiertas: number
  canceladasYAusencias: number
  porcentajeCaida: number
  /** Minutos de agenda que se quedaron sin dar por una ausencia. */
  minutosPerdidos: number
  porServicio: FilaDeCaida[]
  porDiaDeSemana: FilaDeCaida[]
}

/** Suma una cita al desglose de caídas de su servicio o de su día. */
function anotarCaida<K>(mapa: Map<K, FilaDeCaida>, clave: K, nombre: string, status: string) {
  const acc = mapa.get(clave) ?? { nombre, total: 0, canceladas: 0, noAsistio: 0, porcentaje: 0 }
  acc.total++
  if (status === "CANCELLED") acc.canceladas++
  if (status === "NO_SHOW") acc.noAsistio++
  mapa.set(clave, acc)
}

/**
 * Cuántas citas se caen, con qué servicio y qué día.
 *
 * Cancelada y «no asistió» se cuentan aparte porque no son lo mismo: la
 * cancelada avisa y deja el hueco libre para otra; la ausencia se come la hora
 * sin remedio. Juntarlas escondería cuál de los dos problemas hay.
 *
 * AVISO sobre el «no asistió»: solo existe si alguien lo marca en la agenda. Lo
 * que nadie marca se queda como pendiente y sale en «sin cerrar», no en las
 * ausencias, así que este número es un suelo y nunca un techo.
 */
export function cancelacionesYAusencias(citas: CitaDeInforme[]): ResumenDeCitas {
  const cuenta = { realizadas: 0, canceladas: 0, noAsistio: 0, abiertas: 0 }
  let minutosPerdidos = 0
  const porServicio = new Map<string, FilaDeCaida>()
  const porDia = new Map<number, FilaDeCaida>()

  for (const c of citas) {
    if (c.status === "DONE") cuenta.realizadas++
    else if (c.status === "CANCELLED") cuenta.canceladas++
    else if (c.status === "NO_SHOW") cuenta.noAsistio++
    else cuenta.abiertas++

    // La cancelada libera el hueco; solo la ausencia se lleva la hora puesta.
    if (c.status === "NO_SHOW") minutosPerdidos += c.durationMinutes

    anotarCaida(porServicio, c.serviceName, c.serviceName, c.status)
    const dow = c.startAt.getDay()
    anotarCaida(porDia, dow, WEEKDAY_LABELS[dow], c.status)
  }

  const conPorcentaje = (f: FilaDeCaida): FilaDeCaida => ({
    ...f,
    porcentaje: f.total > 0 ? Math.round(((f.canceladas + f.noAsistio) / f.total) * 100) : 0,
  })

  const canceladasYAusencias = cuenta.canceladas + cuenta.noAsistio
  return {
    total: citas.length,
    ...cuenta,
    canceladasYAusencias,
    porcentajeCaida: citas.length > 0 ? Math.round((canceladasYAusencias / citas.length) * 100) : 0,
    minutosPerdidos,
    porServicio: [...porServicio.values()]
      .map(conPorcentaje)
      // Primero lo que más se cae y, a igualdad, lo que más se pide: una
      // cancelación sobre una sola cita no es un problema, es casualidad.
      .sort((a, b) => (b.canceladas + b.noAsistio) - (a.canceladas + a.noAsistio) || b.total - a.total),
    // Por día de la semana manda el orden del calendario empezando en lunes,
    // que es como se mira una agenda.
    porDiaDeSemana: [1, 2, 3, 4, 5, 6, 0]
      .filter((d) => porDia.has(d))
      .map((d) => conPorcentaje(porDia.get(d)!)),
  }
}

export type FilaDeHoras = {
  workerId: string
  nombre: string
  minutos: number
  diasTrabajados: number
  vacaciones: number
  asuntosPropios: number
  otrasAusencias: number
  /** Días del cupo anual que le quedan, o null si no tiene saldo asignado. */
  vacacionesRestantes: number | null
  asuntosRestantes: number | null
}

/**
 * Horas de horario efectivo y días libres de cada empleada.
 *
 * "Horas trabajadas" son las de su horario, no las que tuvo citas: el centro
 * paga la jornada entera, con la agenda llena o vacía. Lo llena que estuvo es
 * la otra tarjeta, la de ocupación.
 *
 * Las ausencias del período se cuentan del período, pero el saldo que queda es
 * del AÑO: el cupo de vacaciones es anual, y preguntar cuántos días le quedan
 * en un informe de agosto significa cuántos le quedan de este año. Las bajas y
 * las ausencias justificadas no descuentan cupo (ver LEAVE_TYPE_META).
 */
export function horasTrabajadas(
  empleadas: { id: string; nombre: string }[],
  horas: HorasDeAgenda,
  ausenciasDelPeriodo: AusenciaDeEmpleada[],
  ausenciasDelAnio: AusenciaDeEmpleada[],
  cupos: { workerId: string; vacationDaysTotal: number; personalDaysTotal: number }[],
): FilaDeHoras[] {
  const contar = (lista: AusenciaDeEmpleada[], workerId: string, tipo: string) =>
    lista.filter((a) => a.workerId === workerId && a.type === tipo).length
  const cupoDe = new Map(cupos.map((c) => [c.workerId, c]))

  return empleadas
    .map((e) => {
      const cupo = cupoDe.get(e.id)
      return {
        workerId: e.id,
        nombre: e.nombre,
        minutos: horas.minutosPorEmpleada.get(e.id) ?? 0,
        diasTrabajados: horas.diasPorEmpleada.get(e.id) ?? 0,
        vacaciones: contar(ausenciasDelPeriodo, e.id, "VACATION"),
        asuntosPropios: contar(ausenciasDelPeriodo, e.id, "PERSONAL"),
        otrasAusencias: ausenciasDelPeriodo.filter(
          (a) => a.workerId === e.id && a.type !== "VACATION" && a.type !== "PERSONAL",
        ).length,
        vacacionesRestantes: cupo
          ? cupo.vacationDaysTotal - contar(ausenciasDelAnio, e.id, "VACATION")
          : null,
        asuntosRestantes: cupo
          ? cupo.personalDaysTotal - contar(ausenciasDelAnio, e.id, "PERSONAL")
          : null,
      }
    })
    .sort((a, b) => b.minutos - a.minutos)
}

/** Minutos sueltos en algo que se lee: "7 h 30 min". */
export function horasLegibles(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

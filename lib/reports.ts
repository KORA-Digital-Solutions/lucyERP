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

/* ─── Períodos ───────────────────────────────────────────────────────────── */

export type PeriodoId = "mes" | "anterior" | "trimestre" | "anio" | "personalizado"

export const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: "mes", label: "Este mes" },
  { id: "anterior", label: "Mes pasado" },
  { id: "trimestre", label: "Trimestre" },
  { id: "anio", label: "Año" },
  { id: "personalizado", label: "Personalizado" },
]

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
    const desde = inicioDelDia(fechaDeParametro(opts.desde) ?? inicioDelMes(anio, mes))
    const hastaBruto = inicioDelDia(fechaDeParametro(opts.hasta) ?? hoy)
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
  totalCents: number
  workerId: string | null
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
  return [...porConcepto.values()].sort((a, b) => b.totalCents - a.totalCents)
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

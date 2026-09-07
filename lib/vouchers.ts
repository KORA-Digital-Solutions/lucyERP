// Las cuentas de un bono, en un sitio y sin base de datos de por medio.
//
// Un bono es un pack de sesiones prepagadas de uno o varios servicios. Cada
// servicio lleva las suyas, con su tarifa y su descuento: un pack que mezcla un
// láser y un facial no se puede vender a tanto la sesión, porque cada
// tratamiento vale lo que vale. El precio del bono es la suma de sus líneas.

/** Un servicio dentro del bono, con lo que hace falta para echar la cuenta. */
export type VoucherLine = {
  totalSessions: number
  basePriceCents: number
  discountPercent: number
}

/** Las sesiones que trae por defecto una línea nueva. */
export const DEFAULT_VOUCHER_SESSIONS = 3

/** Lo que se cobra por una línea, ya con su descuento aplicado. */
export function voucherFinalPriceCents(basePriceCents: number, discountPercent: number): number {
  const base = Math.max(0, Math.round(basePriceCents))
  const pct = Math.min(100, Math.max(0, Math.round(discountPercent)))
  return base - Math.round((base * pct) / 100)
}

/**
 * A cuánto se le queda cada sesión de esa línea. Es el número con el que se
 * decide el descuento al montar el bono, así que sale en pantalla mientras se
 * escribe. Lo que se cobra es el precio de la línea, no esto por las sesiones,
 * de modo que el redondeo de aquí no descuadra ningún ticket.
 */
export function voucherPricePerSessionCents(finalPriceCents: number, totalSessions: number): number {
  if (totalSessions <= 0) return 0
  return Math.round(finalPriceCents / totalSessions)
}

/** Lo que se ahorra frente a pagar esas sesiones sueltas. */
export function voucherSavingsCents(basePriceCents: number, discountPercent: number): number {
  return Math.max(0, Math.round(basePriceCents)) - voucherFinalPriceCents(basePriceCents, discountPercent)
}

/**
 * Sesiones que quedan. Nunca baja de cero: si alguna vez sobrase un consumo, el
 * saldo se queda a cero en vez de enseñar un número negativo que nadie sabría
 * interpretar.
 */
export function voucherRemainingSessions(totalSessions: number, usedSessions: number): number {
  return Math.max(0, totalSessions - usedSessions)
}

/** El bono entero: lo que suman todas sus líneas. */
export function voucherTotals(lines: VoucherLine[]): {
  totalSessions: number
  basePriceCents: number
  finalPriceCents: number
  savingsCents: number
} {
  let totalSessions = 0, basePriceCents = 0, finalPriceCents = 0
  for (const l of lines) {
    totalSessions += Math.max(0, Math.round(l.totalSessions))
    basePriceCents += Math.max(0, Math.round(l.basePriceCents))
    finalPriceCents += voucherFinalPriceCents(l.basePriceCents, l.discountPercent)
  }
  return { totalSessions, basePriceCents, finalPriceCents, savingsCents: basePriceCents - finalPriceCents }
}

/**
 * La tarifa que se propone al añadir un servicio al bono: lo que costarían esas
 * sesiones sueltas. Es una propuesta, no una regla — se guarda lo que quede
 * escrito, porque el catálogo sube de precio y lo pactado en el bono no tiene
 * por qué seguirle.
 */
export function suggestedBasePriceCents(servicePriceCents: number, totalSessions: number): number {
  return Math.max(0, Math.round(servicePriceCents)) * Math.max(0, Math.round(totalSessions))
}

/**
 * El nombre que se propone para el bono, a partir de lo que lleva dentro:
 * "Bono Láser ingles 3 sesiones".
 *
 * Con varios servicios se encadenan, y las sesiones solo se nombran si todos
 * llevan las mismas: "Bono Láser ingles + Facial exprés 3 sesiones" es cierto,
 * pero si uno lleva 3 y otro 5 no hay número que valga y se queda en los
 * nombres. Es una propuesta: en cuanto se escribe el nombre a mano, manda ese.
 */
export function suggestedVoucherName(lines: { serviceName: string; totalSessions: number }[]): string {
  if (lines.length === 0) return ""
  const nombres = lines.map((l) => l.serviceName).join(" + ")
  const sesiones = new Set(lines.map((l) => Math.max(0, Math.round(l.totalSessions))))
  if (sesiones.size !== 1) return `Bono ${nombres}`
  const n = [...sesiones][0]
  if (n <= 0) return `Bono ${nombres}`
  return `Bono ${nombres} ${n} ${n === 1 ? "sesión" : "sesiones"}`
}

/* ------------------- LO QUE SE LE CUENTA A LA CLIENTA -------------------- */

/**
 * Lo que se ahorra en cada sesión frente a pagarla suelta.
 *
 * La comparación es contra la tarifa del servicio en el catálogo, que es lo
 * que pagaría si entrase hoy sin bono: es la cifra con la que se vende el
 * bono en el mostrador ("suelta te sale a 70, con el bono a 56").
 *
 * Puede salir cero o negativo si el bono se ha montado por encima de la
 * tarifa; entonces no hay nada que contar y quien llama no lo enseña.
 */
export function sessionSavingsCents(servicePriceCents: number, pricePerSessionCents: number): number {
  return Math.round(servicePriceCents) - Math.round(pricePerSessionCents)
}

/** Esa misma rebaja en porcentaje, para decirla redonda. */
export function sessionDiscountPercent(servicePriceCents: number, pricePerSessionCents: number): number {
  const suelta = Math.round(servicePriceCents)
  if (suelta <= 0) return 0
  return Math.round((sessionSavingsCents(suelta, pricePerSessionCents) / suelta) * 100)
}

/* ------------------------ EL SALDO EN EL MOSTRADOR ----------------------- */

/** Un bono que podría pagar algo del ticket, con lo que traía de fábrica. */
export type VoucherBalanceInput = {
  /** Identifica la opción en la pantalla; no es el id del bono. */
  key: string
  name: string
  /** Uno de los dos, nunca los dos: bono de antes, o bono de este ticket. */
  voucherId: string | null
  voucherRef: string | null
  services: { id: string; name: string; totalSessions: number }[]
}

/** Una sesión que el ticket ya está gastando. */
export type VoucherSessionInTicket = {
  voucherId: string | null
  voucherRef: string | null
  serviceId: string
}

export type VoucherBalance = Omit<VoucherBalanceInput, "services"> & {
  /** Suma de lo que queda, para el rótulo. */
  remaining: number
  services: { id: string; name: string; remaining: number }[]
}

/**
 * Lo que le queda a cada bono una vez descontado lo que ya lleva el ticket.
 *
 * Se descuenta servicio a servicio: que a un bono le sobren cinco de facial no
 * da derecho a una sexta de láser. Los servicios sin sesiones libres se caen de
 * la lista, y el bono entero con ellos si no le queda ninguna — un bono que no
 * puede pagar nada no es una opción, es ruido.
 *
 * Equivocarse a la baja aquí es peor que a la alta: pasar de largo una sesión
 * disponible se traduce en cobrarle otra vez a la clienta algo que ya tenía
 * pagado, mientras que ofrecer de más lo para el servidor al registrar.
 */
export function voucherBalances(
  bonos: VoucherBalanceInput[],
  gastadasEnElTicket: VoucherSessionInTicket[],
): VoucherBalance[] {
  const mismoBono = (a: { voucherId: string | null; voucherRef: string | null }, b: VoucherBalanceInput) =>
    b.voucherId ? a.voucherId === b.voucherId : a.voucherRef === b.voucherRef

  return bonos
    .map((b) => {
      const services = b.services
        .map((s) => ({
          id: s.id,
          name: s.name,
          remaining: voucherRemainingSessions(
            s.totalSessions,
            gastadasEnElTicket.filter((g) => g.serviceId === s.id && mismoBono(g, b)).length,
          ),
        }))
        .filter((s) => s.remaining > 0)
      return { ...b, services, remaining: services.reduce((n, s) => n + s.remaining, 0) }
    })
    .filter((b) => b.remaining > 0)
}

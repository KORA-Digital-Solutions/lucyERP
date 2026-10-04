// Relleno retroactivo del precio de las sesiones de bono (M2, decisión D2).
//
// Hasta M2 una sesión de bono entraba al ticket a 0 EUR y sin descuento, así
// que el informe de empleadas no podía valorarla. Desde M2 entra al precio que
// tiene dentro del bono, con un 100 % de descuento. Esto lo aplica a las
// sesiones ya gastadas: cada una conoce su bono, y el bono guarda la base y el
// descuento de cada servicio, que es todo lo que hace falta.
//
// No toca los totales de la venta: las sesiones nunca sumaron al subtotal ni al
// descuento, y su total sigue siendo 0. Cambian solo su precio y su descuento.
//
// La función recibe el cliente de Prisma en vez de importar el global, para que
// la misma lógica sirva al script de mantenimiento y a los tests.

import type { PrismaClient } from "@prisma/client"
import { voucherFinalPriceCents, voucherSessionPriceCents } from "./vouchers"

export type SesionParaRellenar = { id: string; voucherId: string; serviceId: string; usedAt: Date }
export type TarifaDeLinea = { finalPriceCents: number; totalSessions: number }

/**
 * Lo que vale cada sesión, por id.
 *
 * La que toca de las de su servicio se decide por orden de gasto, igual que al
 * venderlas (createSale): la primera es la 0. Así las sesiones de un servicio
 * suman al céntimo lo que costó su línea del bono.
 */
export function preciosRetroactivos(
  sesiones: SesionParaRellenar[],
  tarifas: Map<string, TarifaDeLinea>,
): Map<string, number> {
  const precios = new Map<string, number>()
  const vistas = new Map<string, number>()
  const enOrden = [...sesiones].sort(
    (a, b) => a.usedAt.getTime() - b.usedAt.getTime() || a.id.localeCompare(b.id),
  )
  for (const s of enOrden) {
    const clave = `${s.voucherId}|${s.serviceId}`
    const ordinal = vistas.get(clave) ?? 0
    vistas.set(clave, ordinal + 1)
    const tarifa = tarifas.get(clave)
    precios.set(s.id, tarifa ? voucherSessionPriceCents(tarifa.finalPriceCents, tarifa.totalSessions, ordinal) : 0)
  }
  return precios
}

export type ResumenDelRelleno = {
  /** Sesiones con línea de ticket que ya estaban valoradas y se dejan como están. */
  yaValoradas: number
  /** Sesiones que se rellenan (o se rellenarían, en simulacro). */
  rellenadas: number
  /** Cuánto valen en total las que se rellenan. */
  valorCents: number
  /** Sesiones cuyo bono no guarda tarifa del servicio: no hay de dónde sacar el precio. */
  sinTarifa: number
}

/**
 * Rellena el precio de las sesiones de bono que aún están a 0 EUR.
 *
 * Se pueden ejecutar tantas veces como se quiera: solo toca las líneas que
 * todavía no llevan el 100 % de descuento. Con `aplicar: false` calcula y cuenta
 * sin escribir nada, que es lo que hay que mirar antes de tocar la base real.
 */
export async function rellenarPrecioDeSesiones(
  prisma: PrismaClient,
  opciones: { aplicar: boolean },
): Promise<ResumenDelRelleno> {
  const sesiones = await prisma.voucherSession.findMany({
    where: { saleLineId: { not: null } },
    select: {
      id: true, voucherId: true, serviceId: true, usedAt: true, saleLineId: true,
      saleLine: { select: { discountPercent: true } },
      voucher: {
        select: { services: { select: { serviceId: true, totalSessions: true, basePriceCents: true, discountPercent: true } } },
      },
    },
  })

  // La cuenta de cada bono se hace con TODAS sus sesiones, también con las que
  // ya están valoradas: la que toca de un servicio depende de cuántas van antes.
  const tarifas = new Map<string, TarifaDeLinea>()
  for (const s of sesiones) {
    for (const l of s.voucher.services) {
      tarifas.set(`${s.voucherId}|${l.serviceId}`, {
        finalPriceCents: voucherFinalPriceCents(l.basePriceCents, l.discountPercent),
        totalSessions: l.totalSessions,
      })
    }
  }
  const precios = preciosRetroactivos(sesiones, tarifas)

  const resumen: ResumenDelRelleno = { yaValoradas: 0, rellenadas: 0, valorCents: 0, sinTarifa: 0 }
  for (const s of sesiones) {
    if (s.saleLine!.discountPercent === 100) { resumen.yaValoradas++; continue }
    if (!tarifas.has(`${s.voucherId}|${s.serviceId}`)) { resumen.sinTarifa++; continue }
    const precio = precios.get(s.id) ?? 0
    resumen.rellenadas++
    resumen.valorCents += precio
    if (opciones.aplicar) {
      await prisma.saleLine.update({
        where: { id: s.saleLineId! },
        data: { unitPriceCents: precio, discountPercent: 100 },
      })
    }
  }
  return resumen
}

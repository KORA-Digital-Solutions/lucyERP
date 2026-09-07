"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { requireAdmin, requireSession } from "@/lib/auth"
import {
  voucherFinalPriceCents, voucherPricePerSessionCents, voucherRemainingSessions, voucherTotals,
} from "@/lib/vouchers"
import type { ActionResult } from "@/lib/actions"

/* ------------------------------- HELPERS -------------------------------- */

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado"
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === "on" || v === "true" || v === "1"
}

function int(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key))
  return Number.isFinite(n) ? Math.round(n) : fallback
}

function revalidateVouchers() {
  revalidatePath("/vouchers")
  revalidatePath("/clients")
  revalidatePath("/sales")
}

/* ---------------------------- TIPOS DE SALIDA ---------------------------- */

/** Un servicio dentro de un bono del catálogo, con sus sesiones y su precio. */
export type VoucherTemplateServiceRow = {
  /** El id del servicio, que es como se identifica la línea de cara fuera. */
  id: string
  name: string
  familyName: string
  /** Lo que cuesta hoy suelto, para poder comparar. */
  servicePriceCents: number
  totalSessions: number
  basePriceCents: number
  discountPercent: number
  finalPriceCents: number
  pricePerSessionCents: number
}

export type VoucherTemplateRow = {
  id: string
  name: string
  active: boolean
  services: VoucherTemplateServiceRow[]
  /** Sumas de las líneas: el bono no guarda totales, se calculan de ellas. */
  totalSessions: number
  basePriceCents: number
  finalPriceCents: number
  savingsCents: number
  /** Cuántos se han vendido: uno ya vendido no se puede borrar. */
  soldCount: number
}

export type CustomerVoucherSession = {
  id: string
  serviceId: string
  serviceName: string
  workerName: string
  usedAt: string
}

/** Un servicio dentro de un bono comprado, con lo que le queda. */
export type CustomerVoucherServiceRow = {
  id: string
  name: string
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  basePriceCents: number
  discountPercent: number
  finalPriceCents: number
  pricePerSessionCents: number
}

export type CustomerVoucherRow = {
  id: string
  name: string
  status: string
  services: CustomerVoucherServiceRow[]
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  pricePaidCents: number
  purchasedAt: string
  notes: string | null
  sessions: CustomerVoucherSession[]
}

/* --------------------------- PLANTILLAS DE BONO -------------------------- */

const TEMPLATE_INCLUDE = {
  services: {
    include: {
      service: {
        select: { id: true, name: true, priceCents: true, family: { select: { name: true } } },
      },
    },
  },
  _count: { select: { customerVouchers: true } },
} as const

function templateRow(t: {
  id: string
  name: string
  active: boolean
  services: {
    totalSessions: number
    basePriceCents: number
    discountPercent: number
    service: { id: string; name: string; priceCents: number; family: { name: string } }
  }[]
  _count: { customerVouchers: number }
}): VoucherTemplateRow {
  const services = t.services.map((s) => {
    const finalPriceCents = voucherFinalPriceCents(s.basePriceCents, s.discountPercent)
    return {
      id: s.service.id,
      name: s.service.name,
      familyName: s.service.family.name,
      servicePriceCents: s.service.priceCents,
      totalSessions: s.totalSessions,
      basePriceCents: s.basePriceCents,
      discountPercent: s.discountPercent,
      finalPriceCents,
      pricePerSessionCents: voucherPricePerSessionCents(finalPriceCents, s.totalSessions),
    }
  })
  const totals = voucherTotals(t.services)
  return { id: t.id, name: t.name, active: t.active, services, ...totals, soldCount: t._count.customerVouchers }
}

/** Todas las plantillas, para la pantalla de gestión. */
export async function getVoucherTemplates(): Promise<VoucherTemplateRow[]> {
  await requireSession()
  const clinicId = await getActiveClinicId()
  const rows = await prisma.voucherTemplate.findMany({
    where: { clinicId },
    include: TEMPLATE_INCLUDE,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
  return rows.map(templateRow)
}

/** Solo los activos, que son los que se ofrecen en el mostrador. */
export async function getVoucherTemplatesForSale(): Promise<VoucherTemplateRow[]> {
  await requireSession()
  const clinicId = await getActiveClinicId()
  const rows = await prisma.voucherTemplate.findMany({
    where: { clinicId, active: true },
    include: TEMPLATE_INCLUDE,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
  return rows.map(templateRow)
}

/**
 * Las líneas del bono llegan del formulario como un campo por servicio marcado:
 * `sessions_<id>`, `basePrice_<id>` y `discount_<id>`. Se leen así, y no como
 * un JSON, para que el formulario siga siendo un formulario y la acción pueda
 * validar campo a campo.
 */
function leerLineas(fd: FormData, serviceIds: string[]) {
  return serviceIds.map((serviceId) => ({
    serviceId,
    totalSessions: int(fd, `sessions_${serviceId}`, 0),
    basePriceCents: Math.round(Number(str(fd, `basePrice_${serviceId}`) || "0") * 100),
    discountPercent: int(fd, `discount_${serviceId}`, 0),
  }))
}

export async function saveVoucherTemplate(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()

    const name = str(fd, "name")
    if (!name) return { ok: false, error: "El nombre del bono es obligatorio." }

    // Los servicios llegan como varios valores del mismo campo, uno por casilla
    // marcada. Se quitan los repetidos antes de guardar: el índice único de la
    // tabla puente ya lo impediría, pero con un error que no le dice nada a nadie.
    const serviceIds = [...new Set(fd.getAll("serviceIds").map((v) => String(v).trim()).filter(Boolean))]
    if (serviceIds.length === 0) {
      return { ok: false, error: "Elige al menos un servicio para el bono." }
    }
    // Que los servicios sean de este centro no lo garantiza el formulario: la
    // acción es un POST y se le puede mandar cualquier id.
    const servicios = await prisma.service.findMany({
      where: { id: { in: serviceIds }, clinicId },
      select: { id: true, name: true },
    })
    if (servicios.length !== serviceIds.length) {
      return { ok: false, error: "Alguno de los servicios elegidos ya no existe. Vuelve a cargar la pantalla." }
    }
    const nombreDe = new Map(servicios.map((s) => [s.id, s.name]))

    const lineas = leerLineas(fd, serviceIds)
    for (const l of lineas) {
      const servicio = nombreDe.get(l.serviceId) ?? "el servicio"
      if (l.totalSessions < 1) {
        return { ok: false, error: `Pon al menos una sesión en "${servicio}".` }
      }
      if (l.discountPercent < 0 || l.discountPercent > 100) {
        return { ok: false, error: `El descuento de "${servicio}" tiene que estar entre 0 y 100.` }
      }
      if (!Number.isFinite(l.basePriceCents) || l.basePriceCents <= 0) {
        return { ok: false, error: `Ponle tarifa a "${servicio}".` }
      }
    }

    const data = { name, active: bool(fd, "active"), sortOrder: int(fd, "sortOrder", 0) }

    if (id) {
      const existente = await prisma.voucherTemplate.findFirst({ where: { id, clinicId }, select: { id: true } })
      if (!existente) return { ok: false, error: "Ese bono ya no existe." }
      // La plantilla es solo el molde. Los bonos ya vendidos llevan su propia
      // copia de los servicios, las sesiones y los precios, así que retocar
      // esto no reescribe nada de lo que ya se cobró.
      await prisma.$transaction([
        prisma.voucherTemplate.update({ where: { id }, data }),
        prisma.voucherTemplateService.deleteMany({ where: { templateId: id } }),
        prisma.voucherTemplateService.createMany({
          data: lineas.map((l) => ({ templateId: id, ...l })),
        }),
      ])
      revalidateVouchers()
      return { ok: true, id }
    }

    const created = await prisma.voucherTemplate.create({
      data: { ...data, clinicId, services: { create: lineas } },
    })
    revalidateVouchers()
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function toggleVoucherTemplateActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()
    const { count } = await prisma.voucherTemplate.updateMany({ where: { id, clinicId }, data: { active } })
    if (count === 0) return { ok: false, error: "Ese bono ya no existe." }
    revalidateVouchers()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * Borrar solo vale para el bono recién creado y mal. En cuanto se ha vendido
 * uno hay que dejarlo estar: el bono vendido apunta a su plantilla para poder
 * rastrearlo, y borrarla dejaría el rastro a medias. Para quitarlo de la venta
 * está el interruptor de activo.
 */
export async function deleteVoucherTemplate(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()
    const t = await prisma.voucherTemplate.findFirst({
      where: { id, clinicId },
      select: { _count: { select: { customerVouchers: true } } },
    })
    if (!t) return { ok: false, error: "Ese bono ya no existe." }
    if (t._count.customerVouchers > 0) {
      return { ok: false, error: "Este bono ya se ha vendido alguna vez. Desactívalo para quitarlo de la venta." }
    }
    await prisma.voucherTemplate.delete({ where: { id } })
    revalidateVouchers()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* -------------------------- BONOS DE UN CLIENTE -------------------------- */

/**
 * Los bonos que se ha sacado un cliente y lo que le queda de cada uno.
 *
 * El saldo se cuenta por servicio y sobre las sesiones gastadas, no sobre un
 * contador guardado: a este bono le quedan 2 de láser y 5 de facial, no
 * "7 sesiones", y así no hay dos verdades que se puedan desincronizar.
 */
export async function getCustomerVouchers(customerId: string): Promise<CustomerVoucherRow[]> {
  await requireSession()
  const clinicId = await getActiveClinicId()
  const vouchers = await prisma.customerVoucher.findMany({
    where: { clinicId, customerId },
    include: {
      services: { include: { service: { select: { id: true, name: true } } } },
      sessions: {
        include: {
          service: { select: { id: true, name: true } },
          worker: { select: { name: true, lastName: true } },
        },
        orderBy: { usedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return vouchers.map((v) => {
    const gastadasDe = (serviceId: string) => v.sessions.filter((s) => s.serviceId === serviceId).length
    const services = v.services.map((s) => {
      const usedSessions = gastadasDe(s.serviceId)
      const finalPriceCents = voucherFinalPriceCents(s.basePriceCents, s.discountPercent)
      return {
        id: s.service.id,
        name: s.service.name,
        totalSessions: s.totalSessions,
        usedSessions,
        remainingSessions: voucherRemainingSessions(s.totalSessions, usedSessions),
        basePriceCents: s.basePriceCents,
        discountPercent: s.discountPercent,
        finalPriceCents,
        pricePerSessionCents: voucherPricePerSessionCents(finalPriceCents, s.totalSessions),
      }
    })

    return {
      id: v.id,
      name: v.name,
      status: v.status,
      services,
      totalSessions: services.reduce((n, s) => n + s.totalSessions, 0),
      usedSessions: services.reduce((n, s) => n + s.usedSessions, 0),
      remainingSessions: services.reduce((n, s) => n + s.remainingSessions, 0),
      pricePaidCents: v.pricePaidCents,
      purchasedAt: v.createdAt.toISOString(),
      notes: v.notes,
      sessions: v.sessions.map((s) => ({
        id: s.id,
        serviceId: s.service.id,
        serviceName: s.service.name,
        workerName: [s.worker.name, s.worker.lastName].filter(Boolean).join(" "),
        usedAt: s.usedAt.toISOString(),
      })),
    }
  })
}

/** Los bonos con sesiones libres, que son los únicos que se pueden gastar hoy. */
export async function getRedeemableVouchers(customerId: string): Promise<CustomerVoucherRow[]> {
  const todos = await getCustomerVouchers(customerId)
  return todos.filter((v) => v.status === "ACTIVE" && v.remainingSessions > 0)
}

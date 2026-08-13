"use server"

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { validateAppointmentSlot } from "@/lib/availability"
import { sendReminderForAppointmentId } from "@/lib/whatsapp"
import { combineDateTime, dayRange } from "@/lib/format"
import { getSession, createSession, setSessionCookie } from "@/lib/session"
import { WEEKDAY_LABELS, LEAVE_TYPE_META, type LeaveType } from "@/lib/enums"
import { dayOfWeekFromDateStr } from "@/lib/schedule"
import { DEFAULT_REMINDER_ALERT_DAYS } from "@/lib/reminders"

export type ActionResult = { ok: boolean; error?: string; id?: string }

function revalidateAll() {
  revalidatePath("/agenda")
  revalidatePath("/appointments")
  revalidatePath("/dashboard")
  revalidatePath("/clients")
  revalidatePath("/services")
  revalidatePath("/workers")
  revalidatePath("/settings")
  revalidatePath("/horarios")
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  return v === "" ? null : v
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === "on" || v === "true" || v === "1"
}
function int(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key))
  return Number.isFinite(n) ? n : fallback
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\s+/g, "")
  if (!digits) return ""
  if (digits.startsWith("+")) return digits
  return `+34${digits}`
}

/* ------------------------------- CITAS ---------------------------------- */

export async function createAppointment(fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const serviceId = str(fd, "serviceId")
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })

    const duration = int(fd, "durationMinutes", service.durationMinutes) || service.durationMinutes
    const startAt = combineDateTime(str(fd, "date"), str(fd, "time"))
    const endAt = new Date(startAt.getTime() + duration * 60000)
    const cabinId = str(fd, "cabinId")
    const workerId = str(fd, "workerId")
    const customerId = str(fd, "customerId")

    const conflicts = await validateAppointmentSlot({ clinicId, cabinId, workerId, customerId, startAt, endAt })
    if (conflicts.length > 0) {
      return { ok: false, error: conflicts.map((c) => c.message).join(" ") }
    }

    const appt = await prisma.appointment.create({
      data: {
        clinicId,
        customerId,
        serviceId,
        workerId,
        cabinId,
        startAt,
        endAt,
        durationMinutes: duration,
        status: str(fd, "status") || "PENDING",
        reminderStatus: "PENDING", // se programa recordatorio al crear
        notes: optStr(fd, "notes"),
      },
    })
    revalidateAll()
    return { ok: true, id: appt.id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function updateAppointment(id: string, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const serviceId = str(fd, "serviceId")
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })
    const duration = int(fd, "durationMinutes", service.durationMinutes) || service.durationMinutes
    const startAt = combineDateTime(str(fd, "date"), str(fd, "time"))
    const endAt = new Date(startAt.getTime() + duration * 60000)
    const cabinId = str(fd, "cabinId")
    const workerId = str(fd, "workerId")
    const customerId = str(fd, "customerId")

    const conflicts = await validateAppointmentSlot({ clinicId, cabinId, workerId, customerId, startAt, endAt, excludeAppointmentId: id })
    if (conflicts.length > 0) {
      return { ok: false, error: conflicts.map((c) => c.message).join(" ") }
    }

    const existing = await prisma.appointment.findUniqueOrThrow({ where: { id } })
    const formStatus = str(fd, "status")

    // ¿Cambió algún parámetro de la cita (no estado/notas)? Si es así, la cita
    // vuelve a "pendiente de confirmar" y el recordatorio se reprograma.
    const materialChanged =
      customerId !== existing.customerId ||
      serviceId !== existing.serviceId ||
      workerId !== existing.workerId ||
      cabinId !== existing.cabinId ||
      startAt.getTime() !== existing.startAt.getTime() ||
      duration !== existing.durationMinutes

    // El estado explícito del usuario manda; si no tocó el estado y cambió un
    // parámetro, se fuerza PENDING.
    const statusChangedByUser = Boolean(formStatus) && formStatus !== existing.status
    const status = statusChangedByUser
      ? formStatus
      : materialChanged
        ? "PENDING"
        : existing.status

    // Solo se reprograma el recordatorio cuando cambian datos de la cita.
    const reminderStatus =
      materialChanged && ["SENT", "DELIVERED", "READ"].includes(existing.reminderStatus)
        ? "PENDING"
        : existing.reminderStatus

    await prisma.appointment.update({
      where: { id },
      data: {
        customerId,
        serviceId,
        workerId,
        cabinId,
        startAt,
        endAt,
        durationMinutes: duration,
        status,
        notes: optStr(fd, "notes"),
        reminderStatus,
      },
    })
    revalidateAll()
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function setAppointmentStatus(id: string, status: string, reason?: string): Promise<ActionResult> {
  try {
    const data: Record<string, unknown> = { status }
    if (status === "CANCELLED") {
      data.cancelledAt = new Date()
      data.cancelReason = reason ?? null
    }
    await prisma.appointment.update({ where: { id }, data })
    revalidateAll()
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteAppointment(id: string): Promise<ActionResult> {
  try {
    await prisma.whatsappMessage.deleteMany({ where: { appointmentId: id } })
    await prisma.appointment.delete({ where: { id } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function sendReminder(appointmentId: string): Promise<ActionResult> {
  try {
    const result = await sendReminderForAppointmentId(appointmentId)
    revalidateAll()
    if (!result.ok) return { ok: false, error: result.errorMessage || "Fallo al enviar." }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------ CLIENTES -------------------------------- */

export async function saveCustomer(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const birthDateRaw = optStr(fd, "birthDate")
    const data = {
      firstName: str(fd, "firstName"),
      lastName: optStr(fd, "lastName"),
      lastName2: optStr(fd, "lastName2"),
      phone: normalizePhone(str(fd, "phone")),
      phone2: normalizePhone(optStr(fd, "phone2") ?? "") || null,
      email: optStr(fd, "email"),
      birthDate: birthDateRaw ? new Date(birthDateRaw) : null,
      notes: optStr(fd, "notes"),
      whatsappOptIn: bool(fd, "whatsappOptIn"),
      active: bool(fd, "active"),
    }
    if (id) {
      await prisma.customer.update({ where: { id }, data })
    } else {
      await prisma.customer.create({ data: { ...data, clinicId } })
    }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  try {
    const count = await prisma.appointment.count({ where: { customerId: id } })
    if (count > 0) return { ok: false, error: "No se puede borrar: el cliente tiene citas." }
    await prisma.customer.delete({ where: { id } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------ SERVICIOS ------------------------------- */

export async function saveService(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const pricingType = str(fd, "pricingType") || "FIXED"
    const pricePerMinute = str(fd, "pricePerMinute")
    const familyId = str(fd, "familyId")
    if (!familyId) return { ok: false, error: "La familia es obligatoria." }
    const data = {
      familyId,
      name: str(fd, "name"),
      description: optStr(fd, "description"),
      durationMinutes: int(fd, "durationMinutes", 60),
      priceCents: Math.round(Number(str(fd, "price") || "0") * 100),
      pricingType,
      pricePerMinuteCents: pricingType === "PER_MINUTE" && pricePerMinute
        ? Math.round(Number(pricePerMinute) * 100)
        : null,
      active: bool(fd, "active"),
    }
    if (id) {
      await prisma.service.update({ where: { id }, data })
    } else {
      await prisma.service.create({ data: { ...data, clinicId } })
    }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function toggleServiceActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    await prisma.service.update({ where: { id }, data: { active } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* -------------------------- FAMILIAS DE SERVICIO ------------------------- */

export async function saveServiceFamily(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const data = {
      name: str(fd, "name"),
      active: bool(fd, "active"),
    }
    if (!data.name) return { ok: false, error: "El nombre es obligatorio." }
    if (id) {
      const updated = await prisma.serviceFamily.update({ where: { id }, data })
      revalidateAll()
      return { ok: true, id: updated.id }
    } else {
      const created = await prisma.serviceFamily.create({ data: { ...data, clinicId } })
      revalidateAll()
      return { ok: true, id: created.id }
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function toggleServiceFamilyActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    await prisma.serviceFamily.update({ where: { id }, data: { active } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ----------------------------- TRABAJADORES ----------------------------- */

export async function saveWorker(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const data = {
      name: str(fd, "name"),
      lastName: optStr(fd, "lastName"),
      email: optStr(fd, "email"),
      phone: optStr(fd, "phone"),
      role: str(fd, "role") || "WORKER",
      active: bool(fd, "active"),
      color: optStr(fd, "color") || "#3C54A4",
    }
    if (id) {
      await prisma.user.update({ where: { id }, data })
    } else {
      await prisma.user.create({ data: { ...data, clinicId } })
    }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function setUserPassword(id: string, password: string): Promise<ActionResult> {
  try {
    if (password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." }
    const hash = await bcrypt.hash(password, 12)
    await prisma.user.update({ where: { id }, data: { passwordHash: hash, mustChangePassword: true } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function changeOwnPassword(userId: string, newPassword: string): Promise<ActionResult> {
  try {
    if (newPassword.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." }
    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash, mustChangePassword: false } })
    // Re-issue session cookie with mustChangePassword: false
    const current = await getSession()
    if (current) {
      const token = await createSession({ ...current, mustChangePassword: false })
      await setSessionCookie(token)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function toggleWorkerActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    await prisma.user.update({ where: { id }, data: { active } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function checkAvailability(
  cabinId: string,
  workerId: string,
  customerId: string,
  date: string,
  time: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
): Promise<{
  cabinConflict: string | null
  workerConflict: string | null
  customerConflict: string | null
  scheduleConflict: string | null
}> {
  try {
    if (!cabinId || !workerId || !customerId || !date || !time || durationMinutes <= 0) {
      return { cabinConflict: null, workerConflict: null, customerConflict: null, scheduleConflict: null }
    }
    const clinicId = await getActiveClinicId()
    const startAt = new Date(`${date}T${time}`)
    const endAt = new Date(startAt.getTime() + durationMinutes * 60000)
    const conflicts = await validateAppointmentSlot({ clinicId, cabinId, workerId, customerId, startAt, endAt, excludeAppointmentId })
    return {
      cabinConflict: conflicts.find((c) => c.type === "CABIN")?.message ?? null,
      workerConflict: conflicts.find((c) => c.type === "WORKER")?.message ?? null,
      customerConflict: conflicts.find((c) => c.type === "CUSTOMER")?.message ?? null,
      scheduleConflict: conflicts.find((c) => c.type === "SCHEDULE")?.message ?? null,
    }
  } catch {
    return { cabinConflict: null, workerConflict: null, customerConflict: null, scheduleConflict: null }
  }
}

export async function deleteWorker(id: string): Promise<ActionResult> {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { active: true } })
    if (user.active) return { ok: false, error: "Desactiva el usuario antes de eliminarlo." }
    await prisma.user.delete({ where: { id } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------- CABINAS -------------------------------- */

export async function saveCabin(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const data = {
      name: str(fd, "name"),
      description: optStr(fd, "description"),
      sortOrder: int(fd, "sortOrder", 0),
      active: bool(fd, "active"),
    }
    if (id) {
      await prisma.cabin.update({ where: { id }, data })
    } else {
      await prisma.cabin.create({ data: { ...data, clinicId } })
    }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function toggleCabinActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    await prisma.cabin.update({ where: { id }, data: { active } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------- CLÍNICA -------------------------------- */

export async function updateClinic(fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        name: str(fd, "name"),
        taxId: optStr(fd, "taxId"),
        address: optStr(fd, "address"),
        phone: optStr(fd, "phone"),
        email: optStr(fd, "email"),
        openingTime: str(fd, "openingTime") || "09:00",
        closingTime: str(fd, "closingTime") || "20:00",
        whatsappEnabled: bool(fd, "whatsappEnabled"),
        whatsappTemplateName: optStr(fd, "whatsappTemplateName"),
        whatsappTemplateLang: optStr(fd, "whatsappTemplateLang") || "es",
        reminderHoursBefore: int(fd, "reminderHoursBefore", 24),
        inactivityWarningDays: int(fd, "inactivityWarningDays", 180),
      },
    })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------ PROVEEDORES ----------------------------- */

export async function saveSupplier(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const data = {
      name: str(fd, "name"),
      phone: optStr(fd, "phone"),
      email: optStr(fd, "email"),
      notes: optStr(fd, "notes"),
      active: bool(fd, "active"),
    }
    if (id) {
      await prisma.supplier.update({ where: { id }, data })
    } else {
      await prisma.supplier.create({ data: { ...data, clinicId } })
    }
    revalidatePath("/stock")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    const count = await prisma.product.count({ where: { supplierId: id } })
    if (count > 0) return { ok: false, error: "No se puede borrar: tiene productos asignados." }
    await prisma.supplier.delete({ where: { id } })
    revalidatePath("/stock")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------- PRODUCTOS ------------------------------ */

export async function saveProduct(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const data = {
      name: str(fd, "name"),
      description: optStr(fd, "description"),
      supplierId: optStr(fd, "supplierId"),
      priceCents: Math.round(Number(str(fd, "price") || "0") * 100),
      costCents: Math.round(Number(str(fd, "cost") || "0") * 100),
      stockMin: int(fd, "stockMin", 0),
      active: bool(fd, "active"),
    }
    if (id) {
      await prisma.product.update({ where: { id }, data })
    } else {
      await prisma.product.create({ data: { ...data, clinicId, stock: 0 } })
    }
    revalidatePath("/stock")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function registerOrder(
  lines: { productId: string; quantity: number }[],
  notes: string | null,
): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }
    if (lines.length === 0) return { ok: false, error: "Añade al menos un producto." }

    await prisma.$transaction(
      lines.flatMap(({ productId, quantity }) => [
        prisma.stockMovement.create({
          data: { productId, userId: session.userId, type: "ENTRY", quantity, notes },
        }),
        prisma.product.update({
          where: { id: productId },
          data: { stock: { increment: quantity } },
        }),
      ])
    )
    revalidatePath("/stock")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function addStockMovement(
  productId: string,
  type: "ENTRY" | "CONSUME" | "SALE",
  quantity: number,
  notes: string | null,
): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    const delta = type === "ENTRY" ? quantity : -quantity
    const newStock = product.stock + delta
    if (newStock < 0) return { ok: false, error: "Stock insuficiente." }

    await prisma.$transaction([
      prisma.stockMovement.create({
        data: { productId, userId: session.userId, type, quantity, notes },
      }),
      prisma.product.update({
        where: { id: productId },
        data: { stock: newStock },
      }),
    ])
    revalidatePath("/stock")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* --------------------------------- VENTAS -------------------------------- */

export type SaleLineInput = {
  type: "SERVICE" | "PRODUCT" | "GIFT_CARD"
  serviceId?: string
  productId?: string
  description: string
  quantity: number
  unitPriceCents: number
  discountPercent: number
  durationMinutes?: number
  totalCents: number
}

export async function createSale(
  customerId: string | null,
  saleType: "SALE" | "GIFT_CARD",
  paymentMethod: "CARD" | "CASH" | "DEBT",
  lines: SaleLineInput[],
  notes: string | null,
  giftCardRecipientId?: string | null,
  balanceAppliedCents: number = 0,
): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }
    const clinicId = await getActiveClinicId()

    if (lines.length === 0) return { ok: false, error: "La venta debe tener al menos una línea." }

    const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)
    const discountCents = lines.reduce((s, l) => s + Math.round(l.unitPriceCents * l.quantity * l.discountPercent / 100), 0)
    const totalCents = lines.reduce((s, l) => s + l.totalCents, 0)

    const sale = await prisma.$transaction(async (tx) => {
      // Saldo a favor disponible (solo positivo) del cliente comprador
      let availableBalance = 0
      if (customerId && saleType !== "GIFT_CARD") {
        const cust = await tx.customer.findUnique({ where: { id: customerId }, select: { balanceCents: true } })
        availableBalance = Math.max(0, cust?.balanceCents ?? 0)
      }

      // Saldo aplicado a la venta:
      //  - CASH/CARD: se respeta lo que eligió el usuario (puede dejar parte sin cubrir y pagar el resto).
      //  - DEBT: el saldo a favor cubre la deuda automáticamente; sólo el exceso queda como deuda.
      // Nunca supera el saldo disponible ni el total de la venta.
      let balanceUsed = customerId ? Math.min(Math.max(0, balanceAppliedCents), totalCents, availableBalance) : 0
      if (paymentMethod === "DEBT") {
        balanceUsed = Math.min(totalCents, availableBalance)
      }
      const remainingCents = totalCents - balanceUsed

      let status: "PAID" | "DEBT" = "PAID"
      let paidCents = totalCents
      if (saleType === "GIFT_CARD") {
        status = "PAID"
        paidCents = totalCents
      } else if (paymentMethod === "DEBT") {
        // El saldo a favor cubre parte; si queda algo pendiente es deuda ("Debido"),
        // no un pago parcial. Sólo es "Pagado" si el saldo cubre el total.
        paidCents = balanceUsed
        status = paidCents >= totalCents ? "PAID" : "DEBT"
      } else {
        // CASH or CARD: remainder is fully paid now
        paidCents = totalCents
        status = "PAID"
      }

      const s = await tx.sale.create({
        data: {
          clinicId,
          customerId: customerId || null,
          userId: session.userId,
          saleType,
          status,
          paymentMethod,
          subtotalCents,
          discountCents,
          totalCents,
          paidCents,
          notes,
          lines: {
            create: lines.map((l) => ({
              type: l.type,
              serviceId: l.serviceId ?? null,
              productId: l.productId ?? null,
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              discountPercent: l.discountPercent,
              durationMinutes: l.durationMinutes ?? null,
              totalCents: l.totalCents,
            })),
          },
        },
      })

      // Descontar stock de productos vendidos
      const productLines = lines.filter((l) => l.type === "PRODUCT" && l.productId)
      for (const pl of productLines) {
        await tx.stockMovement.create({
          data: { productId: pl.productId!, userId: session.userId, type: "SALE", quantity: pl.quantity, saleId: s.id, notes: null },
        })
        await tx.product.update({
          where: { id: pl.productId! },
          data: { stock: { decrement: pl.quantity } },
        })
      }

      // Tarjetas regalo: abono de saldo al destinatario
      const giftCardLines = lines.filter((l) => l.type === "GIFT_CARD")
      const recipientId = giftCardRecipientId ?? null
      for (const gc of giftCardLines) {
        if (recipientId) {
          await tx.customerBalanceMovement.create({
            data: { clinicId, customerId: recipientId, userId: session.userId, type: "GIFT_CARD_IN", amountCents: gc.totalCents, saleId: s.id, notes: gc.description },
          })
          await tx.customer.update({ where: { id: recipientId }, data: { balanceCents: { increment: gc.totalCents } } })
        }
      }

      // Saldo a favor usado (el saldo es solo crédito, nunca negativo).
      // La deuda NO toca el saldo: vive en el estado de la venta (status = DEBT).
      if (customerId && saleType !== "GIFT_CARD" && balanceUsed > 0) {
        await tx.customerBalanceMovement.create({
          data: { clinicId, customerId, userId: session.userId, type: "BALANCE_USED", amountCents: -balanceUsed, saleId: s.id, notes: null },
        })
        await tx.customer.update({ where: { id: customerId }, data: { balanceCents: { decrement: balanceUsed } } })
      }

      // Actualizar caja del día (solo el importe cobrado en efectivo/tarjeta, no el saldo)
      const today = new Date().toISOString().slice(0, 10)
      const existingCash = await tx.cashRegister.findUnique({ where: { clinicId_date: { clinicId, date: today } } })
      if (existingCash && existingCash.status === "OPEN") {
        // Para tarjetas regalo el saldo del comprador no se descuenta, así que se cobra el total íntegro
        const amountToRecord = saleType === "GIFT_CARD" ? totalCents : remainingCents
        const cardDelta = paymentMethod === "CARD" ? amountToRecord : 0
        const cashDelta = paymentMethod === "CASH" ? amountToRecord : 0
        await tx.cashRegister.update({
          where: { id: existingCash.id },
          data: { totalCardCents: { increment: cardDelta }, totalCashCents: { increment: cashDelta } },
        })
      }

      return s
    })

    revalidatePath("/sales")
    revalidatePath("/dashboard")
    revalidatePath("/clients")
    revalidatePath("/stock")
    revalidatePath("/cash-register")
    return { ok: true, id: sale.id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function payDebt(saleId: string, paymentMethod: "CARD" | "CASH"): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }
    const clinicId = await getActiveClinicId()

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } })
      const pending = sale.totalCents - sale.paidCents
      if (pending <= 0) return

      // Pagar la deuda cierra la venta y entra en caja. El saldo a favor no se toca.
      await tx.sale.update({ where: { id: saleId }, data: { status: "PAID", paidCents: sale.totalCents, paymentMethod } })

      const today = new Date().toISOString().slice(0, 10)
      const existingCash = await tx.cashRegister.findUnique({ where: { clinicId_date: { clinicId, date: today } } })
      if (existingCash && existingCash.status === "OPEN") {
        await tx.cashRegister.update({
          where: { id: existingCash.id },
          data: {
            totalCardCents: { increment: paymentMethod === "CARD" ? pending : 0 },
            totalCashCents: { increment: paymentMethod === "CASH" ? pending : 0 },
          },
        })
      }
    })

    revalidatePath("/sales")
    revalidatePath("/dashboard")
    revalidatePath("/cash-register")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ---------------------------- CAJA DIARIA -------------------------------- */

export async function openCashRegister(openingCashCents: number): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }
    const clinicId = await getActiveClinicId()
    const today = new Date().toISOString().slice(0, 10)

    if (!Number.isFinite(openingCashCents) || openingCashCents < 0)
      return { ok: false, error: "El saldo inicial no puede ser negativo." }

    const existing = await prisma.cashRegister.findUnique({ where: { clinicId_date: { clinicId, date: today } } })
    if (existing) return { ok: false, error: "Ya hay una caja abierta para hoy." }

    await prisma.cashRegister.create({
      data: { clinicId, date: today, status: "OPEN", openingCashCents, totalCardCents: 0, totalCashCents: 0 },
    })
    revalidatePath("/cash-register")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function closeCashRegister(
  registerId: string,
  closingDeclaredCents: number,
  closingKeptCents: number,
  denominationNotes: string | null,
): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }

    const reg = await prisma.cashRegister.findUniqueOrThrow({ where: { id: registerId } })
    const expectedCash = reg.openingCashCents + reg.totalCashCents
    const differenceCents = closingDeclaredCents - expectedCash

    await prisma.cashRegister.update({
      where: { id: registerId },
      data: {
        status: "CLOSED",
        closingDeclaredCents,
        closingKeptCents,
        differenceCents,
        denominationNotes,
        closedByUserId: session.userId,
        closedAt: new Date(),
      },
    })
    revalidatePath("/cash-register")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ---------------------------- FICHA CLIENTE ------------------------------ */

export async function getClientProfile(customerId: string) {
  const [customer, movements, recentSales, appointments] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true, firstName: true, lastName: true, lastName2: true,
        phone: true, phone2: true, email: true, birthDate: true,
        notes: true, balanceCents: true, whatsappOptIn: true,
      },
    }),
    prisma.customerBalanceMovement.findMany({
      where: { customerId },
      include: { user: { select: { name: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.sale.findMany({
      where: { customerId },
      include: {
        lines: { select: { description: true, totalCents: true, type: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.appointment.findMany({
      where: { customerId },
      include: {
        service: { select: { name: true } },
        worker: { select: { name: true } },
        cabin: { select: { name: true } },
      },
      orderBy: { startAt: "desc" },
    }),
  ])
  return { customer, movements, recentSales, appointments }
}

export async function getCustomerReminders(customerId: string) {
  return prisma.customerReminder.findMany({
    where: { customerId },
    include: {
      createdByUser: { select: { name: true, lastName: true } },
      completedByUser: { select: { name: true, lastName: true } },
    },
    orderBy: { dueDate: "asc" },
  })
}

export async function createCustomerReminder(customerId: string, fd: FormData): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }

    const title = str(fd, "title")
    const dueDateStr = str(fd, "dueDate")
    if (!title) return { ok: false, error: "Escribe el recordatorio." }
    if (!dueDateStr) return { ok: false, error: "Indica la fecha del recordatorio." }

    const alertDaysBefore = int(fd, "alertDaysBefore", DEFAULT_REMINDER_ALERT_DAYS)
    const clinicId = await getActiveClinicId()

    const created = await prisma.customerReminder.create({
      data: {
        clinicId,
        customerId,
        createdByUserId: session.userId,
        title,
        dueDate: dayRange(dueDateStr).start,
        alertDaysBefore,
      },
    })
    revalidatePath("/dashboard")
    revalidatePath("/clients")
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function completeCustomerReminder(id: string): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }

    await prisma.customerReminder.update({
      where: { id },
      data: { completedAt: new Date(), completedByUserId: session.userId },
    })
    revalidatePath("/dashboard")
    revalidatePath("/clients")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function getMonthOccupancy(
  year: number,
  month: number,
): Promise<Record<string, string[]>> {
  const session = await getSession()
  if (!session) return {}
  const clinicId = await getActiveClinicId()
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  const appts = await prisma.appointment.findMany({
    where: { clinicId, startAt: { gte: start, lte: end }, status: { not: "CANCELLED" } },
    select: { startAt: true, status: true },
  })
  const result: Record<string, string[]> = {}
  for (const a of appts) {
    const d = a.startAt
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    if (!result[key]) result[key] = []
    result[key].push(a.status)
  }
  return result
}

/* ------------------------------ HORARIOS -------------------------------- */

export type WeeklySlotInput = { startTime: string; endTime: string }
export type WeeklyDayInput = { dayOfWeek: number; slots: WeeklySlotInput[] }

function validateSlots(slots: WeeklySlotInput[]): string | null {
  for (const s of slots) {
    if (!s.startTime || !s.endTime) return "Cada franja necesita hora de inicio y fin."
    if (s.startTime >= s.endTime) return "La hora de fin debe ser posterior a la de inicio en cada franja."
  }
  // Comparación lexicográfica válida: "HH:MM" con ceros a la izquierda.
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime))
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      return `Las franjas no pueden solaparse (${sorted[i - 1].startTime}–${sorted[i - 1].endTime} y ${sorted[i].startTime}–${sorted[i].endTime}).`
    }
  }
  return null
}

export async function saveClinicWeeklySchedule(days: WeeklyDayInput[]): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    for (const d of days) {
      const err = validateSlots(d.slots)
      if (err) return { ok: false, error: `${WEEKDAY_LABELS[d.dayOfWeek]}: ${err}` }
    }
    await prisma.$transaction([
      prisma.clinicWeeklySlot.deleteMany({ where: { clinicId } }),
      ...days.flatMap((d) =>
        d.slots.map((s) =>
          prisma.clinicWeeklySlot.create({
            data: { clinicId, dayOfWeek: d.dayOfWeek, startTime: s.startTime, endTime: s.endTime },
          }),
        ),
      ),
    ])
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function saveWorkerWeeklySchedule(workerId: string, days: WeeklyDayInput[]): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    for (const d of days) {
      const err = validateSlots(d.slots)
      if (err) return { ok: false, error: `${WEEKDAY_LABELS[d.dayOfWeek]}: ${err}` }
    }
    await prisma.$transaction([
      prisma.workerWeeklySlot.deleteMany({ where: { workerId } }),
      ...days.flatMap((d) =>
        d.slots.map((s) =>
          prisma.workerWeeklySlot.create({
            data: { clinicId, workerId, dayOfWeek: d.dayOfWeek, startTime: s.startTime, endTime: s.endTime },
          }),
        ),
      ),
    ])
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function saveClinicScheduleOverride(
  date: string,
  closed: boolean,
  slots: WeeklySlotInput[],
  reason: string | null,
): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    if (!closed) {
      const err = validateSlots(slots)
      if (err) return { ok: false, error: err }
    }
    const existing = await prisma.clinicScheduleOverride.findUnique({ where: { clinicId_date: { clinicId, date } } })
    const override = existing
      ? await prisma.clinicScheduleOverride.update({ where: { id: existing.id }, data: { closed, reason } })
      : await prisma.clinicScheduleOverride.create({ data: { clinicId, date, closed, reason } })
    await prisma.clinicScheduleOverrideSlot.deleteMany({ where: { overrideId: override.id } })
    if (!closed && slots.length > 0) {
      await prisma.clinicScheduleOverrideSlot.createMany({
        data: slots.map((s) => ({ overrideId: override.id, startTime: s.startTime, endTime: s.endTime })),
      })
    }
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true, id: override.id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteClinicScheduleOverride(id: string): Promise<ActionResult> {
  try {
    await prisma.clinicScheduleOverride.delete({ where: { id } })
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function saveWorkerScheduleOverride(
  workerId: string,
  date: string,
  closed: boolean,
  slots: WeeklySlotInput[],
  reason: string | null,
): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    if (!closed) {
      const err = validateSlots(slots)
      if (err) return { ok: false, error: err }
    }
    const existing = await prisma.workerScheduleOverride.findUnique({
      where: { clinicId_workerId_date: { clinicId, workerId, date } },
    })
    const override = existing
      ? await prisma.workerScheduleOverride.update({ where: { id: existing.id }, data: { closed, reason } })
      : await prisma.workerScheduleOverride.create({ data: { clinicId, workerId, date, closed, reason } })
    await prisma.workerScheduleOverrideSlot.deleteMany({ where: { overrideId: override.id } })
    if (!closed && slots.length > 0) {
      await prisma.workerScheduleOverrideSlot.createMany({
        data: slots.map((s) => ({ overrideId: override.id, startTime: s.startTime, endTime: s.endTime })),
      })
    }
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true, id: override.id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteWorkerScheduleOverride(id: string): Promise<ActionResult> {
  try {
    await prisma.workerScheduleOverride.delete({ where: { id } })
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function saveHoliday(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    const data = {
      date: str(fd, "date"),
      name: str(fd, "name"),
      scope: str(fd, "scope") || "LOCAL",
    }
    if (!data.date || !data.name) return { ok: false, error: "Fecha y nombre son obligatorios." }
    if (id) {
      await prisma.holiday.update({ where: { id }, data })
    } else {
      await prisma.holiday.create({ data: { ...data, clinicId } })
    }
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  try {
    await prisma.holiday.delete({ where: { id } })
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

// Copia los festivos de fecha civil fija (mismo día/mes cada año) de un año a
// otro. Los movibles (Semana Santa) y los locales/autonómicos quedan fuera:
// solo se publican unos meses antes y hay que revisarlos a mano.
const FIXED_CIVIL_HOLIDAYS = [
  { month: 1, day: 1, name: "Año Nuevo", scope: "NATIONAL" },
  { month: 1, day: 6, name: "Epifanía del Señor", scope: "NATIONAL" },
  { month: 5, day: 1, name: "Fiesta del Trabajo", scope: "NATIONAL" },
  { month: 8, day: 15, name: "Asunción de la Virgen", scope: "NATIONAL" },
  { month: 10, day: 12, name: "Fiesta Nacional de España", scope: "NATIONAL" },
  { month: 12, day: 8, name: "Inmaculada Concepción", scope: "NATIONAL" },
  { month: 12, day: 25, name: "Natividad del Señor", scope: "NATIONAL" },
]

export async function copyFixedHolidaysToYear(targetYear: number): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    let created = 0
    for (const h of FIXED_CIVIL_HOLIDAYS) {
      const date = `${targetYear}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`
      const existing = await prisma.holiday.findUnique({ where: { clinicId_date: { clinicId, date } } })
      if (existing) continue
      await prisma.holiday.create({ data: { clinicId, date, name: h.name, scope: h.scope } })
      created++
    }
    revalidatePath("/horarios")
    return { ok: true, id: String(created) }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export type BulkHolidayEntry = { date: string; name: string; scope: string }

// Importación masiva: crea o actualiza (por fecha) cada entrada. Devuelve el
// recuento "creados|actualizados" codificado en `id` (mismo patrón que el
// resto de acciones de este archivo que no tienen un id único que devolver).
export async function bulkImportHolidays(entries: BulkHolidayEntry[]): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    if (entries.length === 0) return { ok: false, error: "No hay festivos para importar." }
    let created = 0
    let updated = 0
    for (const e of entries) {
      if (!e.date || !e.name) continue
      const existing = await prisma.holiday.findUnique({ where: { clinicId_date: { clinicId, date: e.date } } })
      if (existing) {
        await prisma.holiday.update({ where: { id: existing.id }, data: { name: e.name, scope: e.scope || "LOCAL" } })
        updated++
      } else {
        await prisma.holiday.create({ data: { clinicId, date: e.date, name: e.name, scope: e.scope || "LOCAL" } })
        created++
      }
    }
    revalidatePath("/horarios")
    return { ok: true, id: `${created}|${updated}` }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ----------------------------- VACACIONES -------------------------------- */

export async function saveLeaveBalance(
  workerId: string,
  year: number,
  vacationDaysTotal: number,
  personalDaysTotal: number,
): Promise<ActionResult> {
  try {
    const clinicId = await getActiveClinicId()
    await prisma.workerLeaveBalance.upsert({
      where: { clinicId_workerId_year: { clinicId, workerId, year } },
      update: { vacationDaysTotal, personalDaysTotal },
      create: { clinicId, workerId, year, vacationDaysTotal, personalDaysTotal },
    })
    revalidatePath("/horarios")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export type AddLeaveRangeResult = {
  ok: boolean
  error?: string
  assignedCount?: number
  skippedWeekendCount?: number
  skippedHolidayCount?: number
}

function addDaysToDateStr(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

// Asigna una ausencia de un día o un rango [startDate, endDate] (ambos
// inclusive; para un solo día basta con pasar el mismo valor en los dos). Los
// fines de semana y los festivos dentro del rango se saltan automáticamente:
// no se crean ni descuentan saldo, porque la empleada no iba a trabajar esos
// días de todos modos.
//
// Solo los tipos con cupo (vacaciones y asuntos propios, ver LEAVE_TYPE_META)
// se validan contra el saldo anual; una baja por enfermedad u otra ausencia
// justificada bloquea la agenda pero no consume días.
export async function addWorkerLeaveRange(
  workerId: string,
  startDate: string,
  endDate: string,
  type: LeaveType,
  notes: string | null,
): Promise<AddLeaveRangeResult> {
  try {
    if (!startDate || !endDate) return { ok: false, error: "Indica la fecha de inicio y fin." }
    if (startDate > endDate) return { ok: false, error: "La fecha de fin debe ser posterior o igual a la de inicio." }

    const dates: string[] = []
    for (let d = startDate; d <= endDate; d = addDaysToDateStr(d, 1)) {
      dates.push(d)
      if (dates.length > 366) return { ok: false, error: "El rango es demasiado largo." }
    }

    const clinicId = await getActiveClinicId()
    const holidays = await prisma.holiday.findMany({
      where: { clinicId, date: { in: dates } },
      select: { date: true },
    })
    const holidaySet = new Set(holidays.map((h) => h.date))

    let skippedWeekendCount = 0
    let skippedHolidayCount = 0
    const chargeable: string[] = []
    for (const date of dates) {
      const dow = dayOfWeekFromDateStr(date)
      if (dow === 0 || dow === 6) {
        skippedWeekendCount++
        continue
      }
      if (holidaySet.has(date)) {
        skippedHolidayCount++
        continue
      }
      chargeable.push(date)
    }

    if (chargeable.length === 0) {
      return { ok: false, error: "Ese rango no tiene ningún día laborable (todo son fines de semana o festivos)." }
    }

    const conflicts = await prisma.workerLeave.findMany({
      where: { clinicId, workerId, date: { in: chargeable } },
      select: { date: true },
    })
    if (conflicts.length > 0) {
      return {
        ok: false,
        error: `Ya hay día(s) libre(s) asignados en ese rango: ${conflicts.map((c) => c.date).join(", ")}.`,
      }
    }

    const quota = LEAVE_TYPE_META[type]?.quota ?? null
    if (quota) {
      const chargeableByYear = new Map<number, string[]>()
      for (const date of chargeable) {
        const year = Number(date.slice(0, 4))
        if (!chargeableByYear.has(year)) chargeableByYear.set(year, [])
        chargeableByYear.get(year)!.push(date)
      }
      for (const [year, yearDates] of chargeableByYear) {
        const balance = await prisma.workerLeaveBalance.findUnique({
          where: { clinicId_workerId_year: { clinicId, workerId, year } },
        })
        const total = quota === "vacation" ? (balance?.vacationDaysTotal ?? 0) : (balance?.personalDaysTotal ?? 0)
        const used = await prisma.workerLeave.count({
          where: { clinicId, workerId, type, date: { startsWith: `${year}-` } },
        })
        if (used + yearDates.length > total) {
          return {
            ok: false,
            error: `Saldo insuficiente de ${LEAVE_TYPE_META[type].label.toLowerCase()} en ${year} (disponibles ${total - used}, necesarios ${yearDates.length}).`,
          }
        }
      }
    }

    const session = await getSession()
    await prisma.workerLeave.createMany({
      data: chargeable.map((date) => ({
        clinicId,
        workerId,
        date,
        type,
        notes,
        createdByUserId: session?.userId ?? null,
      })),
    })
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true, assignedCount: chargeable.length, skippedWeekendCount, skippedHolidayCount }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteWorkerLeave(id: string): Promise<ActionResult> {
  try {
    await prisma.workerLeave.delete({ where: { id } })
    revalidatePath("/horarios")
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado"
}

"use server"

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { validateAppointmentSlot } from "@/lib/availability"
import { sendReminderForAppointmentId } from "@/lib/whatsapp"
import { combineDateTime } from "@/lib/format"
import { getSession, createSession, setSessionCookie } from "@/lib/session"

export type ActionResult = { ok: boolean; error?: string; id?: string }

function revalidateAll() {
  revalidatePath("/agenda")
  revalidatePath("/appointments")
  revalidatePath("/dashboard")
  revalidatePath("/clients")
  revalidatePath("/services")
  revalidatePath("/workers")
  revalidatePath("/settings")
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

    const conflicts = await validateAppointmentSlot({ cabinId, workerId, startAt, endAt })
    if (conflicts.length > 0) {
      return { ok: false, error: conflicts.map((c) => c.message).join(" ") }
    }

    const appt = await prisma.appointment.create({
      data: {
        clinicId,
        customerId: str(fd, "customerId"),
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
    const serviceId = str(fd, "serviceId")
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })
    const duration = int(fd, "durationMinutes", service.durationMinutes) || service.durationMinutes
    const startAt = combineDateTime(str(fd, "date"), str(fd, "time"))
    const endAt = new Date(startAt.getTime() + duration * 60000)
    const cabinId = str(fd, "cabinId")
    const workerId = str(fd, "workerId")

    const conflicts = await validateAppointmentSlot({ cabinId, workerId, startAt, endAt, excludeAppointmentId: id })
    if (conflicts.length > 0) {
      return { ok: false, error: conflicts.map((c) => c.message).join(" ") }
    }

    const existing = await prisma.appointment.findUniqueOrThrow({ where: { id } })
    // Si se reprograma una cita cuyo recordatorio ya se envió, re-programar (RN 19.6).
    const rescheduled = existing.startAt.getTime() !== startAt.getTime()
    const reminderStatus =
      rescheduled && existing.reminderStatus === "SENT" ? "PENDING" : existing.reminderStatus

    await prisma.appointment.update({
      where: { id },
      data: {
        customerId: str(fd, "customerId"),
        serviceId,
        workerId,
        cabinId,
        startAt,
        endAt,
        durationMinutes: duration,
        status: str(fd, "status") || existing.status,
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
    const data = {
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
      defaultWorkerId: optStr(fd, "defaultWorkerId"),
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

    const balanceUsed = customerId ? Math.min(Math.max(0, balanceAppliedCents), totalCents) : 0
    const remainingCents = totalCents - balanceUsed

    let status: "PAID" | "DEBT" | "PARTIAL" = "PAID"
    let paidCents = totalCents

    if (saleType === "GIFT_CARD") {
      status = "PAID"
      paidCents = totalCents
    } else if (paymentMethod === "DEBT") {
      paidCents = balanceUsed
      if (paidCents >= totalCents) status = "PAID"
      else if (paidCents > 0) status = "PARTIAL"
      else status = "DEBT"
    } else {
      // CASH or CARD: remainder is fully paid now
      paidCents = totalCents
      status = "PAID"
    }

    const sale = await prisma.$transaction(async (tx) => {
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

      // Movimientos de saldo/deuda del cliente comprador
      if (customerId && saleType !== "GIFT_CARD") {
        if (balanceUsed > 0) {
          await tx.customerBalanceMovement.create({
            data: { clinicId, customerId, userId: session.userId, type: "BALANCE_USED", amountCents: -balanceUsed, saleId: s.id, notes: null },
          })
          await tx.customer.update({ where: { id: customerId }, data: { balanceCents: { decrement: balanceUsed } } })
        }
        if (paymentMethod === "DEBT" && remainingCents > 0) {
          await tx.customerBalanceMovement.create({
            data: { clinicId, customerId, userId: session.userId, type: "DEBT_CREATED", amountCents: -remainingCents, saleId: s.id, notes: null },
          })
          await tx.customer.update({ where: { id: customerId }, data: { balanceCents: { decrement: remainingCents } } })
        }
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

      await tx.sale.update({ where: { id: saleId }, data: { status: "PAID", paidCents: sale.totalCents, paymentMethod } })

      if (sale.customerId) {
        await tx.customerBalanceMovement.create({
          data: { clinicId, customerId: sale.customerId, userId: session.userId, type: "DEBT_PAID", amountCents: pending, saleId, notes: null },
        })
        await tx.customer.update({ where: { id: sale.customerId }, data: { balanceCents: { increment: pending } } })
      }

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
      },
      orderBy: { startAt: "desc" },
      take: 50,
    }),
  ])
  return { customer, movements, recentSales, appointments }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado"
}

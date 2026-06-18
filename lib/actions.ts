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
      phone: str(fd, "phone"),
      phone2: optStr(fd, "phone2"),
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
    const data = {
      name: str(fd, "name"),
      description: optStr(fd, "description"),
      durationMinutes: int(fd, "durationMinutes", 60),
      priceCents: Math.round(Number(str(fd, "price") || "0") * 100),
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

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado"
}

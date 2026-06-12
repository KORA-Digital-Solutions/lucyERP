"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { validateAppointmentSlot } from "@/lib/availability"
import { sendReminderForAppointmentId } from "@/lib/whatsapp"
import { combineDateTime } from "@/lib/format"

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
    const data = {
      firstName: str(fd, "firstName"),
      lastName: optStr(fd, "lastName"),
      phone: str(fd, "phone"),
      email: optStr(fd, "email"),
      notes: optStr(fd, "notes"),
      whatsappOptIn: bool(fd, "whatsappOptIn"),
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
      },
    })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado"
}

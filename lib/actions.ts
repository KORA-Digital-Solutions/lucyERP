"use server"

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import {
  requireSession, requireAdmin, requireCounter, requireOperator, PinRequiredError,
} from "@/lib/auth"
import {
  PIN_LENGTH, apuntarFalloDePin, bloqueoRestanteMs, esPinBienFormado, generarPinLibre,
  hashearPin, mensajeDeBloqueo, nombreCompleto, olvidarFallosDePin, usuariaDelPin,
} from "@/lib/pin"
import {
  clearOperatorCookie, createOperatorToken, setOperatorCookie,
} from "@/lib/operator"
import { validateAppointmentSlot } from "@/lib/availability"
import { sendReminderForAppointmentId } from "@/lib/whatsapp"
import {
  combineDateTime, dayRange, isValidPhone, isValidPhonePrefix, joinPhone, normalizePhone,
} from "@/lib/format"
import { getSession } from "@/lib/session"
import {
  WEEKDAY_LABELS, LEAVE_TYPE_META, HOME_CARE_FAMILY, GIFT_CARD_FAMILY, type LeaveType,
} from "@/lib/enums"
import { dayOfWeekFromDateStr } from "@/lib/schedule"
import { DEFAULT_REMINDER_ALERT_DAYS, isReminderActive, isReminderOverdue } from "@/lib/reminders"

export type ActionResult = {
  ok: boolean
  error?: string
  id?: string
  /** Falta identificarse: la pantalla debe pedir el PIN y reintentar. */
  needsPin?: boolean
}

/** Traduce el "falta el PIN" para que la pantalla sepa qué hacer con él. */
function fallo(e: unknown): ActionResult {
  if (e instanceof PinRequiredError) return { ok: false, error: e.message, needsPin: true }
  return { ok: false, error: errMsg(e) }
}

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

/* ------------------------------- CITAS ---------------------------------- */

export async function createAppointment(fd: FormData): Promise<ActionResult> {
  try {
    await requireCounter()
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
    await requireCounter()
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
    await requireCounter()
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
    await requireCounter()
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
    await requireCounter()
    const result = await sendReminderForAppointmentId(appointmentId)
    revalidateAll()
    if (!result.ok) return { ok: false, error: result.errorMessage || "Fallo al enviar." }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------ CLIENTES -------------------------------- */

function customerDataFromForm(fd: FormData) {
  const birthDateRaw = optStr(fd, "birthDate")
  const phone = joinPhone(str(fd, "phonePrefix"), str(fd, "phone"))
  const phone2 = joinPhone(str(fd, "phone2Prefix"), str(fd, "phone2")) || null
  return {
    firstName: str(fd, "firstName"),
    // Obligatorio, así que nunca es null: si viene vacío lo rechaza
    // validateCustomer con un mensaje claro, no la base de datos.
    lastName: str(fd, "lastName"),
    lastName2: optStr(fd, "lastName2"),
    sex: optStr(fd, "sex"),
    profession: optStr(fd, "profession"),
    phone,
    // Sin teléfono la etiqueta no pinta nada: se limpia para que no quede un
    // "madre" suelto si se borra el número. El formulario ya bloquea el campo,
    // esto es el cinturón por si llega un envío sin pasar por él.
    phoneLabel: phone ? optStr(fd, "phoneLabel") : null,
    phone2,
    phone2Label: phone2 ? optStr(fd, "phone2Label") : null,
    email: optStr(fd, "email"),
    address: optStr(fd, "address"),
    referralSource: optStr(fd, "referralSource"),
    allergies: optStr(fd, "allergies"),
    birthDate: birthDateRaw ? new Date(birthDateRaw) : null,
    notes: optStr(fd, "notes"),
    whatsappOptIn: bool(fd, "whatsappOptIn"),
    active: bool(fd, "active"),
  }
}

// Nombre, primer apellido y teléfono son los campos obligatorios de la ficha. Se
// comprueban aquí, y no solo con el `required` del formulario, para que los
// dos caminos de alta —la ficha y el alta rápida del TPV— tengan el mismo
// rasero y no dependan de lo que valide el navegador.
function validateCustomer(fd: FormData, data: ReturnType<typeof customerDataFromForm>): string | null {
  if (!data.firstName) return "El nombre es obligatorio."
  if (!data.lastName) return "El primer apellido es obligatorio."
  if (!data.phone) return "El teléfono es obligatorio."
  if (!isValidPhonePrefix(str(fd, "phonePrefix"))) return "El prefijo del teléfono no es válido. Ejemplo: +34."
  if (!isValidPhone(data.phone)) return "Teléfono no válido. Ejemplo: 600 111 222."
  if (data.phone2) {
    if (!isValidPhonePrefix(str(fd, "phone2Prefix"))) return "El prefijo del teléfono 2 no es válido. Ejemplo: +34."
    if (!isValidPhone(data.phone2)) return "El segundo teléfono no es válido."
  }
  return null
}

// Siguiente nº de expediente de la clínica. Se calcula dentro de la misma
// transacción que el alta para que dos altas a la vez no cojan el mismo
// número; el índice único (clinicId, fileNumber) es la última red de seguridad.
async function nextFileNumber(tx: Prisma.TransactionClient, clinicId: string): Promise<number> {
  const last = await tx.customer.aggregate({ where: { clinicId }, _max: { fileNumber: true } })
  return (last._max.fileNumber ?? 0) + 1
}

export async function saveCustomer(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    await requireCounter()
    const clinicId = await getActiveClinicId()
    const data = customerDataFromForm(fd)
    const invalido = validateCustomer(fd, data)
    if (invalido) return { ok: false, error: invalido }
    if (id) {
      await prisma.customer.update({ where: { id }, data })
      revalidateAll()
      return { ok: true, id }
    }
    const created = await prisma.$transaction(async (tx) =>
      tx.customer.create({
        data: { ...data, clinicId, fileNumber: await nextFileNumber(tx, clinicId) },
      }),
    )
    revalidateAll()
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

// Alta rápida de cliente desde otra pantalla (p. ej. el TPV de ventas):
// devuelve el cliente creado para poder seleccionarlo sin recargar la página.
export type QuickCustomer = {
  id: string
  firstName: string
  lastName: string
  lastName2: string | null
  phone: string
  balanceCents: number
  whatsappOptIn: boolean
}

export async function createCustomerQuick(
  fd: FormData,
): Promise<ActionResult & { customer?: QuickCustomer }> {
  try {
    await requireCounter()
    const clinicId = await getActiveClinicId()
    const data = customerDataFromForm(fd)
    const invalido = validateCustomer(fd, data)
    if (invalido) return { ok: false, error: invalido }
    const created = await prisma.$transaction(async (tx) =>
      tx.customer.create({
        data: { ...data, clinicId, fileNumber: await nextFileNumber(tx, clinicId) },
        select: { id: true, firstName: true, lastName: true, lastName2: true, phone: true, balanceCents: true, whatsappOptIn: true },
      }),
    )
    revalidateAll()
    revalidatePath("/sales")
    return { ok: true, id: created.id, customer: created }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
    await prisma.serviceFamily.update({ where: { id }, data: { active } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ----------------------------- TRABAJADORES ----------------------------- */

/**
 * La casilla "Activo" de este formulario es el otro camino por el que alguien
 * se va o vuelve, así que el PIN se trata aquí igual que en el interruptor de
 * la lista: ver pinAlCambiarDeActividad. Devuelve el PIN nuevo cuando la
 * reactivación se lo genera, para que la pantalla pueda dictárselo.
 */
export async function saveWorker(
  id: string | null,
  fd: FormData,
): Promise<ActionResult & { pin?: string }> {
  try {
    await requireAdmin()
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
      const usuaria = await prisma.user.findFirstOrThrow({
        where: { id, clinicId },
        select: { id: true, active: true, pinHash: true, restorePinOnReactivate: true },
      })
      const { pin, ...delPin } = await pinAlCambiarDeActividad(usuaria, data.active)
      await prisma.user.update({ where: { id }, data: { ...data, ...delPin } })
      revalidateAll()
      return { ok: true, pin }
    }
    await prisma.user.create({ data: { ...data, clinicId } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function setUserPassword(id: string, password: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." }
    const hash = await bcrypt.hash(password, 12)
    await prisma.user.update({ where: { id }, data: { passwordHash: hash, mustChangePassword: true } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

// changeOwnPassword() se ha eliminado: recibía el userId a cambiar como
// parámetro y solo comprobaba requireSession(), así que cualquier sesión
// válida podía reescribir la contraseña de cualquier otra cuenta —incluida la
// de administradora— llamando a la acción con otro id. Toda función exportada
// desde un fichero "use server" es un endpoint accesible, aunque ninguna
// pantalla la use. Su sustituta es changePasswordAction() en lib/auth-actions.ts,
// que saca el userId de la sesión y nunca del formulario.

/* ------------------------- PIN DE MOSTRADOR ------------------------------ */

const SIN_PIN_LIBRE = "No se ha podido generar un PIN libre. Vuelve a intentarlo."

/** Lo que hace falta saber de una usuaria para decidir qué pasa con su PIN. */
type UsuariaAlCambiarDeActividad = {
  id: string
  active: boolean
  pinHash: string | null
  restorePinOnReactivate: boolean
}

/**
 * Qué le pasa al PIN cuando alguien se va del centro o vuelve.
 *
 * Al desactivarla se le retira: sus dígitos vuelven al bote en vez de quedar
 * reservados a quien ya no trabaja aquí. Si volviera con el suyo puesto, otra
 * podría haberlo elegido mientras tanto, y entonces habría dos activas con el
 * mismo PIN: el mostrador se identifica solo con los dígitos, así que el cobro
 * se apuntaría a quien saliera antes de la base.
 *
 * Al reactivarla se le da uno nuevo, porque el suyo ya no existe —solo se
 * guardaba hasheado— y nace marcado para cambiar, igual que el del alta: hay
 * que dictárselo en voz alta. Solo lo recibe quien lo tenía: reactivar a una
 * administradora de solo contraseña no le abre el mostrador.
 *
 * Lo llaman los dos caminos que tocan `active`: el interruptor de la lista
 * (toggleWorkerActive) y la casilla del formulario (saveWorker).
 */
async function pinAlCambiarDeActividad(
  usuaria: UsuariaAlCambiarDeActividad,
  active: boolean,
): Promise<{
  pinHash?: string | null
  mustChangePin?: boolean
  restorePinOnReactivate?: boolean
  /** En claro y una sola vez, para dictarlo. La pantalla lo enseña. */
  pin?: string
}> {
  if (active === usuaria.active) return {}

  if (!active) {
    return { pinHash: null, mustChangePin: false, restorePinOnReactivate: usuaria.pinHash !== null }
  }

  if (!usuaria.restorePinOnReactivate) return {}
  const pin = await generarPinLibre(usuaria.id)
  if (!pin) throw new Error(SIN_PIN_LIBRE)
  return {
    pinHash: await hashearPin(pin),
    mustChangePin: true,
    restorePinOnReactivate: false,
    pin,
  }
}


/**
 * Da un PIN nuevo a una trabajadora y lo devuelve EN CLARO una sola vez, para
 * poder dictárselo. No se guarda en claro en ningún sitio, así que si se
 * pierde no se recupera: se genera otro.
 *
 * Lo elige el sistema y no la administradora a propósito: los PIN escritos a
 * mano acaban siendo el año de nacimiento o el número del portal, y eso el
 * sistema no lo puede impedir. Nace marcado para cambiar, porque para llegar a
 * su dueña ha tenido que decirse en voz alta.
 */
export async function generateUserPin(id: string): Promise<ActionResult & { pin?: string }> {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()

    const usuaria = await prisma.user.findFirstOrThrow({
      where: { id, clinicId },
      select: { active: true },
    })
    if (!usuaria.active) return { ok: false, error: "Activa a la usuaria antes de darle un PIN." }

    const pin = await generarPinLibre(id)
    if (!pin) return { ok: false, error: SIN_PIN_LIBRE }

    await prisma.user.update({
      where: { id },
      data: { pinHash: await hashearPin(pin), mustChangePin: true },
    })
    revalidateAll()
    return { ok: true, pin }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function clearUserPin(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    await prisma.user.update({ where: { id }, data: { pinHash: null, mustChangePin: false } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * Identifica a quien está en el mostrador y abre la ventana durante la que sus
 * acciones quedan a su nombre. Ver lib/operator.ts.
 */
export async function identifyByPin(pin: string): Promise<ActionResult & { name?: string }> {
  try {
    const session = await requireCounter()

    const espera = bloqueoRestanteMs()
    if (espera > 0) return { ok: false, error: mensajeDeBloqueo(espera) }

    if (!esPinBienFormado(pin)) return { ok: false, error: `El PIN son ${PIN_LENGTH} dígitos.` }

    const u = await usuariaDelPin(pin)
    if (!u) {
      apuntarFalloDePin()
      return { ok: false, error: "PIN no reconocido." }
    }
    olvidarFallosDePin()

    const name = nombreCompleto(u)
    await setOperatorCookie(await createOperatorToken({ userId: u.id, name, clinicId: session.clinicId }))
    return { ok: true, name }
  } catch (e) {
    return fallo(e)
  }
}

/**
 * Deja de estar identificada. Se llama al terminar cada cobro: la identidad
 * dura lo que dura la venta, no lo que dura la ventana.
 */
export async function forgetOperator(): Promise<ActionResult> {
  try {
    await requireSession()
    await clearOperatorCookie()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * El interruptor de la lista. Devuelve el PIN nuevo cuando la reactivación se
 * lo genera, para que la pantalla pueda dictárselo: es la única vez que se ve.
 */
export async function toggleWorkerActive(
  id: string,
  active: boolean,
): Promise<ActionResult & { pin?: string }> {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()
    const usuaria = await prisma.user.findFirstOrThrow({
      where: { id, clinicId },
      select: { id: true, active: true, pinHash: true, restorePinOnReactivate: true },
    })

    const { pin, ...delPin } = await pinAlCambiarDeActividad(usuaria, active)
    await prisma.user.update({ where: { id }, data: { active, ...delPin } })
    revalidateAll()
    return { ok: true, pin }
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
    await requireSession()
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
    await requireAdmin()
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { active: true } })
    if (user.active) return { ok: false, error: "Desactiva el usuario antes de eliminarlo." }
    await prisma.user.delete({ where: { id } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ---------------------- INFORME DE PERSONAL ------------------------------ */

/**
 * Lo que ha hecho una empleada, línea a línea, para el informe de personal.
 *
 * Servicios y tarjetas regalo salen de `SaleLine.workerId`, que es quien
 * atiende o vende: en el mostrador cobra una y atiende otra, así que el
 * usuario del ticket no sirve para medir a nadie.
 *
 * Las ventas anteriores a que el TPV pidiera la profesional en las líneas de
 * producto se quedaron sin ella. Esas se atribuyen a quien cobró el ticket
 * (`Sale.userId`) para no perderlas del informe, y vienen marcadas con
 * `attributedByTicket` para poder avisarlo en pantalla en vez de dar por bueno
 * un número que no lo es. En las ventas nuevas no queda ninguna así.
 */
export type WorkerReportLine = {
  id: string
  date: string
  type: string
  family: string
  description: string
  notes: string | null
  customerName: string | null
  quantity: number
  discountPercent: number
  totalCents: number
  ticketStatus: string
  attributedByTicket: boolean
}

export async function getWorkerReport(workerId: string): Promise<{
  lines: WorkerReportLine[]
  servicesCents: number
  productsCents: number
  giftCardsCents: number
  totalCents: number
  ticketCount: number
}> {
  await requireAdmin()
  const clinicId = await getActiveClinicId()

  const rows = await prisma.saleLine.findMany({
    where: {
      sale: { clinicId },
      OR: [
        { workerId },
        // Productos antiguos, sin profesional en la línea: se cuentan a
        // quien cobró el ticket.
        { type: "PRODUCT", workerId: null, sale: { userId: workerId } },
      ],
    },
    select: {
      id: true,
      saleId: true,
      type: true,
      description: true,
      notes: true,
      quantity: true,
      discountPercent: true,
      totalCents: true,
      workerId: true,
      service: { select: { family: { select: { name: true } } } },
      sale: {
        select: {
          createdAt: true,
          status: true,
          customer: { select: { firstName: true, lastName: true, lastName2: true } },
        },
      },
    },
    orderBy: { sale: { createdAt: "desc" } },
  })

  const lines: WorkerReportLine[] = rows.map((l) => ({
    id: l.id,
    date: l.sale.createdAt.toISOString(),
    type: l.type,
    family:
      l.type === "PRODUCT" ? HOME_CARE_FAMILY :
      l.type === "GIFT_CARD" ? GIFT_CARD_FAMILY :
      l.service?.family?.name ?? "Sin familia",
    description: l.description,
    notes: l.notes,
    customerName: l.sale.customer
      ? [l.sale.customer.lastName, l.sale.customer.lastName2].filter(Boolean).join(" ")
        + `, ${l.sale.customer.firstName}`
      : null,
    quantity: l.quantity,
    discountPercent: l.discountPercent,
    totalCents: l.totalCents,
    ticketStatus: l.sale.status,
    attributedByTicket: l.workerId === null,
  }))

  const sumBy = (type: string) =>
    lines.reduce((s, l) => (l.type === type ? s + l.totalCents : s), 0)

  return {
    lines,
    servicesCents: sumBy("SERVICE"),
    productsCents: sumBy("PRODUCT"),
    giftCardsCents: sumBy("GIFT_CARD"),
    totalCents: lines.reduce((s, l) => s + l.totalCents, 0),
    ticketCount: new Set(rows.map((l) => l.saleId)).size,
  }
}

/* ------------------------------- CABINAS -------------------------------- */

export async function saveCabin(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
    const clinicId = await getActiveClinicId()
    await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        name: str(fd, "name"),
        slogan: optStr(fd, "slogan"),
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

/**
 * El catálogo —qué productos hay, de quién se compran y a qué precio— se toca
 * desde la gestión del centro, igual que los servicios. Lo que se mueve todos
 * los días son las existencias, y eso sigue siendo del mostrador: ver
 * registerOrder y addStockMovement, más abajo.
 *
 * Las dos pantallas enseñan lo mismo, así que al guardar se revalidan las dos.
 */
function revalidateCatalogo() {
  revalidatePath("/products")
  revalidatePath("/stock")
}

export async function saveSupplier(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    await requireAdmin()
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
    revalidateCatalogo()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const count = await prisma.product.count({ where: { supplierId: id } })
    if (count > 0) return { ok: false, error: "No se puede borrar: tiene productos asignados." }
    await prisma.supplier.delete({ where: { id } })
    revalidateCatalogo()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/* ------------------------------- PRODUCTOS ------------------------------ */

export async function saveProduct(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    await requireAdmin()
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
    revalidateCatalogo()
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
    await requireCounter()
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
    revalidateCatalogo()
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
    await requireCounter()
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
    revalidateCatalogo()
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * Regularización de inventario, desde la gestión del centro.
 *
 * No es una entrada ni un consumo: eso es el día a día y se apunta en el
 * mostrador según pasa. Esto es lo otro —se cuenta el estante, hay tres y el
 * sistema dice cinco— y se corrige poniendo lo que hay de verdad, no la
 * diferencia: nadie cuenta "me faltan dos", cuenta "hay tres".
 *
 * El motivo es obligatorio. Un descuadre sin explicación es justo el apunte
 * que dentro de un mes no sirve para nada, y este es el único sitio donde el
 * stock cambia sin que haya pasado nada en el mostrador.
 */
export async function adjustStock(
  productId: string,
  countedStock: number,
  reason: string,
): Promise<ActionResult> {
  try {
    const session = await requireAdmin()

    const motivo = reason.trim()
    if (!motivo) return { ok: false, error: "Escribe el motivo del ajuste." }
    if (!Number.isInteger(countedStock) || countedStock < 0) {
      return { ok: false, error: "Las existencias contadas tienen que ser un número entero de 0 o más." }
    }

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    const delta = countedStock - product.stock
    if (delta === 0) return { ok: false, error: "Ese es el stock que ya había: no hay nada que ajustar." }

    await prisma.$transaction([
      // La cantidad va con signo, que es lo que distingue "aparecieron dos" de
      // "faltan dos". En ENTRY y CONSUME el signo lo pone el tipo; aquí no.
      prisma.stockMovement.create({
        data: { productId, userId: session.userId, type: "ADJUST", quantity: delta, notes: motivo },
      }),
      prisma.product.update({ where: { id: productId }, data: { stock: countedStock } }),
    ])
    revalidateCatalogo()
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
  /** Quien atiende o vende, que no tiene por qué ser quien cobra. */
  workerId?: string | null
  /** Solo tarjetas regalo: qué se plantea regalar. */
  notes?: string | null
  /** La cita que se está cobrando, si la línea sale de la agenda. */
  appointmentId?: string | null
}

/* --------------- CITAS PENDIENTES DE COBRAR (TPV ← agenda) --------------- */

export type BillableAppointment = {
  id: string
  startAt: string
  serviceId: string
  serviceName: string
  familyName: string
  durationMinutes: number
  priceCents: number
  workerId: string
  workerName: string
  alreadyDone: boolean
}

/**
 * Lo que este cliente tiene hecho y sin cobrar, para montar el ticket desde la
 * agenda en vez de teclearlo. La cita ya sabe el servicio, la duración y la
 * profesional que atendió: repetirlo a mano es a la vez trabajo y una fuente
 * de errores.
 */
export async function getBillableAppointments(customerId: string): Promise<BillableAppointment[]> {
  await requireSession()
  const clinicId = await getActiveClinicId()

  // Del último mes hasta el final de hoy. Lo de la semana que viene no se cobra
  // hoy, y lo que lleva medio año sin cobrar ya no se rescata por aquí: se mete
  // a mano, como cualquier venta suelta.
  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  desde.setHours(0, 0, 0, 0)
  const hasta = new Date()
  hasta.setHours(23, 59, 59, 999)

  const citas = await prisma.appointment.findMany({
    where: {
      clinicId,
      customerId,
      startAt: { gte: desde, lte: hasta },
      // Lo cancelado y las ausencias no se cobran.
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      // Y lo ya cobrado no vuelve a ofrecerse.
      saleLines: { none: {} },
    },
    include: {
      service: {
        select: {
          id: true, name: true, priceCents: true, pricingType: true,
          pricePerMinuteCents: true, family: { select: { name: true } },
        },
      },
      worker: { select: { name: true, lastName: true } },
    },
    orderBy: { startAt: "desc" },
  })

  return citas.map((c) => ({
    id: c.id,
    startAt: c.startAt.toISOString(),
    serviceId: c.serviceId,
    serviceName: c.service.name,
    familyName: c.service.family.name,
    durationMinutes: c.durationMinutes,
    // Manda la tarifa de hoy, no la del día en que se pidió la cita. En el
    // ticket sigue siendo editable, como cualquier otra línea.
    priceCents: c.service.pricingType === "PER_MINUTE" && c.service.pricePerMinuteCents
      ? c.service.pricePerMinuteCents * c.durationMinutes
      : c.service.priceCents,
    workerId: c.workerId,
    workerName: [c.worker.name, c.worker.lastName].filter(Boolean).join(" "),
    alreadyDone: c.status === "DONE",
  }))
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
    // Quien cobra es quien se ha identificado con su PIN, no quien abrió el
    // navegador por la mañana: el mostrador es un puesto compartido.
    const operator = await requireOperator()
    // Puede haber desaparecido (BD resembrada, usuario desactivado…). Sin esta
    // comprobación la venta revienta con un error de clave foránea de Prisma
    // que no le dice nada a nadie.
    const cobra = await prisma.user.findFirst({ where: { id: operator.userId, active: true }, select: { id: true } })
    if (!cobra) return { ok: false, error: "Ese usuario ya no está activo. Identifícate de nuevo." }
    const clinicId = await getActiveClinicId()

    if (lines.length === 0) return { ok: false, error: "La venta debe tener al menos una línea." }
    // Toda línea lleva profesional, también las de producto: es lo que permite
    // seguir el ticket entero y medir a cada una en el informe de personal.
    const sinProfesional = lines.find((l) => !l.workerId)
    if (sinProfesional) {
      return { ok: false, error: `Asigna un profesional a "${sinProfesional.description}".` }
    }

    // Una cita se cobra una sola vez. El índice único de SaleLine.appointmentId
    // ya lo impide pase lo que pase, pero su error no le dice nada a nadie:
    // esto es para poder explicarlo. Suele pasar con dos pestañas abiertas.
    const citasDelTicket = [...new Set(lines.map((l) => l.appointmentId).filter((x): x is string => !!x))]
    if (citasDelTicket.length > 0) {
      const yaCobrada = await prisma.saleLine.findFirst({
        where: { appointmentId: { in: citasDelTicket } },
        select: { appointmentId: true },
      })
      if (yaCobrada) {
        return { ok: false, error: "Una de las citas del ticket ya se cobró en otra venta. Vuelve a cargar la pantalla." }
      }
    }

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
          userId: operator.userId,
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
              workerId: l.workerId ?? null,
              notes: l.notes ?? null,
              appointmentId: l.appointmentId ?? null,
            })),
          },
        },
      })

      // Cobrar una cita la da por hecha. Hasta ahora las citas se quedaban en
      // PENDING para siempre porque nadie volvía a la agenda a marcarlas.
      if (citasDelTicket.length > 0) {
        await tx.appointment.updateMany({
          where: { id: { in: citasDelTicket }, clinicId },
          data: { status: "DONE" },
        })
      }

      // Descontar stock de productos vendidos
      const productLines = lines.filter((l) => l.type === "PRODUCT" && l.productId)
      for (const pl of productLines) {
        await tx.stockMovement.create({
          data: { productId: pl.productId!, userId: operator.userId, type: "SALE", quantity: pl.quantity, saleId: s.id, notes: null },
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
            // La nota explica qué se le regala; sin ella queda la descripción
            // de siempre ("Tarjeta regalo — Fulanita"), que es lo que había.
            data: { clinicId, customerId: recipientId, userId: operator.userId, type: "GIFT_CARD_IN", amountCents: gc.totalCents, saleId: s.id, notes: gc.notes?.trim() || gc.description },
          })
          await tx.customer.update({ where: { id: recipientId }, data: { balanceCents: { increment: gc.totalCents } } })
        }
      }

      // Saldo a favor usado (el saldo es solo crédito, nunca negativo).
      // La deuda NO toca el saldo: vive en el estado de la venta (status = DEBT).
      if (customerId && saleType !== "GIFT_CARD" && balanceUsed > 0) {
        await tx.customerBalanceMovement.create({
          data: { clinicId, customerId, userId: operator.userId, type: "BALANCE_USED", amountCents: -balanceUsed, saleId: s.id, notes: null },
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
    revalidatePath("/agenda")
    revalidatePath("/appointments")
    revalidatePath("/stock")
    revalidatePath("/cash-register")
    return { ok: true, id: sale.id }
  } catch (e) {
    return fallo(e)
  }
}

export async function payDebt(saleId: string, paymentMethod: "CARD" | "CASH"): Promise<ActionResult> {
  try {
    // Cobrar una deuda es cobrar: queda a nombre de quien la cobra.
    const operator = await requireOperator()
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
    return fallo(e)
  }
}

/* ---------------------------- CAJA DIARIA -------------------------------- */

export async function openCashRegister(openingCashCents: number): Promise<ActionResult> {
  try {
    await requireCounter()
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
    // El cierre lleva nombre: quien cuadra la caja responde del descuadre.
    const operator = await requireOperator()

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
        closedByUserId: operator.userId,
        closedAt: new Date(),
      },
    })
    revalidatePath("/cash-register")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return fallo(e)
  }
}

/* ---------------------------- FICHA CLIENTE ------------------------------ */

// Una sola fila de cliente con la misma forma que las del listado (ClientRow).
// La ficha se pinta a partir de esa fila, así que quien la abre desde fuera
// de /clients — el TPV, por ejemplo — la pide por aquí en vez de traerse
// todos los clientes.
export async function getClientRow(customerId: string) {
  await requireSession()
  const clinicId = await getActiveClinicId()
  const c = await prisma.customer.findFirst({
    where: { id: customerId, clinicId },
    include: {
      appointments: {
        where: { status: { in: ["DONE", "CONFIRMED", "PENDING"] } },
        orderBy: { startAt: "desc" },
        take: 1,
      },
      sales: {
        where: { status: "DEBT" },
        select: { totalCents: true, paidCents: true },
      },
    },
  })
  if (!c) return null

  const lastApptDate = c.appointments[0]?.startAt ?? null
  const daysSince = lastApptDate
    ? Math.floor((Date.now() - lastApptDate.getTime()) / 86_400_000)
    : null

  return {
    id: c.id,
    fileNumber: c.fileNumber,
    firstName: c.firstName,
    lastName: c.lastName,
    lastName2: c.lastName2,
    sex: c.sex,
    profession: c.profession,
    phone: c.phone,
    phoneLabel: c.phoneLabel,
    phone2: c.phone2,
    phone2Label: c.phone2Label,
    email: c.email,
    address: c.address,
    referralSource: c.referralSource,
    allergies: c.allergies,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    whatsappOptIn: c.whatsappOptIn,
    active: c.active ?? true,
    balanceCents: c.balanceCents,
    debtCents: c.sales.reduce((s, x) => s + (x.totalCents - x.paidCents), 0),
    lastAppointment: lastApptDate
      ? lastApptDate.toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
      : null,
    daysSinceLastAppt: daysSince,
  }
}

export async function getClientProfile(customerId: string) {
  await requireSession()
  const [customer, movements, appointments] = await Promise.all([
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
      include: {
        user: { select: { name: true, lastName: true } },
        // Un abono por tarjeta regalo se explica en la venta que lo generó: la
        // nota de qué se le regala y quién se la vendió viven en su línea.
        sale: {
          select: {
            lines: {
              where: { type: "GIFT_CARD" },
              select: { notes: true, worker: { select: { name: true, lastName: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
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
  return { customer, movements, appointments }
}

export type ConsumptionLine = {
  family: string
  description: string
  quantity: number
  discountPercent: number
  totalCents: number
  /** Solo en líneas de producto: permite ver cada cuánto lo repone. */
  productId: string | null
  /** Solo en tarjetas regalo: qué se plantea regalar. */
  notes: string | null
}

export type ConsumptionTicket = {
  id: string
  date: string
  status: string
  totalCents: number
  lines: ConsumptionLine[]
}

// Historial de consumo del cliente: todo lo que se le ha cobrado alguna vez,
// por tickets y en orden cronológico inverso.
//
// Se devuelve entero, sin filtrar por fechas ni paginar: el histórico de un
// cliente son unos cientos de líneas como mucho, y teniéndolo todo en el
// cliente los filtros de fecha se aplican sin volver al servidor.
export async function getCustomerConsumption(customerId: string): Promise<{
  tickets: ConsumptionTicket[]
  totalCents: number
}> {
  await requireSession()
  const sales = await prisma.sale.findMany({
    where: { customerId },
    select: {
      id: true,
      createdAt: true,
      status: true,
      totalCents: true,
      lines: {
        select: {
          type: true,
          description: true,
          quantity: true,
          discountPercent: true,
          totalCents: true,
          productId: true,
          notes: true,
          service: { select: { family: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const tickets: ConsumptionTicket[] = sales.map((s) => ({
    id: s.id,
    date: s.createdAt.toISOString(),
    status: s.status,
    totalCents: s.totalCents,
    lines: s.lines.map((l) => ({
      family:
        l.type === "PRODUCT" ? HOME_CARE_FAMILY :
        l.type === "GIFT_CARD" ? GIFT_CARD_FAMILY :
        l.service?.family?.name ?? "Sin familia",
      description: l.description,
      quantity: l.quantity,
      discountPercent: l.discountPercent,
      totalCents: l.totalCents,
      productId: l.productId,
      notes: l.notes,
    })),
  }))

  return {
    tickets,
    totalCents: tickets.reduce((sum, t) => sum + t.totalCents, 0),
  }
}

export async function getCustomerReminders(customerId: string) {
  await requireSession()
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
    await requireCounter()
    const session = await getSession()
    if (!session) return { ok: false, error: "No autenticado." }

    const title = str(fd, "title")
    // Sin fecha se guarda como permanente: es un aviso de la ficha, no una
    // tarea que venza. Ver lib/reminders.ts.
    const dueDateStr = str(fd, "dueDate")
    if (!title) return { ok: false, error: "Escribe el recordatorio." }

    const alertDaysBefore = int(fd, "alertDaysBefore", DEFAULT_REMINDER_ALERT_DAYS)
    const clinicId = await getActiveClinicId()

    const created = await prisma.customerReminder.create({
      data: {
        clinicId,
        customerId,
        createdByUserId: session.userId,
        title,
        dueDate: dueDateStr ? dayRange(dueDateStr).start : null,
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

// Solo los que avisan al atender al cliente: los permanentes siempre, y los
// que tienen fecha únicamente cuando ya están dentro de su ventana de aviso o
// vencidos. El de dentro de tres meses no tiene por qué salir cada vez que se
// le cobra algo.
export async function getCustomerReminderAlerts(customerId: string) {
  await requireSession()
  const pendientes = await prisma.customerReminder.findMany({
    where: { customerId, completedAt: null },
    orderBy: [{ dueDate: "asc" }],
  })
  const now = new Date()
  return pendientes
    .filter((r) => isReminderActive(r.dueDate, r.alertDaysBefore, now))
    .map((r) => ({
      id: r.id,
      title: r.title,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      overdue: isReminderOverdue(r.dueDate, now),
    }))
}

export async function deleteCustomerReminder(id: string): Promise<ActionResult> {
  try {
    await requireCounter()
    await prisma.customerReminder.delete({ where: { id } })
    revalidatePath("/dashboard")
    revalidatePath("/clients")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

// Para el "lo he completado sin querer": vuelve a pendiente y se olvida de
// quién lo había completado, que si no queda un rastro que ya no es verdad.
export async function reopenCustomerReminder(id: string): Promise<ActionResult> {
  try {
    await requireCounter()
    await prisma.customerReminder.update({
      where: { id },
      data: { completedAt: null, completedByUserId: null },
    })
    revalidatePath("/dashboard")
    revalidatePath("/clients")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function completeCustomerReminder(id: string): Promise<ActionResult> {
  try {
    await requireCounter()
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
  // Ya estaba protegida antes de esta revisión. Se mantiene el fallo suave
  // (devolver vacío en vez de lanzar) porque alimenta el mini calendario y
  // un throw aquí rompería la vista; el proxy ya redirige al login.
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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
    await requireAdmin()
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

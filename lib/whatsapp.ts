import { prisma } from "@/lib/db"
import { normalizePhone } from "@/lib/format"

// Cliente de WhatsApp Business Cloud API.
// Si no hay WHATSAPP_ACCESS_TOKEN configurado, funciona en modo SIMULADO:
// no llama a Meta pero registra el mensaje como SENT (útil para desarrollo).

export interface AppointmentForReminder {
  id: string
  clinicId: string
  customerId: string
  startAt: Date
  customer: { firstName: string; lastName: string | null; phone: string; whatsappOptIn: boolean }
  service: { name: string }
  worker: { name: string }
  clinic: { name: string; whatsappTemplateName: string | null; whatsappTemplateLang: string | null }
}

export interface WhatsappSendResult {
  ok: boolean
  simulated: boolean
  messageId?: string
  payload: string
  response: string
  errorCode?: string
  errorMessage?: string
}

function env() {
  return {
    version: process.env.WHATSAPP_API_VERSION || "v21.0",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    token: process.env.WHATSAPP_ACCESS_TOKEN || "",
  }
}

export function isWhatsappConfigured(): boolean {
  const { token, phoneNumberId } = env()
  return Boolean(token && phoneNumberId)
}

export function buildTemplatePayload(appt: AppointmentForReminder) {
  const templateName = appt.clinic.whatsappTemplateName || "appointment_reminder_es"
  const lang = appt.clinic.whatsappTemplateLang || "es"
  const fecha = appt.startAt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
  const hora = appt.startAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })

  return {
    messaging_product: "whatsapp",
    to: normalizePhone(appt.customer.phone).replace("+", ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: appt.customer.firstName },
            { type: "text", text: appt.clinic.name },
            { type: "text", text: fecha },
            { type: "text", text: hora },
            { type: "text", text: appt.service.name },
            { type: "text", text: appt.worker.name },
          ],
        },
      ],
    },
  }
}

async function callWhatsappApi(payload: object): Promise<WhatsappSendResult> {
  const { version, phoneNumberId, token } = env()
  const payloadStr = JSON.stringify(payload)

  // Modo simulado
  if (!isWhatsappConfigured()) {
    const fakeId = "wamid.SIMULATED-" + Math.abs(hashString(payloadStr)).toString(36)
    return {
      ok: true,
      simulated: true,
      messageId: fakeId,
      payload: payloadStr,
      response: JSON.stringify({ simulated: true, messages: [{ id: fakeId }] }),
    }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: payloadStr,
    })
    const data = await res.json()
    if (!res.ok) {
      return {
        ok: false,
        simulated: false,
        payload: payloadStr,
        response: JSON.stringify(data),
        errorCode: String(data?.error?.code ?? res.status),
        errorMessage: data?.error?.message ?? "Error desconocido de la API",
      }
    }
    return {
      ok: true,
      simulated: false,
      messageId: data?.messages?.[0]?.id,
      payload: payloadStr,
      response: JSON.stringify(data),
    }
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      payload: payloadStr,
      response: "",
      errorCode: "NETWORK",
      errorMessage: err instanceof Error ? err.message : String(err),
    }
  }
}

// Envía el recordatorio de una cita y registra el WhatsappMessage + reminderStatus.
export async function sendAppointmentReminder(appt: AppointmentForReminder): Promise<WhatsappSendResult> {
  const payload = buildTemplatePayload(appt)
  const result = await callWhatsappApi(payload)

  await prisma.whatsappMessage.create({
    data: {
      clinicId: appt.clinicId,
      appointmentId: appt.id,
      customerId: appt.customerId,
      direction: "OUTBOUND",
      toPhone: normalizePhone(appt.customer.phone),
      templateName: appt.clinic.whatsappTemplateName,
      templateLanguage: appt.clinic.whatsappTemplateLang,
      providerMessageId: result.messageId,
      status: result.ok ? "SENT" : "FAILED",
      payloadJson: result.payload,
      responseJson: result.response,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      sentAt: result.ok ? new Date() : null,
    },
  })

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { reminderStatus: result.ok ? "SENT" : "FAILED" },
  })

  return result
}

// Carga la cita con relaciones necesarias y envía el recordatorio.
export async function sendReminderForAppointmentId(appointmentId: string): Promise<WhatsappSendResult> {
  const appt = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { customer: true, service: true, worker: true, clinic: true },
  })

  if (!appt.customer.whatsappOptIn) {
    throw new Error("El cliente no ha dado consentimiento para recibir WhatsApp.")
  }
  return sendAppointmentReminder(appt as AppointmentForReminder)
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h
}

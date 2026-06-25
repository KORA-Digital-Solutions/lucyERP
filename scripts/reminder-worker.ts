/**
 * Worker de recordatorios WhatsApp (POC Fase 1).
 *
 * Proceso Node.js independiente que cada 5 minutos busca citas dentro de la
 * ventana de recordatorio y envía el mensaje vía WhatsApp Business Cloud API.
 * Si no hay WHATSAPP_ACCESS_TOKEN, funciona en modo SIMULADO (registra el
 * mensaje como SENT sin llamar a Meta).
 *
 *   npm run worker:reminders
 *
 * Es autocontenido (no usa los alias "@/...") para ejecutarse con tsx.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import cron from "node-cron"
import { PrismaClient } from "@prisma/client"

// --- Carga manual de .env (el worker no pasa por Next) ---------------
function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (!m) continue
      const key = m[1]
      let val = (m[2] ?? "").trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    console.warn("[worker] No se encontró .env, usando variables del entorno.")
  }
}
loadEnv()

const prisma = new PrismaClient()

function normalizePhone(phone: string, defaultCountry = "34"): string {
  let p = phone.replace(/[\s\-().]/g, "")
  if (p.startsWith("+")) return p
  if (p.startsWith("00")) return "+" + p.slice(2)
  if (p.length === 9) return `+${defaultCountry}${p}`
  return "+" + p
}

const waEnv = {
  version: process.env.WHATSAPP_API_VERSION || "v21.0",
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  token: process.env.WHATSAPP_ACCESS_TOKEN || "",
}
const simulated = !(waEnv.token && waEnv.phoneNumberId)

type ApptWithRelations = Awaited<ReturnType<typeof findDueAppointments>>[number]

async function findDueAppointments() {
  const clinic = await prisma.clinic.findFirst({ orderBy: { createdAt: "asc" } })
  if (!clinic || !clinic.whatsappEnabled) return []

  const now = new Date()
  const hours = clinic.reminderHoursBefore
  // Ventana ±15 min alrededor de "ahora + hoursBefore".
  const windowStart = new Date(now.getTime() + (hours * 60 - 15) * 60000)
  const windowEnd = new Date(now.getTime() + (hours * 60 + 15) * 60000)

  return prisma.appointment.findMany({
    where: {
      clinicId: clinic.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      reminderStatus: { in: ["NOT_SCHEDULED", "PENDING"] },
      startAt: { gte: windowStart, lte: windowEnd },
      customer: { whatsappOptIn: true },
    },
    include: { customer: true, service: true, worker: true, clinic: true },
  })
}

function buildPayload(appt: ApptWithRelations) {
  const fecha = appt.startAt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
  const hora = appt.startAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  return {
    messaging_product: "whatsapp",
    to: normalizePhone(appt.customer.phone).replace("+", ""),
    type: "template",
    template: {
      name: appt.clinic.whatsappTemplateName || "appointment_reminder_es",
      language: { code: appt.clinic.whatsappTemplateLang || "es" },
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

async function sendOne(appt: ApptWithRelations) {
  // Bloqueo optimista para evitar duplicados.
  await prisma.appointment.update({ where: { id: appt.id }, data: { reminderStatus: "SENDING" } })

  const payload = buildPayload(appt)
  const payloadStr = JSON.stringify(payload)
  let ok = false
  let messageId: string | undefined
  let response = ""
  let errorMessage: string | undefined

  try {
    if (simulated) {
      ok = true
      messageId = "wamid.SIMULATED-" + appt.id
      response = JSON.stringify({ simulated: true, messages: [{ id: messageId }] })
    } else {
      const res = await fetch(`https://graph.facebook.com/${waEnv.version}/${waEnv.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${waEnv.token}`, "Content-Type": "application/json" },
        body: payloadStr,
      })
      const data = await res.json()
      response = JSON.stringify(data)
      ok = res.ok
      if (ok) messageId = data?.messages?.[0]?.id
      else errorMessage = data?.error?.message ?? `HTTP ${res.status}`
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  await prisma.whatsappMessage.create({
    data: {
      clinicId: appt.clinicId,
      appointmentId: appt.id,
      customerId: appt.customerId,
      direction: "OUTBOUND",
      toPhone: normalizePhone(appt.customer.phone),
      templateName: appt.clinic.whatsappTemplateName,
      templateLanguage: appt.clinic.whatsappTemplateLang,
      providerMessageId: messageId,
      status: ok ? "SENT" : "FAILED",
      payloadJson: payloadStr,
      responseJson: response,
      errorMessage,
      sentAt: ok ? new Date() : null,
    },
  })

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { reminderStatus: ok ? "SENT" : "FAILED" },
  })

  const who = `${appt.customer.firstName} (${appt.startAt.toLocaleString("es-ES")})`
  console.log(ok ? `  ✅ ${who}${simulated ? " [simulado]" : ""}` : `  ❌ ${who} — ${errorMessage}`)
}

async function processDueAppointmentReminders() {
  const appts = await findDueAppointments()
  if (appts.length === 0) {
    console.log(`[${new Date().toLocaleTimeString("es-ES")}] Sin recordatorios pendientes.`)
    return
  }
  console.log(`[${new Date().toLocaleTimeString("es-ES")}] ${appts.length} recordatorio(s)${simulated ? " (modo simulado)" : ""}:`)
  for (const a of appts) await sendOne(a)
}

console.log("🔔 Worker de recordatorios WhatsApp iniciado.")
console.log(`   Modo: ${simulated ? "SIMULADO (sin credenciales)" : "REAL (WhatsApp Cloud API)"}`)
console.log("   Frecuencia: cada 5 minutos. Ejecutando una pasada inicial…")

processDueAppointmentReminders().catch(console.error)

cron.schedule("*/5 * * * *", () => {
  processDueAppointmentReminders().catch(console.error)
})

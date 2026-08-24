import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"

/**
 * Esta ruta es pública: Meta la llama sin cookie de sesión, así que el proxy la
 * deja pasar. Su autenticación es la firma HMAC del cuerpo, no la sesión.
 *
 * Sin ella, cualquiera podría enviar eventos falsos y confirmar o CANCELAR las
 * citas de cualquier clienta. Si WHATSAPP_APP_SECRET no está configurada se
 * rechaza todo: mejor un webhook inactivo que uno abierto.
 */
function firmaValida(cuerpoCrudo: string, cabecera: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) return false
  if (!cabecera?.startsWith("sha256=")) return false

  const esperada = crypto.createHmac("sha256", appSecret).update(cuerpoCrudo, "utf8").digest("hex")
  const recibida = cabecera.slice("sha256=".length)
  const a = Buffer.from(esperada, "hex")
  const b = Buffer.from(recibida, "hex")
  // Comparación en tiempo constante: un === filtraría la firma byte a byte.
  if (a.length !== b.length || a.length === 0) return false
  return crypto.timingSafeEqual(a, b)
}

// GET: verificación inicial de Meta.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 })
  }
  return new NextResponse("Forbidden", { status: 403 })
}

// POST: recepción de eventos (estados de mensaje y respuestas entrantes).
export async function POST(req: NextRequest) {
  try {
    // Hay que leer el cuerpo en crudo: la firma se calcula sobre los bytes
    // exactos, y JSON.parse + re-serializar no los reproduce.
    const cuerpoCrudo = await req.text()
    if (!firmaValida(cuerpoCrudo, req.headers.get("x-hub-signature-256"))) {
      console.warn("[webhook] firma inválida o WHATSAPP_APP_SECRET sin configurar")
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = JSON.parse(cuerpoCrudo)
    const clinicId = await getActiveClinicId().catch(() => null)
    if (!clinicId) return NextResponse.json({ ok: true })

    const entries = body?.entry ?? []
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {}

        // 1) Estados de mensajes salientes (delivered/read/...)
        for (const status of value?.statuses ?? []) {
          await applyStatusUpdate(status)
        }

        // 2) Mensajes entrantes (respuestas del cliente)
        for (const msg of value?.messages ?? []) {
          await handleInboundMessage(clinicId, msg, value)
        }
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[webhook] error", err)
    return NextResponse.json({ ok: false }, { status: 200 }) // 200 para evitar reintentos agresivos
  }
}

async function applyStatusUpdate(status: { id?: string; status?: string }) {
  if (!status.id || !status.status) return
  const map: Record<string, string> = {
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
  }
  const mapped = map[status.status]
  if (!mapped) return

  const message = await prisma.whatsappMessage.findFirst({ where: { providerMessageId: status.id } })
  if (!message) return

  await prisma.whatsappMessage.update({ where: { id: message.id }, data: { status: mapped } })
  if (message.appointmentId && (mapped === "DELIVERED" || mapped === "READ")) {
    await prisma.appointment.update({
      where: { id: message.appointmentId },
      data: { reminderStatus: mapped },
    })
  }
}

async function handleInboundMessage(
  clinicId: string,
  msg: { from?: string; text?: { body?: string }; button?: { text?: string } },
  value: { contacts?: Array<{ wa_id?: string }> },
) {
  const from = msg.from ?? value?.contacts?.[0]?.wa_id
  const text = (msg.text?.body || msg.button?.text || "").trim().toUpperCase()

  const customer = from
    ? await prisma.customer.findFirst({
        where: { clinicId, phone: { contains: from.replace(/^\+/, "").slice(-9) } },
      })
    : null

  await prisma.whatsappMessage.create({
    data: {
      clinicId,
      customerId: customer?.id,
      direction: "INBOUND",
      fromPhone: from ? `+${from}` : null,
      status: "RECEIVED",
      payloadJson: JSON.stringify(msg),
      receivedAt: new Date(),
    },
  })

  if (!customer) return

  // Última cita futura del cliente para aplicar la confirmación/cancelación.
  const appt = await prisma.appointment.findFirst({
    where: { customerId: customer.id, startAt: { gte: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
    orderBy: { startAt: "asc" },
  })
  if (!appt) return

  if (text.includes("CONFIRMAR")) {
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: "CONFIRMED" } })
  } else if (text.includes("CANCELAR")) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Cancelada por el cliente vía WhatsApp" },
    })
  }
}

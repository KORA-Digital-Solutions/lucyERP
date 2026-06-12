import { NextRequest, NextResponse } from "next/server"
import { sendReminderForAppointmentId } from "@/lib/whatsapp"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params
  try {
    const result = await sendReminderForAppointmentId(appointmentId)
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 400 },
    )
  }
}

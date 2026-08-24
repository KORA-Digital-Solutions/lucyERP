import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, authErrorResponse } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    await requireSession()
    const appointmentId = req.nextUrl.searchParams.get("appointmentId")
    const messages = await prisma.whatsappMessage.findMany({
      where: appointmentId ? { appointmentId } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    return NextResponse.json(messages)
  } catch (e) {
    return authErrorResponse(e)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  const appointmentId = req.nextUrl.searchParams.get("appointmentId")
  const messages = await prisma.whatsappMessage.findMany({
    where: appointmentId ? { appointmentId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return NextResponse.json(messages)
}

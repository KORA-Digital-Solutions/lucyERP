import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { requireAdmin, authErrorResponse } from "@/lib/auth"

export async function GET() {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()
    const services = await prisma.service.findMany({ where: { clinicId }, orderBy: { name: "asc" } })
    return NextResponse.json(services)
  } catch (e) {
    return authErrorResponse(e)
  }
}

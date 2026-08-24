import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { requireAdmin, authErrorResponse } from "@/lib/auth"

export async function GET() {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()
    const cabins = await prisma.cabin.findMany({ where: { clinicId }, orderBy: { sortOrder: "asc" } })
    return NextResponse.json(cabins)
  } catch (e) {
    return authErrorResponse(e)
  }
}

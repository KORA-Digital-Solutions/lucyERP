import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"

export async function GET() {
  const clinicId = await getActiveClinicId()
  const workers = await prisma.user.findMany({ where: { clinicId }, orderBy: { name: "asc" } })
  return NextResponse.json(workers)
}

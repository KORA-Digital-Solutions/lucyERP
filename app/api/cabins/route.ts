import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"

export async function GET() {
  const clinicId = await getActiveClinicId()
  const cabins = await prisma.cabin.findMany({ where: { clinicId }, orderBy: { sortOrder: "asc" } })
  return NextResponse.json(cabins)
}

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"
import { requireAdmin, authErrorResponse } from "@/lib/auth"

export async function GET() {
  try {
    await requireAdmin()
    const clinicId = await getActiveClinicId()
    // select explícito: sin él, Prisma devuelve todos los campos escalares del
    // modelo, incluido passwordHash. Nunca ampliar esta lista a la ligera.
    const workers = await prisma.user.findMany({
      where: { clinicId },
      select: {
        id: true,
        clinicId: true,
        name: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        color: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(workers)
  } catch (e) {
    return authErrorResponse(e)
  }
}

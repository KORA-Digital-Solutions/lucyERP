import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveClinicId } from "@/lib/clinic"

// GET /api/customers?search=
export async function GET(req: NextRequest) {
  const clinicId = await getActiveClinicId()
  const search = req.nextUrl.searchParams.get("search")?.trim()
  const customers = await prisma.customer.findMany({
    where: {
      clinicId,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { firstName: "asc" },
    take: 50,
  })
  return NextResponse.json(customers)
}

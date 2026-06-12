import { prisma } from "@/lib/db"

// La POC funciona con una única clínica activa (la primera creada).
export async function getActiveClinic() {
  const clinic = await prisma.clinic.findFirst({ orderBy: { createdAt: "asc" } })
  if (!clinic) {
    throw new Error(
      "No hay clínica configurada. Ejecuta `npm run db:seed` para crear datos demo.",
    )
  }
  return clinic
}

export async function getActiveClinicId(): Promise<string> {
  return (await getActiveClinic()).id
}

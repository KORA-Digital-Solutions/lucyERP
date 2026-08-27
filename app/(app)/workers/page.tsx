import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { WorkersClient, type WorkerRow } from "@/components/workers-client"

export const dynamic = "force-dynamic"

export default async function WorkersPage() {
  const clinic = await getActiveClinic()

  // Por apellidos, que es como se lista a la gente en la ficha del cliente y
  // en el informe. Ordenar por el nombre de pila dejaba dos criterios distintos
  // para la misma persona según la pantalla. Los grupos (administración,
  // equipo, desactivadas) los arma la vista sobre este orden.
  const workers = await prisma.user.findMany({
    where: { clinicId: clinic.id },
    orderBy: [{ lastName: "asc" }, { name: "asc" }],
  })

  const rows: WorkerRow[] = workers.map((w) => ({
    id: w.id,
    name: w.name,
    lastName: w.lastName,
    email: w.email,
    phone: w.phone,
    role: w.role,
    active: w.active,
    color: w.color ?? "#3C54A4",
    mustChangePassword: w.mustChangePassword,
    // Los hashes no salen de aquí: a la pantalla solo le hace falta saber si
    // hay contraseña y si hay PIN.
    hasPassword: w.passwordHash !== null,
    hasPin: w.pinHash !== null,
    mustChangePin: w.mustChangePin,
  }))

  const domain = clinic.email?.split("@")[1] ?? "centroesteticalucia.com"
  return <WorkersClient rows={rows} domain={domain} />
}

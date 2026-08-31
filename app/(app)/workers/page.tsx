import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { WorkersClient, type WorkerRow } from "@/components/workers-client"
import type { WorkerTab } from "@/components/worker-profile-view"

export const dynamic = "force-dynamic"

// La pestaña se valida aquí y no en el componente de la ficha: aquello es
// "use client", y todo lo que exporta un módulo de cliente se convierte en una
// referencia que el servidor no puede ejecutar. El tipo sí se puede importar,
// que desaparece al compilar.
const TABS_DE_FICHA: WorkerTab[] = ["datos", "actividad", "acceso"]
function esTabDeFicha(v: string | undefined): v is WorkerTab {
  return TABS_DE_FICHA.includes(v as WorkerTab)
}

// Se puede llegar con una ficha abierta desde fuera: Informes enlaza aquí con
// ?ficha=<id>&tab=actividad para saltar de la fila de facturación al detalle
// de lo que ha hecho esa persona.
export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ ficha?: string; tab?: string }>
}) {
  const { ficha, tab } = await searchParams
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
  return (
    <WorkersClient
      rows={rows}
      domain={domain}
      // Un id que ya no exista no rompe nada: la vista no encuentra la fila y
      // se queda en el listado.
      fichaInicial={ficha ?? null}
      tabInicial={esTabDeFicha(tab) ? tab : "datos"}
    />
  )
}

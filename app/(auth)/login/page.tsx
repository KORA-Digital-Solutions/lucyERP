import { prisma } from "@/lib/db"
import { PinLoginForm } from "@/components/pin-login-form"

/**
 * Pantalla de acceso del mostrador.
 *
 * Es de servidor solo para leer el nombre y el eslogan del centro, que se
 * editan en Configuración. No hay sesión todavía, así que no se consulta nada
 * más que eso.
 */
export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const clinic = await prisma.clinic.findFirst({ select: { name: true, slogan: true } })

  return (
    <PinLoginForm
      clinicName={clinic?.name ?? "Centro de Estética"}
      slogan={clinic?.slogan ?? null}
    />
  )
}

import { prisma } from "@/lib/db"
import { AuthShell } from "@/components/auth-shell"
import { AdminLoginForm } from "@/components/admin-login-form"

/** Solo de servidor para leer el nombre y el eslogan del centro. */
export const dynamic = "force-dynamic"

export default async function AdminLoginPage() {
  const clinic = await prisma.clinic.findFirst({ select: { name: true, slogan: true } })

  return (
    <AuthShell clinicName={clinic?.name ?? "Centro de Estética"} slogan={clinic?.slogan ?? null}>
      <AdminLoginForm />
    </AuthShell>
  )
}

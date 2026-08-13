import React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  // La sesión es un JWT de 8 h: sigue siendo válida aunque el usuario ya no
  // exista en la BD (p. ej. tras volver a sembrar la base en desarrollo). Si
  // no se comprueba, cualquier registro que guarde userId falla con un error
  // de clave foránea imposible de entender. Mejor obligar a iniciar sesión.
  const user = await prisma.user.findFirst({
    where: { id: session.userId, active: true },
    select: { id: true },
  })
  if (!user) redirect("/login")

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar name={session.name} lastName={session.lastName} role={session.role} originalRole={session.originalRole} />
      <main className="pl-64">
        <div className="min-h-screen">{children}</div>
      </main>
    </div>
  )
}

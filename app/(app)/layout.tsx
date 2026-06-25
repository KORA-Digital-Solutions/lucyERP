import React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar name={session.name} lastName={session.lastName} role={session.role} originalRole={session.originalRole} />
      <main className="pl-64">
        <div className="min-h-screen">{children}</div>
      </main>
    </div>
  )
}

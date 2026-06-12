"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  Calendar,
  Users,
  Briefcase,
  UserCog,
  DoorOpen,
  Settings,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { LuciaMark } from "@/components/lucia-logo"

const navItems = [
  { icon: LayoutGrid, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Agenda", href: "/agenda" },
  { icon: Users, label: "Clientes", href: "/clients" },
  { icon: Briefcase, label: "Servicios", href: "/services" },
  { icon: UserCog, label: "Trabajadores", href: "/workers" },
  { icon: DoorOpen, label: "Cabinas", href: "/cabins" },
  { icon: Settings, label: "Configuración", href: "/settings" },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-sm">
          <LuciaMark className="h-full w-auto" tone="color" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold">Lucía</div>
          <div className="text-[11px] uppercase tracking-wide text-sidebar-muted">
            Centro de Estética
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium">
            MG
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">María García</p>
            <p className="truncate text-xs text-sidebar-muted">Administrador</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

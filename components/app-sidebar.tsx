"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutGrid,
  Calendar,
  Users,
  Briefcase,
  UserCog,
  DoorOpen,
  Settings,
  LogOut,
  Package,
  ShoppingCart,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { LuciaMark } from "@/components/lucia-logo"

const ALL_NAV = [
  { icon: LayoutGrid,   label: "Dashboard",     href: "/dashboard",     roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Calendar,     label: "Agenda",        href: "/agenda",        roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Users,        label: "Clientes",      href: "/clients",       roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: ShoppingCart, label: "Ventas",        href: "/sales",         roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Wallet,       label: "Caja",          href: "/cash-register", roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Package,      label: "Stock",         href: "/stock",         roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Briefcase,    label: "Servicios",     href: "/services",      roles: ["ADMIN"],           group: "main" },
  { icon: DoorOpen,     label: "Cabinas",       href: "/cabins",        roles: ["ADMIN"],           group: "main" },
  { icon: UserCog,      label: "Usuarios",      href: "/workers",       roles: ["ADMIN"],           group: "admin" },
  { icon: Settings,     label: "Configuración", href: "/settings",      roles: ["ADMIN"],           group: "admin" },
]

interface Props {
  name: string
  lastName: string | null
  role: string
}

export function AppSidebar({ name, lastName, role }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const navItems = ALL_NAV.filter((item) => item.roles.includes(role))
  const fullName = lastName ? `${name} ${lastName}` : name
  const initials = [name[0], lastName?.[0]].filter(Boolean).join("").toUpperCase()
  const roleLabel = role === "ADMIN" ? "Administrador" : "Trabajador"

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

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

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.filter(i => i.group === "main").map((item) => {
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
        </div>

        {navItems.some(i => i.group === "admin") && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <div className="space-y-1">
              {navItems.filter(i => i.group === "admin").map((item) => {
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
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{fullName}</p>
            <p className="truncate text-xs text-sidebar-muted">{roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
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

"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutGrid,
  Calendar,
  ClipboardList,
  Users,
  Briefcase,
  UserCog,
  DoorOpen,
  Settings,
  LogOut,
  Package,
  ShoppingCart,
  Wallet,
  ShieldCheck,
  ShieldOff,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { LuciaMark } from "@/components/lucia-logo"
import { SwitchModeModal } from "@/components/switch-mode-modal"

const ALL_NAV = [
  { icon: LayoutGrid,   label: "Dashboard",     href: "/dashboard",     roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Calendar,      label: "Agenda",           href: "/agenda",        roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Users,         label: "Clientes",         href: "/clients",       roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: ShoppingCart, label: "Ventas",        href: "/sales",         roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Wallet,       label: "Caja",          href: "/cash-register", roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Package,      label: "Stock",         href: "/stock",         roles: ["ADMIN", "WORKER"], group: "main" },
  { icon: Briefcase,    label: "Servicios",     href: "/services",      roles: ["ADMIN"],           group: "main" },
  { icon: DoorOpen,     label: "Cabinas",       href: "/cabins",        roles: ["ADMIN"],           group: "main" },
  { icon: ClipboardList, label: "Historial citas", href: "/appointments", roles: ["ADMIN"],          group: "history" },
  { icon: UserCog,      label: "Usuarios",      href: "/workers",       roles: ["ADMIN"],           group: "admin" },
  { icon: Settings,     label: "Configuración", href: "/settings",      roles: ["ADMIN"],           group: "admin" },
]

interface Props {
  name: string
  lastName: string | null
  role: string
  originalRole?: string
}

export function AppSidebar({ name, lastName, role, originalRole }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [modalOpen, setModalOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const navItems = ALL_NAV.filter((item) => item.roles.includes(role))
  const fullName = lastName ? `${name} ${lastName}` : name
  const initials = [name[0], lastName?.[0]].filter(Boolean).join("").toUpperCase()
  const roleLabel = role === "ADMIN" ? "Administrador" : "Trabajador"

  // Mostrar toggle solo si es admin real (rol actual admin) o admin en modo trabajador
  const isAdminReal = role === "ADMIN"
  const isAdminInWorkerMode = role === "WORKER" && originalRole === "ADMIN"
  const showModeToggle = isAdminReal || isAdminInWorkerMode

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  async function handleSwitchToWorker() {
    setSwitching(true)
    try {
      await fetch("/api/auth/switch-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "WORKER" }),
      })
      router.push("/agenda")
      router.refresh()
    } finally {
      setSwitching(false)
    }
  }

  function handleModalSuccess() {
    setModalOpen(false)
    router.push("/dashboard")
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

        {navItems.some(i => i.group === "history") && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <div className="space-y-1">
              {navItems.filter(i => i.group === "history").map((item) => {
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

      {showModeToggle && (
        <div className="px-3 pb-2">
          {isAdminReal ? (
            <button
              type="button"
              onClick={handleSwitchToWorker}
              disabled={switching}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors disabled:opacity-50"
            >
              <ShieldOff className="h-4 w-4 shrink-0" />
              Cambiar a modo Trabajador
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Cambiar a modo Administrador
            </button>
          )}
        </div>
      )}

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

      <SwitchModeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </aside>
  )
}

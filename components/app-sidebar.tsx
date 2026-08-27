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
  Clock,
  BarChart3,
  Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { LuciaMark } from "@/components/lucia-logo"
import type { SessionMode } from "@/lib/session"

/**
 * Dos modos, dos menús.
 *
 * En el MOSTRADOR solo está el día a día. Las pantallas de gestión no salen
 * atenuadas ni piden nada: sencillamente no existen, porque para llegar a
 * ellas hay que salir y entrar por la otra puerta.
 *
 * En la GESTIÓN DEL CENTRO está todo, pero el día a día va marcado como
 * consulta: se ve para revisar, y para tocarlo hay que bajar al mostrador. Lo
 * que aquí es una etiqueta, en el servidor es requireCounter() (ver
 * lib/auth.ts): esconder el botón no sería garantía de nada.
 */

/** El día a día. Se trabaja desde el mostrador y se consulta desde la gestión. */
const NAV_DIA_A_DIA = [
  { icon: LayoutGrid,   label: "Dashboard", href: "/dashboard" },
  { icon: Calendar,     label: "Agenda",    href: "/agenda" },
  { icon: Users,        label: "Clientes",  href: "/clients" },
  { icon: ShoppingCart, label: "Ventas",    href: "/sales" },
  { icon: Wallet,       label: "Caja",      href: "/cash-register" },
  { icon: Package,      label: "Stock",     href: "/stock" },
]

/** Lo que solo se ve desde la gestión del centro. */
const NAV_GESTION = [
  { icon: BarChart3,     label: "Informes",        href: "/reports" },
  { icon: ClipboardList, label: "Historial citas", href: "/appointments" },
  { icon: Briefcase,     label: "Servicios",       href: "/services" },
  { icon: DoorOpen,      label: "Cabinas",         href: "/cabins" },
  { icon: UserCog,       label: "Usuarios",        href: "/workers" },
  { icon: Clock,         label: "Horarios",        href: "/horarios" },
  { icon: Settings,      label: "Configuración",   href: "/settings" },
]

interface Props {
  name: string
  lastName: string | null
  mode: SessionMode
  /** El del centro, tal y como esté puesto en Configuración. */
  clinicName: string
}

export function AppSidebar({ name, lastName, mode, clinicName }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const esGestion = mode === "MANAGEMENT"
  const fullName = lastName ? `${name} ${lastName}` : name
  const initials = [name[0], lastName?.[0]].filter(Boolean).join("").toUpperCase()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  function NavLink({ item }: { item: { icon: typeof LayoutGrid; label: string; href: string } }) {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        )}
      >
        <item.icon className="h-5 w-5" />
        {item.label}
      </Link>
    )
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-sm">
          <LuciaMark className="h-full w-auto" tone="color" />
        </div>
        {/* El nombre sale de Configuración; debajo, en qué modo estás, que es
            lo que de verdad cambia lo que se puede hacer en esta pantalla. */}
        <div className="min-w-0 leading-tight">
          {/* En dos líneas y no cortado: recortar "Centro de Estética Lucía"
              se come justo la parte que distingue al centro. */}
          <div className="line-clamp-2 text-sm font-bold leading-snug">{clinicName}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-sidebar-muted">
            {esGestion ? "Gestión del centro" : "Mostrador"}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {esGestion && (
          <>
            <div className="space-y-1">
              {NAV_GESTION.map((item) => <NavLink key={item.href} item={item} />)}
            </div>
            <div className="my-3 border-t border-sidebar-border" />
            <p className="flex items-center gap-1.5 px-3 pb-1 text-[11px] uppercase tracking-wide text-sidebar-muted">
              <Eye className="h-3 w-3" /> Solo consulta
            </p>
          </>
        )}

        <div className="space-y-1">
          {NAV_DIA_A_DIA.map((item) => <NavLink key={item.href} item={item} />)}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-4">
        {esGestion ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{fullName}</p>
              <p className="truncate text-xs text-sidebar-muted">Administradora</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          // El mostrador no es de nadie, así que aquí no va un nombre: quien
          // hace cada cosa se identifica con su PIN en el momento. Poner el
          // nombre de quien lo abrió es justo la idea equivocada.
          //
          // Y el botón es solo la flecha, no la fila entera: con toda la fila
          // pulsable, un clic de más en la esquina cierra el mostrador.
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">Mostrador abierto</span>
              <span className="block truncate text-xs text-sidebar-muted">Cerrar y volver al PIN</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Cerrar el mostrador"
              title="Cerrar el mostrador"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

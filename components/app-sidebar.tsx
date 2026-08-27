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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { LuciaMark } from "@/components/lucia-logo"
import type { SessionMode } from "@/lib/session"

/**
 * Dos modos, dos menús, y ninguno enseña el del otro.
 *
 * En el MOSTRADOR solo está el día a día. Las pantallas de gestión no salen
 * atenuadas ni piden nada: sencillamente no existen, porque para llegar a
 * ellas hay que salir y entrar por la otra puerta.
 *
 * En la GESTIÓN DEL CENTRO está lo que se administra, y nada más. El día a
 * día llegó a salir aquí en un bloque "solo consulta", y era repetir seis
 * pantallas para no poder hacer nada en ellas: quien gestiona no entra a mirar
 * la agenda, y para tocarla hay que bajar al mostrador de todas formas.
 *
 * Quitarlas del menú no las cierra: siguen abriéndose por URL y allí avisa
 * ReadOnlyBanner. Quien manda es requireCounter() en el servidor (ver
 * lib/auth.ts); esconder un botón nunca fue garantía de nada.
 */

interface NavItem {
  icon: typeof LayoutGrid
  label: string
  href: string
}

/** El día a día: el menú del mostrador, entero. */
const NAV_DIA_A_DIA: NavItem[] = [
  { icon: LayoutGrid,   label: "Dashboard", href: "/dashboard" },
  { icon: Calendar,     label: "Agenda",    href: "/agenda" },
  { icon: Users,        label: "Clientes",  href: "/clients" },
  { icon: ShoppingCart, label: "Ventas",    href: "/sales" },
  { icon: Wallet,       label: "Caja",      href: "/cash-register" },
  { icon: Package,      label: "Stock",     href: "/stock" },
]

/**
 * Lo que solo se ve desde la gestión del centro, por bloques.
 *
 * Antes iban los siete seguidos y había que leer la lista entera para dar con
 * lo que buscabas: "Informes" y "Configuración" no se parecen en nada, pero
 * estaban a la misma distancia. Por bloques se recorre como se piensa el
 * centro: cómo ha ido, quién trabaja y cómo está montado.
 */
const GRUPOS_GESTION: { titulo: string; items: NavItem[] }[] = [
  {
    titulo: "Análisis",
    items: [
      { icon: BarChart3,     label: "Informes",        href: "/reports" },
      { icon: ClipboardList, label: "Historial citas", href: "/appointments" },
    ],
  },
  {
    titulo: "Equipo",
    items: [
      { icon: UserCog, label: "Usuarios", href: "/workers" },
      { icon: Clock,   label: "Horarios", href: "/horarios" },
    ],
  },
  {
    titulo: "El centro",
    items: [
      { icon: Briefcase, label: "Servicios",     href: "/services" },
      { icon: Package,   label: "Productos",     href: "/products" },
      { icon: DoorOpen,  label: "Cabinas",       href: "/cabins" },
      { icon: Settings,  label: "Configuración", href: "/settings" },
    ],
  },
]

interface Props {
  name: string
  lastName: string | null
  mode: SessionMode
  /** El del centro, tal y como esté puesto en Configuración. */
  clinicName: string
}

/** Cabecera de bloque: orienta, no se pulsa. */
function GroupTitle({ label }: { label: string }) {
  return (
    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
      {label}
    </p>
  )
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

  function NavLink({ item }: { item: NavItem }) {
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
        {esGestion ? (
          GRUPOS_GESTION.map((grupo, i) => (
            <div key={grupo.titulo} className={cn("space-y-1", i > 0 && "mt-4")}>
              <GroupTitle label={grupo.titulo} />
              {grupo.items.map((item) => <NavLink key={item.href} item={item} />)}
            </div>
          ))
        ) : (
          <div className="space-y-1">
            {NAV_DIA_A_DIA.map((item) => <NavLink key={item.href} item={item} />)}
          </div>
        )}
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

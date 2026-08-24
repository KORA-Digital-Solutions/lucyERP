import { NextRequest, NextResponse } from "next/server"
import { verifySession, getSessionFromRequest } from "@/lib/session"

/**
 * Primera barrera: redirige al login y corta rutas de página por rol.
 *
 * NO es la única barrera. Una server action es un POST a la ruta de la página
 * donde estás, así que aquí solo se ve esa ruta y no la acción invocada. La
 * autorización real vive en cada handler, vía lib/auth.ts. Esto es UX (llevar
 * al login en vez de reventar) y defensa en profundidad.
 */

// El webhook lo llama Meta sin cookie: si pide sesión, nunca funcionaría.
// Su autenticación es la firma x-hub-signature-256, que valida el propio handler.
const PUBLIC = ["/login", "/api/auth", "/api/webhooks/"]

// Rutas de página solo para admin. Deben coincidir con ALL_NAV en
// components/app-sidebar.tsx: si el menú lo oculta, esto lo bloquea.
const ADMIN_ONLY_PAGES = ["/workers", "/services", "/cabins", "/settings", "/horarios", "/appointments", "/reports"]

// Rutas API solo para admin. Se listan aparte porque "/api/workers" no empieza
// por "/workers": sin esta lista quedaban abiertas a cualquier sesión.
const ADMIN_ONLY_API = ["/api/workers", "/api/services", "/api/cabins"]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const token = getSessionFromRequest(req)
  const session = token ? await verifySession(token) : null

  const isApi = pathname.startsWith("/api/")

  if (!session) {
    // Las rutas API responden 401; redirigir a una página HTML confundiría a
    // cualquier cliente que espere JSON.
    if (isApi) return NextResponse.json({ error: "No autenticado." }, { status: 401 })
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (session.role !== "ADMIN") {
    if (ADMIN_ONLY_API.some((p) => pathname.startsWith(p))) {
      return NextResponse.json({ error: "Sin permisos." }, { status: 403 })
    }
    if (ADMIN_ONLY_PAGES.some((p) => pathname.startsWith(p))) {
      const url = req.nextUrl.clone()
      url.pathname = "/agenda"
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

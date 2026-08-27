import { NextRequest, NextResponse } from "next/server"
import {
  verifySession, getSessionFromRequest, createSession,
  sessionMaxAgeReached, sessionNeedsRefresh,
  SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS,
  type VerifiedSession,
} from "@/lib/session"

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

// Páginas de la gestión del centro. Desde el mostrador no existen: se entra
// con contraseña de administradora por la otra puerta. Deben coincidir con
// ALL_NAV en components/app-sidebar.tsx: si el menú lo oculta, esto lo bloquea.
const MANAGEMENT_ONLY_PAGES = ["/workers", "/services", "/cabins", "/settings", "/horarios", "/appointments", "/reports"]

// Rutas API de la gestión. Se listan aparte porque "/api/workers" no empieza
// por "/workers": sin esta lista quedaban abiertas a cualquier sesión.
const MANAGEMENT_ONLY_API = ["/api/workers", "/api/services", "/api/cabins"]

/**
 * Renueva la cookie de sesión sobre la respuesta que ya se va a devolver.
 *
 * Aquí no vale setSessionCookie(): next/headers no está disponible en el
 * proxy, así que la cookie se escribe en la respuesta. Es lo que hace que la
 * sesión sea deslizante — ver lib/session.ts.
 */
async function conSesionRenovada<T extends NextResponse>(res: T, session: VerifiedSession): Promise<T> {
  if (!sessionNeedsRefresh(session)) return res
  res.cookies.set(SESSION_COOKIE_NAME, await createSession(session), SESSION_COOKIE_OPTIONS)
  return res
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const token = getSessionFromRequest(req)
  const verified = token ? await verifySession(token) : null
  // Se descarta la sesión si ha llegado al tope, por mucho que se siga usando,
  // y también si no trae modo: son tokens de antes de separar el mostrador de
  // la gestión, y no se puede adivinar por cuál de las dos puertas entraron.
  const session = verified && verified.mode && !sessionMaxAgeReached(verified) ? verified : null

  const isApi = pathname.startsWith("/api/")

  if (!session) {
    // Las rutas API responden 401; redirigir a una página HTML confundiría a
    // cualquier cliente que espere JSON.
    if (isApi) return NextResponse.json({ error: "No autenticado." }, { status: 401 })
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    const res = NextResponse.redirect(url)
    // La cookie caducada o agotada se borra: si se queda, el navegador la
    // sigue mandando y el login arrastra una sesión muerta.
    if (token) res.cookies.delete(SESSION_COOKIE_NAME)
    return res
  }

  if (session.mode !== "MANAGEMENT") {
    if (MANAGEMENT_ONLY_API.some((p) => pathname.startsWith(p))) {
      return NextResponse.json({ error: "Sin permisos." }, { status: 403 })
    }
    if (MANAGEMENT_ONLY_PAGES.some((p) => pathname.startsWith(p))) {
      const url = req.nextUrl.clone()
      // A la portada del mostrador, que es donde se aterriza al entrar.
      url.pathname = "/dashboard"
      return conSesionRenovada(NextResponse.redirect(url), session)
    }
  }

  return conSesionRenovada(NextResponse.next(), session)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

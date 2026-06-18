import { NextRequest, NextResponse } from "next/server"
import { verifySession, getSessionFromRequest } from "@/lib/session"

const PUBLIC = ["/login", "/api/auth"]
const ADMIN_ONLY = ["/workers", "/services", "/cabins", "/settings"]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const token = getSessionFromRequest(req)
  const session = token ? await verifySession(token) : null

  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (session.role !== "ADMIN" && ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone()
    url.pathname = "/agenda"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

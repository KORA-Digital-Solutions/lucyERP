import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { getSession, createSession, setSessionCookie } from "@/lib/session"

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 })
    }

    const { mode, password } = await req.json()

    if (mode !== "ADMIN" && mode !== "WORKER") {
      return NextResponse.json({ error: "Modo inválido." }, { status: 400 })
    }

    // Bajar a modo trabajador: solo requiere ser admin original
    if (mode === "WORKER") {
      const originalRole = session.originalRole ?? session.role
      if (originalRole !== "ADMIN") {
        return NextResponse.json({ error: "Sin permisos." }, { status: 403 })
      }

      const token = await createSession({
        ...session,
        role: "WORKER",
        originalRole: "ADMIN",
      })
      await setSessionCookie(token)
      return NextResponse.json({ ok: true, role: "WORKER" })
    }

    // Subir a modo admin: siempre requiere contraseña
    if (mode === "ADMIN") {
      if (session.originalRole !== "ADMIN") {
        return NextResponse.json({ error: "Sin permisos." }, { status: 403 })
      }

      if (!password) {
        return NextResponse.json({ error: "Contraseña requerida." }, { status: 400 })
      }

      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { passwordHash: true, active: true },
      })

      if (!user?.active || !user.passwordHash) {
        return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 })
      }

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) {
        return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 })
      }

      const token = await createSession({
        ...session,
        role: "ADMIN",
        originalRole: undefined,
      })
      await setSessionCookie(token)
      return NextResponse.json({ ok: true, role: "ADMIN" })
    }
  } catch (err) {
    console.error("[switch-mode]", err)
    return NextResponse.json({ error: "Error interno." }, { status: 500 })
  }
}

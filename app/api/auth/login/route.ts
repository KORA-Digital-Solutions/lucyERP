import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { createSession, setSessionCookie } from "@/lib/session"

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña requeridos." }, { status: 400 })
    }

    const input = email.toLowerCase().trim()
    let resolvedEmail = input
    if (!input.includes("@")) {
      const clinic = await prisma.clinic.findFirst({ select: { email: true } })
      const domain = clinic?.email?.split("@")[1] ?? "centroesteticalucia.com"
      resolvedEmail = `${input}@${domain}`
    }

    const user = await prisma.user.findFirst({
      where: { email: resolvedEmail, active: true },
      include: { clinic: true },
    })

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 })
    }

    const token = await createSession({
      userId: user.id,
      email: user.email!,
      name: user.name,
      lastName: user.lastName,
      role: user.role,
      clinicId: user.clinicId,
      mustChangePassword: user.mustChangePassword,
    })

    await setSessionCookie(token)

    return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword })
  } catch (err) {
    console.error("[login]", err)
    return NextResponse.json({ error: "Error interno." }, { status: 500 })
  }
}

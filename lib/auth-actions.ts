"use server"

import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { AuthError, requireSession } from "@/lib/auth"
import { createSession, setSessionCookie } from "@/lib/session"

/**
 * Acciones del formulario de acceso.
 *
 * Viven aquí y no en lib/actions.ts porque loginAction es la única acción
 * pública de la aplicación: es la que crea la sesión, así que no puede exigirla.
 *
 * Son server actions de formulario (`<form action={...}>`) a propósito. Con un
 * `onSubmit` que hace fetch, el formulario sigue siendo un <form> sin `method`,
 * y un <form> sin method es GET: si el navegador lo envía antes de que React
 * hidrate la página, el usuario y la contraseña acaban en la barra de
 * direcciones, en el historial y en los logs del servidor. React renderiza las
 * server actions con method="post" y encola los envíos previos a la
 * hidratación, así que ese camino deja de existir.
 */

export type EstadoFormulario = { error?: string }

/**
 * Coste de comparación cuando el usuario no existe. Sin esto, "no existe"
 * responde al instante y "contraseña incorrecta" tarda ~200 ms, y esa
 * diferencia permite averiguar qué cuentas hay dadas de alta.
 */
const HASH_SEÑUELO = "$2b$12$hT9alJYlj8bbMgXK/HyWLe9Y54Wo2ZlV5QniC.eWxhnR0z2Hr0I5S"

/** El mismo mensaje para usuario inexistente y contraseña mala, por lo mismo. */
const CREDENCIALES_MAL = "Credenciales incorrectas."

export async function loginAction(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = formData.get("email")
  const password = formData.get("password")

  if (typeof usuario !== "string" || typeof password !== "string" || !usuario.trim() || !password) {
    return { error: "Usuario y contraseña requeridos." }
  }

  let destino: string
  try {
    // Se permite escribir solo el usuario: se completa con el dominio de la
    // clínica para no tener que teclear el correo entero cada mañana.
    const entrada = usuario.toLowerCase().trim()
    let email = entrada
    if (!entrada.includes("@")) {
      const clinic = await prisma.clinic.findFirst({ select: { email: true } })
      const dominio = clinic?.email?.split("@")[1] ?? "centroesteticalucia.com"
      email = `${entrada}@${dominio}`
    }

    const user = await prisma.user.findFirst({ where: { email, active: true } })

    if (!user?.passwordHash) {
      await bcrypt.compare(password, HASH_SEÑUELO)
      return { error: CREDENCIALES_MAL }
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return { error: CREDENCIALES_MAL }
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

    destino = user.mustChangePassword ? "/change-password" : "/dashboard"
  } catch (e) {
    // Los detalles van al log del servidor, no al navegador.
    console.error("[login]", e)
    return { error: "Error interno. Vuelve a intentarlo." }
  }

  // redirect() lanza una excepción de control: tiene que quedar fuera del try.
  redirect(destino)
}

export async function changePasswordAction(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const nueva = formData.get("newPassword")
  const repetida = formData.get("confirmPassword")

  if (typeof nueva !== "string" || typeof repetida !== "string") {
    return { error: "Rellena los dos campos." }
  }
  if (nueva !== repetida) {
    return { error: "Las contraseñas no coinciden." }
  }
  if (nueva.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." }
  }

  let destino: string
  try {
    // De quién es la contraseña lo decide la sesión, nunca el formulario.
    const session = await requireSession()
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await bcrypt.hash(nueva, 12), mustChangePassword: false },
    })
    // La cookie lleva mustChangePassword dentro: sin reemitirla, el usuario
    // vuelve a /change-password en cada navegación.
    await setSessionCookie(await createSession({ ...session, mustChangePassword: false }))
    destino = session.role === "ADMIN" ? "/dashboard" : "/agenda"
  } catch (e) {
    // AuthError trae un mensaje pensado para la usuaria ("tu sesión ha
    // caducado"); cualquier otra cosa se queda en el log.
    if (e instanceof AuthError) return { error: e.message }
    console.error("[change-password]", e)
    return { error: "No se ha podido cambiar la contraseña." }
  }

  redirect(destino)
}

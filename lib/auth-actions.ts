"use server"

import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { AuthError, requireSession } from "@/lib/auth"
import { createSession, setSessionCookie, type SessionMode } from "@/lib/session"
import { clearOperatorCookie } from "@/lib/operator"
import {
  PIN_LENGTH, apuntarFalloDePin, bloqueoRestanteMs, esPinBienFormado, hashearPin,
  mensajeDeBloqueo, nombreCompleto, olvidarFallosDePin, usuariaDelPin,
} from "@/lib/pin"

/**
 * Acciones de acceso. Hay dos puertas, y a propósito no se parecen:
 *
 *   · El MOSTRADOR se abre tecleando un PIN. Es el día a día y no es de nadie:
 *     quien hace cada cosa se identifica con su PIN en el momento.
 *   · La GESTIÓN DEL CENTRO se abre con usuario y contraseña de administradora.
 *
 * Viven aquí y no en lib/actions.ts porque son las únicas acciones públicas de
 * la aplicación: son las que crean la sesión, así que no pueden exigirla.
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

/**
 * Dónde aterriza cada puerta.
 *
 * El mostrador abre en su portada, el dashboard. La gestión no: el dashboard
 * es del día a día y ni siquiera sale en su menú (ver components/app-sidebar
 * .tsx), así que dejarla ahí era darle de bienvenida la única pantalla en la
 * que no puede tocar nada. Empieza en Informes, que es a lo que entra.
 */
const INICIO: Record<SessionMode, string> = {
  MANAGEMENT: "/reports",
  COUNTER: "/dashboard",
}

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

    // Solo administradoras: las trabajadoras entran por el mostrador, con PIN,
    // y no tienen contraseña que valga aquí.
    const user = await prisma.user.findFirst({ where: { email, active: true, role: "ADMIN" } })

    if (!user?.passwordHash) {
      await bcrypt.compare(password, HASH_SEÑUELO)
      return { error: CREDENCIALES_MAL }
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return { error: CREDENCIALES_MAL }
    }

    const token = await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      lastName: user.lastName,
      role: user.role,
      mode: "MANAGEMENT",
      clinicId: user.clinicId,
      mustChangePassword: user.mustChangePassword,
    })
    await setSessionCookie(token)
    // Entrar en la gestión no identifica a nadie en el mostrador: si quedaba
    // una identificación viva de antes, se tira.
    await clearOperatorCookie()

    destino = user.mustChangePassword ? "/change-password" : INICIO.MANAGEMENT
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
    destino = INICIO[session.mode]
  } catch (e) {
    // AuthError trae un mensaje pensado para la usuaria ("tu sesión ha
    // caducado"); cualquier otra cosa se queda en el log.
    if (e instanceof AuthError) return { error: e.message }
    console.error("[change-password]", e)
    return { error: "No se ha podido cambiar la contraseña." }
  }

  redirect(destino)
}

/* ----------------------------- MOSTRADOR --------------------------------- */

const PIN_MAL = "PIN no reconocido."

/**
 * Abre el mostrador. El PIN no viene acompañado de un nombre: se teclean los
 * dígitos y el sistema deduce quién es, y por eso setUserPin no deja repetirlo.
 */
export async function loginWithPinAction(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const pin = formData.get("pin")

  // Un PIN incompleto se trata como uno que no es de nadie: la pantalla envía
  // sola al último dígito, así que llegar aquí a medias solo pasa si alguien
  // trastea, y a ese no hay que explicarle el formato.
  if (typeof pin !== "string" || !esPinBienFormado(pin)) {
    return { error: PIN_MAL }
  }

  const espera = bloqueoRestanteMs()
  if (espera > 0) return { error: mensajeDeBloqueo(espera) }

  let destino: string
  try {
    const user = await usuariaDelPin(pin)
    if (!user) {
      apuntarFalloDePin()
      return { error: PIN_MAL }
    }
    olvidarFallosDePin()

    const token = await createSession({
      userId: user.id,
      email: null,
      name: user.name,
      lastName: user.lastName,
      // En el mostrador todo el mundo trabaja igual, también una
      // administradora: para gestionar el centro sale y entra por la otra
      // puerta, que es la que pide contraseña.
      role: "WORKER",
      mode: "COUNTER",
      clinicId: user.clinicId,
      mustChangePassword: false,
    })
    await setSessionCookie(token)

    // Abrir el mostrador NO deja a nadie identificada para cobrar. Parece un
    // detalle tonto —acaba de teclear su PIN— pero es justo el caso que hay
    // que evitar: si la siguiente en llegar cobra dentro de ese rato, cobraría
    // a nombre de quien abrió. La identificación nace al firmar una acción.
    await clearOperatorCookie()

    destino = user.mustChangePin ? "/cambiar-pin" : INICIO.COUNTER
  } catch (e) {
    console.error("[login-pin]", e)
    return { error: "Error interno. Vuelve a intentarlo." }
  }

  redirect(destino)
}

/**
 * Quién hay detrás de un PIN, para la pantalla de cambiarlo.
 *
 * El PIN es lo único que identifica a nadie en el mostrador, así que antes de
 * dejar cambiarlo hay que pedirlo: sin esto, la sesión abierta bastaba —quien
 * se sentara en la silla de otra podía cambiarle el PIN, salir sabiéndolo y
 * firmar ventas a su nombre.
 *
 * Devuelve el nombre para poder enseñarlo: quien lo teclea tiene que ver a
 * quién va a cambiarle el PIN antes de elegir uno nuevo.
 *
 * Pasa por el mismo freno de fuerza bruta que la puerta de entrada: si no,
 * esta pantalla sería una segunda puerta sin cerradura para ir probando PINes.
 */
export async function verificarPinActualAction(
  pin: string,
): Promise<{ ok: boolean; nombre?: string; error?: string }> {
  try {
    await requireSession()

    const espera = bloqueoRestanteMs()
    if (espera > 0) return { ok: false, error: mensajeDeBloqueo(espera) }

    if (!esPinBienFormado(pin)) return { ok: false, error: PIN_MAL }

    const dueña = await usuariaDelPin(pin)
    if (!dueña) {
      apuntarFalloDePin()
      return { ok: false, error: PIN_MAL }
    }
    olvidarFallosDePin()

    return { ok: true, nombre: nombreCompleto(dueña) }
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message }
    console.error("[verificar-pin]", e)
    return { ok: false, error: "Error interno. Vuelve a intentarlo." }
  }
}

/**
 * Cambiar el PIN propio: se teclea el actual y se elige otro.
 *
 * De quién es el PIN lo decide **el PIN actual**, no la sesión. En el
 * mostrador la sesión no es de nadie —la abre por la mañana quien llega
 * primero y la comparten todas—, así que mirarla habría significado dos cosas
 * malas a la vez: que cualquiera podía cambiarle el PIN a quien abrió, y que
 * las demás no podían cambiar el suyo en todo el día.
 *
 * El PIN actual se vuelve a comprobar aquí aunque la pantalla ya lo haya
 * verificado para enseñar el nombre: lo de antes es para la vista, esto es la
 * cerradura.
 */
export async function changeOwnPinAction(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const actual = formData.get("currentPin")
  const nuevo = formData.get("newPin")
  const repetido = formData.get("confirmPin")

  if (typeof actual !== "string" || typeof nuevo !== "string" || typeof repetido !== "string") {
    return { error: "Rellena los campos." }
  }
  if (nuevo !== repetido) {
    return { error: "Los dos PIN no coinciden." }
  }
  if (!esPinBienFormado(nuevo)) {
    return { error: `El PIN son ${PIN_LENGTH} dígitos.` }
  }

  try {
    await requireSession()

    const espera = bloqueoRestanteMs()
    if (espera > 0) return { error: mensajeDeBloqueo(espera) }

    if (!esPinBienFormado(actual)) return { error: PIN_MAL }
    const dueña = await usuariaDelPin(actual)
    if (!dueña) {
      apuntarFalloDePin()
      return { error: PIN_MAL }
    }
    olvidarFallosDePin()

    // Dos personas con el mismo PIN significa cobrar a nombre de quien no
    // toca: el sistema no puede distinguirlas.
    const yaEsDeOtra = await usuariaDelPin(nuevo)
    if (yaEsDeOtra && yaEsDeOtra.id !== dueña.id) {
      return { error: "Ese PIN ya está en uso. Elige otro." }
    }

    await prisma.user.update({
      where: { id: dueña.id },
      data: { pinHash: await hashearPin(nuevo), mustChangePin: false },
    })
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message }
    console.error("[cambiar-pin]", e)
    return { error: "No se ha podido guardar el PIN." }
  }

  redirect(INICIO.COUNTER)
}

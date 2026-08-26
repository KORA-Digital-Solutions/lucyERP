import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, sep } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Red de seguridad contra regresiones de autorización.
 *
 * No prueba comportamiento en ejecución: analiza el código fuente y comprueba
 * que toda server action y toda ruta API comprueban permisos por su cuenta.
 * El proxy no basta — una server action es un POST a la ruta de la página
 * donde estás, así que allí solo se ve esa ruta, no la acción invocada.
 *
 * Si añades una acción o una ruta y este test falla, no lo silencies: añade
 * requireSession() o requireAdmin() al principio del handler.
 */

const RAIZ = join(__dirname, "..", "..")

/** Acciones que gestionan usuarios, configuración o borran clientas. */
const DEBEN_SER_ADMIN = [
  "saveWorker", "deleteWorker", "setUserPassword", "toggleWorkerActive",
  "saveService", "toggleServiceActive", "saveServiceFamily", "toggleServiceFamilyActive",
  "saveCabin", "toggleCabinActive",
  "updateClinic",
  "saveClinicWeeklySchedule", "saveWorkerWeeklySchedule",
  "saveClinicScheduleOverride", "deleteClinicScheduleOverride",
  "saveWorkerScheduleOverride", "deleteWorkerScheduleOverride",
  "saveHoliday", "deleteHoliday", "copyFixedHolidaysToYear", "bulkImportHolidays",
  "saveLeaveBalance", "addWorkerLeaveRange", "deleteWorkerLeave",
  "deleteCustomer",
]

/** Rutas públicas a propósito, con su propia autenticación. */
const RUTAS_PUBLICAS = [
  "app/api/auth/logout/route.ts",    // cerrar sesión no necesita sesión válida
  "app/api/auth/switch-mode/route.ts", // valida sesión y contraseña por su cuenta
  "app/api/webhooks/whatsapp/route.ts", // Meta llama sin cookie; valida firma HMAC
]

function trocearAcciones(fuente: string) {
  const trozos: { nombre: string; cuerpo: string }[] = []
  const re = /^export async function (\w+)/gm
  const marcas: { nombre: string; idx: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(fuente))) marcas.push({ nombre: m[1], idx: m.index })
  for (let i = 0; i < marcas.length; i++) {
    const fin = i + 1 < marcas.length ? marcas[i + 1].idx : fuente.length
    trozos.push({ nombre: marcas[i].nombre, cuerpo: fuente.slice(marcas[i].idx, fin) })
  }
  return trozos
}

function buscarRutas(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) buscarRutas(p, acc)
    else if (entrada === "route.ts") acc.push(p)
  }
  return acc
}

describe("autorización — server actions", () => {
  const fuente = readFileSync(join(RAIZ, "lib", "actions.ts"), "utf8")
  const acciones = trocearAcciones(fuente)

  it("hay acciones que analizar (el troceado no se ha roto)", () => {
    expect(acciones.length).toBeGreaterThan(40)
  })

  it("ninguna server action se queda sin comprobar permisos", () => {
    const sinGuarda = acciones
      .filter((a) => !/require(Session|Admin)\(\)|getSession\(\)/.test(a.cuerpo))
      .map((a) => a.nombre)
    expect(sinGuarda).toEqual([])
  })

  it("las acciones de gestión y configuración exigen rol de administradora", () => {
    const mal = DEBEN_SER_ADMIN.filter((nombre) => {
      const a = acciones.find((x) => x.nombre === nombre)
      return !a || !/await requireAdmin\(\)/.test(a.cuerpo)
    })
    expect(mal).toEqual([])
  })
})

/**
 * Las acciones de acceso viven aparte porque loginAction es la única acción
 * pública: es la que crea la sesión, así que no puede exigirla. Cualquier otra
 * que se añada a ese fichero sí tiene que comprobar permisos.
 */
const ACCIONES_PUBLICAS = ["loginAction"]

describe("autorización — acciones de acceso", () => {
  const fuente = readFileSync(join(RAIZ, "lib", "auth-actions.ts"), "utf8")
  const acciones = trocearAcciones(fuente)

  it("hay acciones que analizar (el troceado no se ha roto)", () => {
    expect(acciones.map((a) => a.nombre)).toContain("loginAction")
  })

  it("toda acción que no sea el propio login comprueba permisos", () => {
    const sinGuarda = acciones
      .filter((a) => !ACCIONES_PUBLICAS.includes(a.nombre))
      .filter((a) => !/require(Session|Admin)\(\)/.test(a.cuerpo))
      .map((a) => a.nombre)
    expect(sinGuarda).toEqual([])
  })

  it("cambiar la contraseña usa el id de la sesión, nunca uno del formulario", () => {
    const accion = acciones.find((a) => a.nombre === "changePasswordAction")!
    expect(accion.cuerpo).toMatch(/where:\s*\{\s*id:\s*session\.userId\s*\}/)
    // formData solo debe aportar las contraseñas, no a quién se le cambian.
    expect(accion.cuerpo).not.toMatch(/formData\.get\(\s*"userId"/)
  })
})

describe("formularios de credenciales", () => {
  // Un <form> sin method es GET. Si se envía antes de que React hidrate la
  // página, usuario y contraseña acaban en la barra de direcciones, en el
  // historial y en los logs. Las server actions se renderizan con
  // method="post" y encolan esos envíos, así que el formulario tiene que ir
  // por action={...} y no por un onSubmit que hace fetch.
  const PAGINAS = [
    "app/(auth)/login/page.tsx",
    "app/(auth)/change-password/page.tsx",
  ]

  for (const pagina of PAGINAS) {
    it(`${pagina} envía por server action y no por onSubmit`, () => {
      const src = readFileSync(join(RAIZ, ...pagina.split("/")), "utf8")
      expect(src).toMatch(/<form\s+action=\{formAction\}/)
      expect(src).not.toMatch(/<form[^>]*onSubmit/)
    })
  }
})

describe("autorización — rutas API", () => {
  const rutas = buscarRutas(join(RAIZ, "app", "api"))

  it("encuentra las rutas (el recorrido no se ha roto)", () => {
    expect(rutas.length).toBeGreaterThan(5)
  })

  it("toda ruta no pública comprueba permisos", () => {
    const sinGuarda = rutas
      .map((p) => ({ rel: p.slice(RAIZ.length + 1).split(sep).join("/"), src: readFileSync(p, "utf8") }))
      .filter(({ rel }) => !RUTAS_PUBLICAS.includes(rel))
      .filter(({ src }) => !/require(Session|Admin)\(\)/.test(src))
      .map(({ rel }) => rel)
    expect(sinGuarda).toEqual([])
  })

  it("/api/workers nunca devuelve passwordHash", () => {
    const src = readFileSync(join(RAIZ, "app", "api", "workers", "route.ts"), "utf8")
    // El select explícito es la defensa: sin él Prisma devuelve todos los
    // campos escalares. Se ignoran los comentarios, que sí nombran el campo
    // justamente para advertir de esto.
    const sinComentarios = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    expect(sinComentarios).toMatch(/select:\s*\{/)
    expect(sinComentarios).not.toMatch(/passwordHash/)
  })

  it("el webhook de WhatsApp valida la firma antes de tocar datos", () => {
    const src = readFileSync(join(RAIZ, "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8")
    expect(src).toMatch(/x-hub-signature-256/)
    expect(src).toMatch(/timingSafeEqual/)
  })
})

describe("configuración", () => {
  it("SESSION_SECRET no tiene fallback silencioso en producción", () => {
    const src = readFileSync(join(RAIZ, "lib", "session.ts"), "utf8")
    // Sin el flag /s, que no compila con el target ES6 del tsconfig. No hace
    // falta: NODE_ENV y "production" van en la misma línea.
    expect(src).toMatch(/NODE_ENV[^\r\n]*production/)
    expect(src).toMatch(/throw new Error/)
  })

  it("el proxy protege también las rutas API de solo admin", () => {
    const src = readFileSync(join(RAIZ, "proxy.ts"), "utf8")
    for (const ruta of ["/api/workers", "/api/services", "/api/cabins"]) {
      expect(src).toContain(ruta)
    }
    for (const pagina of ["/horarios", "/appointments", "/reports"]) {
      expect(src).toContain(pagina)
    }
  })
})

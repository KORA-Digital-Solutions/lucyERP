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
  "app/api/auth/login/route.ts",     // es el propio login
  "app/api/auth/logout/route.ts",    // cerrar sesión no necesita sesión válida
  "app/api/auth/me/route.ts",        // lee la sesión y responde null si no hay
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
    expect(src).toMatch(/NODE_ENV.*production/s)
    expect(src).toMatch(/throw new Error/)
  })

  it("el proxy protege también las rutas API de solo admin", () => {
    const src = readFileSync(join(RAIZ, "proxy.ts"), "utf8")
    for (const ruta of ["/api/workers", "/api/services", "/api/cabins"]) {
      expect(src).toContain(ruta)
    }
    for (const pagina of ["/horarios", "/appointments"]) {
      expect(src).toContain(pagina)
    }
  })
})

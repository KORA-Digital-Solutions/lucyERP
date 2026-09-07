/**
 * Monta el paquete que se lleva al PC del centro.
 *
 *   npm run release
 *
 * Deja en `release/lucy-erp-v1/` una carpeta autocontenida: el servidor de
 * Next en modo standalone (con sus dependencias ya dentro, sin npm install),
 * los estáticos, la base de datos ya creada y sembrada, el .env y los .cmd de
 * arranque, copia de seguridad e instalación como servicio de Windows.
 *
 * Lo único que hace falta en el PC del centro es Node.js. Ver INSTALAR.md,
 * que se copia dentro del paquete.
 *
 * No se ejecuta solo: `npm run release` hace antes `next build`, porque este
 * script solo copia lo que ese build ha dejado en `.next/`.
 */
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const VERSION = "v1"
const salida = join(raiz, "release", `lucy-erp-${VERSION}`)

/** Ruta de instalación por defecto en el PC del centro. */
const DESTINO_WINDOWS = "C:\\lucy-erp"

function paso(mensaje) {
  console.log(`\n▸ ${mensaje}`)
}

function correr(comando, args, env = {}) {
  execFileSync(comando, args, {
    cwd: raiz,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  })
}

// ---------------------------------------------------------------------------
// 1. Comprobar que hay build
// ---------------------------------------------------------------------------
const standalone = join(raiz, ".next", "standalone")
const estaticos = join(raiz, ".next", "static")
if (!existsSync(standalone) || !existsSync(estaticos)) {
  console.error(
    "❌ No hay build. Ejecuta `npm run build` antes (o usa `npm run release`, que lo hace).",
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 2. Carpeta limpia
// ---------------------------------------------------------------------------
paso(`Preparando release/lucy-erp-${VERSION}`)
rmSync(salida, { recursive: true, force: true })
mkdirSync(salida, { recursive: true })

// ---------------------------------------------------------------------------
// 3. Servidor autónomo + estáticos + public
// ---------------------------------------------------------------------------
// El server.js de standalone NO sirve `.next/static` ni `public` por su
// cuenta: hay que copiarlos dentro, y entonces sí los sirve él solo (así el
// centro no necesita ningún servidor web delante).
paso("Copiando el servidor autónomo, los estáticos y public/")
cpSync(standalone, salida, { recursive: true })
cpSync(estaticos, join(salida, ".next", "static"), { recursive: true })
cpSync(join(raiz, "public"), join(salida, "public"), { recursive: true })

// El motor de Prisma es un binario nativo y el trazado de Next se lo deja a
// veces fuera. Si falta, la aplicación arranca y revienta en la primera
// consulta, así que se comprueba aquí y no allí.
const prismaClienteOrigen = join(raiz, "node_modules", ".prisma", "client")
const prismaClienteDestino = join(salida, "node_modules", ".prisma", "client")
const tieneMotor = (dir) =>
  existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".node"))

if (!tieneMotor(prismaClienteDestino)) {
  paso("El motor de Prisma no venía en el build: copiándolo a mano")
  cpSync(prismaClienteOrigen, prismaClienteDestino, { recursive: true })
}
if (!tieneMotor(prismaClienteDestino)) {
  console.error(
    "❌ No se encuentra el motor de Prisma (query_engine-*.node). " +
      "Ejecuta `npx prisma generate` y vuelve a intentarlo.",
  )
  process.exit(1)
}

// `prisma generate` deja copias a medias del motor (…dll.node.tmp1234) cuando
// el fichero estaba bloqueado por un `next dev` abierto. Son 20 MB cada una y
// no las usa nadie: fuera del paquete.
for (const f of readdirSync(prismaClienteDestino)) {
  if (/\.node\.tmp\d+$/.test(f)) rmSync(join(prismaClienteDestino, f))
}

// El esquema hace falta en tiempo de ejecución (Prisma lo lee al arrancar) y
// las migraciones para poder actualizar la base en el centro más adelante.
paso("Copiando prisma/ (esquema y migraciones)")
mkdirSync(join(salida, "prisma"), { recursive: true })
cpSync(join(raiz, "prisma", "schema.prisma"), join(salida, "prisma", "schema.prisma"))
cpSync(join(raiz, "prisma", "migrations"), join(salida, "prisma", "migrations"), {
  recursive: true,
})

// ---------------------------------------------------------------------------
// 4. Base de datos inicial
// ---------------------------------------------------------------------------
// Se crea aquí, en la máquina de desarrollo, y se lleva hecha: así en el PC
// del centro no hace falta ni la CLI de Prisma ni npm install.
paso("Creando la base de datos inicial (migraciones + datos mínimos)")
const datos = join(salida, "data")
mkdirSync(datos, { recursive: true })
const ficheroDb = join(datos, "lucyerp.db")
const urlDb = `file:${ficheroDb.replace(/\\/g, "/")}`

correr("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: urlDb })
correr("npx", ["tsx", "prisma/seed-produccion.ts"], { DATABASE_URL: urlDb })

// ---------------------------------------------------------------------------
// 5. .env
// ---------------------------------------------------------------------------
// El secreto de sesión se genera nuevo en cada paquete: es lo que firma las
// cookies de sesión, así que no puede ir escrito en el repositorio.
paso("Generando .env")
const secreto = randomBytes(48).toString("base64url")
writeFileSync(
  join(salida, ".env"),
  `# Configuración de LucyERP en el PC del centro.
#
# OJO: al actualizar la aplicación, este fichero NO se reemplaza. Es lo único
# que distingue esta instalación de cualquier otra.

# Dónde vive la base de datos. Ruta absoluta y con barras normales.
# Si la carpeta se instala en otro sitio, cambiar esta línea (los .cmd de
# arranque la calculan solos, así que normalmente no hay que tocar nada).
DATABASE_URL="file:${DESTINO_WINDOWS.replace(/\\/g, "/")}/data/lucyerp.db"

# Firma las cookies de sesión. Generado para esta instalación: si se cambia,
# se cierran todas las sesiones abiertas.
SESSION_SECRET="${secreto}"

# WhatsApp Business Cloud API. Vacío = desactivado (v1 sale así).
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
`,
  "utf8",
)

// ---------------------------------------------------------------------------
// 6. Scripts de arranque, copia de seguridad e instalación del servicio
// ---------------------------------------------------------------------------
// Se copian tal cual de deploy/: son ficheros .cmd de verdad, versionados y
// editables, no cadenas generadas aquí (escapar batch dentro de JavaScript ya
// se comió una barra invertida una vez).
paso("Copiando los .cmd de deploy/")
for (const cmd of readdirSync(join(raiz, "deploy"))) {
  cpSync(join(raiz, "deploy", cmd), join(salida, cmd))
}

// ---------------------------------------------------------------------------
// 7. Instrucciones dentro del paquete
// ---------------------------------------------------------------------------
paso("Copiando INSTALAR.md")
cpSync(join(raiz, "INSTALAR.md"), join(salida, "INSTALAR.md"))

console.log(`
✅ Paquete listo: release/lucy-erp-${VERSION}

   Cópialo entero al PC del centro en ${DESTINO_WINDOWS} y sigue INSTALAR.md.
`)

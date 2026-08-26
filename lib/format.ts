// Helpers de formato compartidos.

// Normaliza texto para búsquedas: quita acentos/diacríticos y pasa a minúsculas.
// Así "Lopez" encuentra "López".
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100)
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// "2026-06-08" + "09:45" (hora local) -> Date
export function combineDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  return new Date(y, mo - 1, d, h, mi, 0, 0)
}

export function toTimeString(d: Date): string {
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function toTimeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

// Inicio/fin del día local para una fecha "YYYY-MM-DD".
export function dayRange(date: string): { start: Date; end: Date } {
  const [y, mo, d] = date.split("-").map(Number)
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0)
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999)
  return { start, end }
}

export function formatLongDate(date: string): string {
  const [y, mo, d] = date.split("-").map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// Etiqueta de cliente en formato "primer apellido segundo apellido, nombre".
// Se usa tanto al listar clientes desde el servidor como al dar de alta uno
// nuevo sin recargar, para que ambos caminos muestren lo mismo.
export function customerLabel(c: {
  firstName: string
  lastName?: string | null
  lastName2?: string | null
}): string {
  const apellidos = [c.lastName, c.lastName2].filter(Boolean).join(" ")
  return apellidos ? `${apellidos}, ${c.firstName}` : c.firstName
}

// Deja solo los dígitos de una cadena. Útil para comparar teléfonos sin que
// estorben el prefijo "+", los espacios o los guiones.
export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "")
}

// ── Teléfonos ─────────────────────────────────────────────────────────────
// Se guardan en formato internacional ("+34600111222") porque es lo que exige
// la API de WhatsApp. En los formularios el prefijo va en su propio campo, con
// +34 puesto de fábrica, para que no haya que escribirlo ni adivinar que se
// añade solo.

export const DEFAULT_PHONE_PREFIX = "+34"

// Prefijos que se saben partir. NO limita lo que se puede escribir —el campo
// del prefijo es libre—, solo sirve para volver a separar un número guardado
// en sus dos trozos. Lo que no esté aquí no se parte y se enseña entero, que
// es preferible a cortarlo por donde no es.
const KNOWN_PREFIXES = ["+34", "+351", "+33", "+39", "+44", "+49", "+212", "+40", "+31", "+32", "+41"]

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, "")
}

// Normaliza a la forma en que se guarda: "+34" + número. Acepta el número con
// espacios o guiones, con "00" delante en vez de "+", o sin prefijo ninguno
// (entonces se le pone el de por defecto).
export function normalizePhone(phone: string, defaultPrefix = DEFAULT_PHONE_PREFIX): string {
  let p = cleanPhone(phone)
  if (!p) return ""
  if (p.startsWith("00")) p = "+" + p.slice(2)
  if (p.startsWith("+")) return p
  return `${defaultPrefix}${p}`
}

// Un número español tiene 9 dígitos exactos, ni uno más ni uno menos. De los
// demás países no sabemos la longitud, así que a esos solo se les exige que el
// número completo quepa en el rango de E.164 (de 8 a 15 dígitos con prefijo).
const SPANISH_PHONE_DIGITS = 9

export function isValidPhone(phone: string): boolean {
  const p = normalizePhone(phone)
  if (!/^\+\d{8,15}$/.test(p)) return false
  if (!p.startsWith(DEFAULT_PHONE_PREFIX)) return true
  return p.length - DEFAULT_PHONE_PREFIX.length === SPANISH_PHONE_DIGITS
}

// Un prefijo de país es "+" y de 1 a 3 dígitos: +1, +34, +351, +212. Ni más
// largo ni empezando por cero, porque no existe ninguno así. Vacío se da por
// bueno: significa "usa el de por defecto".
//
// Esto no se puede comprobar sobre el teléfono ya montado —en "+9999600111222"
// no hay forma de saber dónde acaba el prefijo—, así que el prefijo viaja en
// su propio campo hasta el servidor.
export function isValidPhonePrefix(prefix: string): boolean {
  const p = cleanPhone(prefix)
  if (!p) return true
  return /^\+?[1-9]\d{0,2}$/.test(p)
}

// Junta los dos campos del formulario en el valor que se guarda. Sin número
// no hay teléfono, aunque el prefijo esté puesto.
export function joinPhone(prefix: string, national: string): string {
  const limpio = cleanPhone(national)
  // Si el número ya viene entero con su prefijo —un guardado antiguo cuyo
  // prefijo no supimos partir— se respeta tal cual en vez de recomponerlo.
  if (limpio.startsWith("+")) return limpio
  const n = onlyDigits(limpio)
  if (!n) return ""
  const d = onlyDigits(prefix)
  return `${d ? `+${d}` : DEFAULT_PHONE_PREFIX}${n}`
}

// Parte un teléfono guardado en (prefijo, número nacional) para repartirlo
// entre los dos campos del formulario.
export function splitPhone(phone: string | null | undefined): { prefix: string; national: string } {
  const p = normalizePhone(String(phone ?? ""))
  if (!p) return { prefix: DEFAULT_PHONE_PREFIX, national: "" }
  // De más largo a más corto, si no "+34" se comería los "+351".
  const match = [...KNOWN_PREFIXES]
    .sort((a, b) => b.length - a.length)
    .find((k) => p.startsWith(k))
  if (!match) return { prefix: "", national: p }
  return { prefix: match, national: p.slice(match.length) }
}

// El número sin prefijo, agrupado como se lee en voz alta: "600 44 45 55".
// Los españoles van 3-2-2-2; el resto, en bloques de tres.
export function formatNationalPhone(prefix: string, national: string): string {
  if (cleanPhone(national).startsWith("+")) return cleanPhone(national)
  const n = onlyDigits(national)
  if (!n) return ""
  if (prefix === DEFAULT_PHONE_PREFIX && n.length === 9) {
    return `${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`
  }
  return n.replace(/(\d{3})(?=\d)/g, "$1 ")
}

// Teléfono para mostrar: "+34600444555" -> "(+34) 600 44 45 55".
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ""
  const raw = String(phone).trim()
  if (!raw) return ""
  const cleaned = cleanPhone(raw)

  let e164: string
  if (cleaned.startsWith("+")) e164 = cleaned
  else if (cleaned.startsWith("00")) e164 = "+" + cleaned.slice(2)
  else if (/^\d{9}$/.test(cleaned)) e164 = DEFAULT_PHONE_PREFIX + cleaned
  else return raw // no parece un teléfono: se devuelve tal cual

  const { prefix, national } = splitPhone(e164)
  if (!prefix || !national) return raw
  return `(${prefix}) ${formatNationalPhone(prefix, national)}`
}

// ── El teléfono repartido en los dos campos del formulario ───────────────
// Vive aquí, y no en un componente, porque lo usan los tres formularios que
// dan de alta clientes: la ficha, el panel de alta y el alta rápida del TPV.

export type PhoneFields = { prefix: string; national: string }

export const EMPTY_PHONE: PhoneFields = { prefix: "", national: "" }

// Reparte un teléfono guardado entre los dos campos, con el número ya
// agrupado ("600 44 45 55") para que editar se parezca a leer. Sin teléfono
// guardado los dos campos van vacíos: un "+34" suelto en un teléfono que no
// existe parece un dato y no lo es.
export function phoneFields(stored: string | null | undefined): PhoneFields {
  if (!stored) return EMPTY_PHONE
  const { prefix, national } = splitPhone(stored)
  return { prefix, national: formatNationalPhone(prefix, national) }
}

// Al escribir el número aparece solo el prefijo por defecto, y al borrarlo
// entero desaparece con él: prefijo y número van siempre de la mano.
export function withNational(prev: PhoneFields, national: string): PhoneFields {
  if (!national.trim()) return { prefix: "", national }
  return { prefix: prev.prefix || DEFAULT_PHONE_PREFIX, national }
}

// La API de WhatsApp quiere el número internacional sin "+": 34600111222.
export function toWhatsappPhone(phone: string): string {
  return onlyDigits(normalizePhone(phone))
}

// Nº de expediente a 4 dígitos: 7 -> "0007". A partir de 9999 se muestra
// entero, que es mejor que truncarlo.
export function formatFileNumber(n: number | null | undefined): string {
  if (n == null) return "—"
  return String(n).padStart(4, "0")
}

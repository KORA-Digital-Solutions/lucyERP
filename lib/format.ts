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

// Normaliza un teléfono a formato internacional simple (+34...).
export function normalizePhone(phone: string, defaultCountry = "34"): string {
  let p = phone.replace(/[\s\-().]/g, "")
  if (p.startsWith("+")) return p
  if (p.startsWith("00")) return "+" + p.slice(2)
  if (p.length === 9) return `+${defaultCountry}${p}` // móvil/fijo español sin prefijo
  return "+" + p
}

export function isValidPhone(phone: string): boolean {
  if (!phone.trim()) return false
  return /^\+?\d{9,15}$/.test(normalizePhone(phone).replace("+", "")) ||
    /^\+\d{8,15}$/.test(normalizePhone(phone))
}

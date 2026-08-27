// Lógica de alerta para recordatorios de cliente (notas de empleadas).
//
// Hay dos clases de recordatorio y se distinguen por la fecha:
//
//   · Permanentes (sin dueDate): avisos de la ficha que valen siempre, del
//     tipo "alérgica al látex" o "solo paga en efectivo". No vencen: viven
//     hasta que alguien los completa o los borra, y no salen en el dashboard
//     porque no son una tarea que hacer, sino algo que saber al atenderla.
//
//   · Con fecha (dueDate): tareas que vencen, como "se hizo un láser, darle
//     cita en 3 meses". Empiezan a avisar `alertDaysBefore` días antes y
//     siguen avisando, ya vencidas, hasta que se completan.

export const DEFAULT_REMINDER_ALERT_DAYS = 7

// Los recordatorios se pintan en rosa polvo: es la única familia cálida de la
// paleta, así que destaca sobre los azules de la casa sin gritar como gritaba
// el ámbar. Hay dos intensidades y no es decoración, es la misma distinción
// de arriba: un permanente es ambiente ("sépase que es alérgica") y va en el
// rosa flojo, con icono y texto en el azul de siempre; uno vencido sí reclama
// algo, y ahí sube el rosa y se lo queda también el texto.
//
// Los tonos viven aquí, y no sueltos en cada pantalla, porque son cuatro las
// que pintan recordatorios: ficha, TPV, alta rápida y dashboard.
export type ReminderTone = "permanent" | "due" | "overdue"

export const REMINDER_TONE: Record<ReminderTone, { card: string; accent: string }> = {
  permanent: { card: "border-[#ECD2DF] bg-[#FBF3F7]", accent: "text-[#3C54A4]" },
  due:       { card: "border-border",                 accent: "text-[#3C54A4]" },
  overdue:   { card: "border-[#E0AEC6] bg-[#F9E7EF]", accent: "text-[#A94A77]" },
}

/** Color con el que se anuncian los recordatorios cuando no hay tarjeta que teñir. */
export const REMINDER_ACCENT = "text-[#A94A77]"

export function reminderTone(dueDate: Date | string | null, now: Date): ReminderTone {
  if (dueDate === null) return "permanent"
  return isReminderOverdue(new Date(dueDate), now) ? "overdue" : "due"
}

// Marcar un recordatorio como hecho se dice distinto según la clase, porque
// no es lo mismo: una tarea con fecha se completa, pero un aviso permanente
// ("alérgica al látex") no se completa nunca — lo que pasa es que deja de
// aplicar. Las palabras viven aquí y no en cada pantalla para que la ficha, el
// TPV y el dashboard digan siempre lo mismo.
export function reminderCompleteLabel(dueDate: Date | string | null): string {
  return dueDate === null ? "Ya no aplica" : "Completar"
}

export function reminderCompletedMessage(dueDate: Date | string | null): string {
  return dueDate === null ? "El aviso ya no volverá a saltar." : "Recordatorio completado."
}

/** Lo mismo, en pasado, para el histórico de la ficha. */
export function reminderCompletedVerb(dueDate: Date | string | null): string {
  return dueDate === null ? "Retirado" : "Completado"
}

export function isReminderActive(dueDate: Date | null, alertDaysBefore: number, now: Date): boolean {
  if (dueDate === null) return true
  const alertFrom = new Date(dueDate.getTime() - alertDaysBefore * 86_400_000)
  return now >= alertFrom
}

export function isReminderOverdue(dueDate: Date | null, now: Date): boolean {
  if (dueDate === null) return false
  return now > dueDate
}

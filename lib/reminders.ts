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

export function isReminderActive(dueDate: Date | null, alertDaysBefore: number, now: Date): boolean {
  if (dueDate === null) return true
  const alertFrom = new Date(dueDate.getTime() - alertDaysBefore * 86_400_000)
  return now >= alertFrom
}

export function isReminderOverdue(dueDate: Date | null, now: Date): boolean {
  if (dueDate === null) return false
  return now > dueDate
}

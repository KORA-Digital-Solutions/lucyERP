// Lógica de alerta para recordatorios de cliente (notas de empleadas).
// Un recordatorio se considera "activo" (debe aparecer en el dashboard) desde
// `alertDaysBefore` días antes de su vencimiento, y sigue activo (vencido) hasta
// que se marca como completado.

export const DEFAULT_REMINDER_ALERT_DAYS = 7

export function isReminderActive(dueDate: Date, alertDaysBefore: number, now: Date): boolean {
  const alertFrom = new Date(dueDate.getTime() - alertDaysBefore * 86_400_000)
  return now >= alertFrom
}

export function isReminderOverdue(dueDate: Date, now: Date): boolean {
  return now > dueDate
}

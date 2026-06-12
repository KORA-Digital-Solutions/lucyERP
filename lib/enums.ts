// Valores permitidos para los campos String que en el spec son enums.
// SQLite no soporta enums en Prisma, así que se validan aquí.

export const APPOINTMENT_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  DONE: "DONE",
  NO_SHOW: "NO_SHOW",
} as const
export type AppointmentStatus = keyof typeof APPOINTMENT_STATUS

export const REMINDER_STATUS = {
  NOT_SCHEDULED: "NOT_SCHEDULED",
  PENDING: "PENDING",
  SENDING: "SENDING",
  SENT: "SENT",
  FAILED: "FAILED",
  DELIVERED: "DELIVERED",
  READ: "READ",
} as const
export type ReminderStatus = keyof typeof REMINDER_STATUS

export const USER_ROLE = { ADMIN: "ADMIN", WORKER: "WORKER" } as const
export type UserRole = keyof typeof USER_ROLE

export const WA_DIRECTION = { OUTBOUND: "OUTBOUND", INBOUND: "INBOUND" } as const
export const WA_MESSAGE_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
  DELIVERED: "DELIVERED",
  READ: "READ",
  RECEIVED: "RECEIVED",
} as const

// Metadatos de presentación de los estados de cita.
export const STATUS_META: Record<
  AppointmentStatus,
  { label: string; className: string; dot: string }
> = {
  PENDING: {
    label: "Pendiente",
    className: "bg-[#FEF3E2] border-[#F59E0B] text-[#92400E]",
    dot: "bg-[#F59E0B]",
  },
  CONFIRMED: {
    label: "Confirmada",
    className: "bg-[#E6F4EA] border-[#34A853] text-[#1E6B34]",
    dot: "bg-[#34A853]",
  },
  CANCELLED: {
    label: "Cancelada",
    className: "bg-[#F1F2F4] border-[#9AA0A6] text-[#5F6368] line-through",
    dot: "bg-[#9AA0A6]",
  },
  DONE: {
    label: "Realizada",
    className: "bg-[#E5E9F7] border-[#3C54A4] text-[#274775]",
    dot: "bg-[#3C54A4]",
  },
  NO_SHOW: {
    label: "No asistió",
    className: "bg-[#FCE8E6] border-[#EA4335] text-[#B31412]",
    dot: "bg-[#EA4335]",
  },
}

export const REMINDER_META: Record<string, { label: string; className: string }> = {
  NOT_SCHEDULED: { label: "Sin recordatorio", className: "text-muted-foreground" },
  PENDING: { label: "Recordatorio pendiente", className: "text-[#92400E]" },
  SENDING: { label: "Enviando…", className: "text-[#92400E]" },
  SENT: { label: "Recordatorio enviado", className: "text-[#1E6B34]" },
  FAILED: { label: "Error de envío", className: "text-[#B31412]" },
  DELIVERED: { label: "Entregado", className: "text-[#1E6B34]" },
  READ: { label: "Leído", className: "text-[#1E6B34]" },
}

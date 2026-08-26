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

export const LEAVE_TYPE = {
  VACATION: "VACATION",
  PERSONAL: "PERSONAL",
  SICK: "SICK",
  OTHER: "OTHER",
} as const
export type LeaveType = keyof typeof LEAVE_TYPE

// `quota` indica de qué saldo anual descuenta cada tipo de ausencia. Las bajas
// y las ausencias justificadas no consumen cupo: no se limitan por saldo ni
// aparecen en el contador de días gastados.
export const LEAVE_TYPE_META: Record<LeaveType, { label: string; quota: "vacation" | "personal" | null; color: string }> = {
  VACATION: { label: "Vacaciones", quota: "vacation", color: "#5F73B4" },
  PERSONAL: { label: "Asuntos propios", quota: "personal", color: "#A8B4DE" },
  SICK: { label: "Baja por enfermedad", quota: null, color: "#274775" },
  OTHER: { label: "Otra ausencia", quota: null, color: "#8792B8" },
}

export const HOLIDAY_SCOPE = { NATIONAL: "NATIONAL", REGIONAL: "REGIONAL", LOCAL: "LOCAL" } as const
export type HolidayScope = keyof typeof HOLIDAY_SCOPE

export const HOLIDAY_SCOPE_META: Record<HolidayScope, { label: string }> = {
  NATIONAL: { label: "Nacional" },
  REGIONAL: { label: "Autonómico" },
  LOCAL: { label: "Local" },
}

// 0=domingo .. 6=sábado (coincide con Date.getDay())
export const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const
export const WEEKDAY_LABELS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const

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
  { label: string; className: string; dot: string; text: string }
> = {
  PENDING: {
    label: "Pendiente",
    className: "bg-[#FEF3E2] border-[#F59E0B] text-[#92400E]",
    dot: "bg-[#F59E0B]",
    text: "text-[#92400E]",
  },
  CONFIRMED: {
    label: "Confirmada",
    className: "bg-[#E6F4EA] border-[#34A853] text-[#1E6B34]",
    dot: "bg-[#34A853]",
    text: "text-[#1E6B34]",
  },
  CANCELLED: {
    label: "Cancelada",
    className: "bg-[#F1F2F4] border-[#9AA0A6] text-[#5F6368] line-through",
    dot: "bg-[#9AA0A6]",
    text: "text-[#5F6368]",
  },
  DONE: {
    label: "Realizada",
    className: "bg-[#E5E9F7] border-[#3C54A4] text-[#274775]",
    dot: "bg-[#3C54A4]",
    text: "text-[#274775]",
  },
  NO_SHOW: {
    label: "No asistió",
    className: "bg-[#FCE8E6] border-[#EA4335] text-[#B31412]",
    dot: "bg-[#EA4335]",
    text: "text-[#B31412]",
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

/* ------------------------------- CLIENTES -------------------------------- */

export const CUSTOMER_SEX = { FEMALE: "FEMALE", MALE: "MALE" } as const
export type CustomerSex = keyof typeof CUSTOMER_SEX

export const CUSTOMER_SEX_META: Record<CustomerSex, { label: string }> = {
  FEMALE: { label: "Mujer" },
  MALE: { label: "Hombre" },
}

// Cómo nos ha conocido el cliente. Lista cerrada para poder contar de dónde
// vienen las altas; los casos raros caen en OTHER.
export const REFERRAL_SOURCE = {
  OTHER_CLIENT: "OTHER_CLIENT",
  SOCIAL_MEDIA: "SOCIAL_MEDIA",
  INTERNET: "INTERNET",
  ADVERTISING: "ADVERTISING",
  WALK_BY: "WALK_BY",
  OTHER: "OTHER",
} as const
export type ReferralSource = keyof typeof REFERRAL_SOURCE

export const REFERRAL_SOURCE_META: Record<ReferralSource, { label: string }> = {
  OTHER_CLIENT: { label: "Por otro cliente" },
  SOCIAL_MEDIA: { label: "Redes sociales" },
  INTERNET: { label: "Google / Internet" },
  ADVERTISING: { label: "Publicidad" },
  WALK_BY: { label: "Pasaba por la puerta" },
  OTHER: { label: "Otros" },
}

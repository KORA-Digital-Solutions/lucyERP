import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { isWhatsappConfigured } from "@/lib/whatsapp"
import { SettingsClient } from "@/components/settings-client"
import type { WeeklyDay, HolidayRow } from "@/components/schedules-client"

export const dynamic = "force-dynamic"

function groupByDay(rows: { dayOfWeek: number; startTime: string; endTime: string }[]): WeeklyDay[] {
  const days: WeeklyDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, slots: [] }))
  for (const r of rows) {
    days[r.dayOfWeek].slots.push({ startTime: r.startTime, endTime: r.endTime })
  }
  for (const d of days) d.slots.sort((a, b) => a.startTime.localeCompare(b.startTime))
  return days
}

export default async function SettingsPage() {
  const clinic = await getActiveClinic()

  const [cabinCount, workers, clinicSlots, workerSlots, holidays] = await Promise.all([
    prisma.cabin.count({ where: { clinicId: clinic.id, active: true } }),
    prisma.user.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { name: "asc" } }),
    prisma.clinicWeeklySlot.findMany({ where: { clinicId: clinic.id } }),
    prisma.workerWeeklySlot.findMany({ where: { clinicId: clinic.id } }),
    prisma.holiday.findMany({ where: { clinicId: clinic.id }, orderBy: { date: "asc" } }),
  ])

  const clinicWeekly = groupByDay(clinicSlots)

  const workerWeeklyByWorker: Record<string, WeeklyDay[]> = {}
  for (const w of workers) {
    workerWeeklyByWorker[w.id] = groupByDay(workerSlots.filter((s) => s.workerId === w.id))
  }

  const holidayRows: HolidayRow[] = holidays.map((h) => ({
    id: h.id,
    date: h.date,
    name: h.name,
    scope: h.scope,
  }))

  return (
    <SettingsClient
      clinic={{
        name: clinic.name,
        taxId: clinic.taxId,
        address: clinic.address,
        phone: clinic.phone,
        email: clinic.email,
        openingTime: clinic.openingTime,
        closingTime: clinic.closingTime,
        whatsappEnabled: clinic.whatsappEnabled,
        whatsappTemplateName: clinic.whatsappTemplateName,
        whatsappTemplateLang: clinic.whatsappTemplateLang,
        reminderHoursBefore: clinic.reminderHoursBefore,
        inactivityWarningDays: clinic.inactivityWarningDays,
      }}
      whatsappConfigured={isWhatsappConfigured()}
      cabinCount={cabinCount}
      workerCount={workers.length}
      workers={workers.map((w) => ({ id: w.id, name: w.name }))}
      clinicWeekly={clinicWeekly}
      workerWeeklyByWorker={workerWeeklyByWorker}
      holidays={holidayRows}
    />
  )
}

import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { isWhatsappConfigured } from "@/lib/whatsapp"
import { SettingsClient } from "@/components/settings-client"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const clinic = await getActiveClinic()
  const [cabinCount, workerCount] = await Promise.all([
    prisma.cabin.count({ where: { clinicId: clinic.id, active: true } }),
    prisma.user.count({ where: { clinicId: clinic.id, active: true } }),
  ])

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
      }}
      whatsappConfigured={isWhatsappConfigured()}
      cabinCount={cabinCount}
      workerCount={workerCount}
    />
  )
}

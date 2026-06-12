"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { MessageCircle, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { updateClinic } from "@/lib/actions"

interface ClinicData {
  name: string
  taxId: string | null
  address: string | null
  phone: string | null
  email: string | null
  openingTime: string
  closingTime: string
  whatsappEnabled: boolean
  whatsappTemplateName: string | null
  whatsappTemplateLang: string | null
  reminderHoursBefore: number
}

export function SettingsClient({
  clinic,
  whatsappConfigured,
  cabinCount,
  workerCount,
}: {
  clinic: ClinicData
  whatsappConfigured: boolean
  cabinCount: number
  workerCount: number
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [whatsappEnabled, setWhatsappEnabled] = useState(clinic.whatsappEnabled)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("whatsappEnabled", whatsappEnabled ? "on" : "")
    setLoading(true)
    const res = await updateClinic(fd)
    setLoading(false)
    if (res.ok) {
      toast.success("Configuración guardada.")
      router.refresh()
    } else toast.error(res.error ?? "Error al guardar.")
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">Datos de la clínica y recordatorios por WhatsApp</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la clínica</CardTitle>
            <CardDescription>
              {cabinCount} cabinas activas · {workerCount} trabajadores activos
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nombre comercial</Label>
              <Input id="name" name="name" defaultValue={clinic.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">NIF / CIF</Label>
              <Input id="taxId" name="taxId" defaultValue={clinic.taxId ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" defaultValue={clinic.phone ?? ""} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" name="address" defaultValue={clinic.address ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={clinic.email ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="openingTime">Apertura</Label>
                <Input id="openingTime" name="openingTime" type="time" defaultValue={clinic.openingTime} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closingTime">Cierre</Label>
                <Input id="closingTime" name="closingTime" type="time" defaultValue={clinic.closingTime} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" /> WhatsApp Business
            </CardTitle>
            <CardDescription>Recordatorios automáticos de citas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {whatsappConfigured ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#34A853]/40 bg-[#E6F4EA] p-3 text-sm text-[#1E6B34]">
                <CheckCircle2 className="h-4 w-4" /> Credenciales de la API detectadas en el entorno.
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-[#F59E0B]/40 bg-[#FEF3E2] p-3 text-sm text-[#92400E]">
                <AlertTriangle className="h-4 w-4" />
                Sin credenciales: los envíos funcionan en <strong>modo simulado</strong>. Configura las
                variables <code>WHATSAPP_*</code> en <code>.env</code> para enviar de verdad.
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Activar recordatorios automáticos</Label>
                <p className="text-xs text-muted-foreground">El worker enviará recordatorios según la antelación.</p>
              </div>
              <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="whatsappTemplateName">Plantilla</Label>
                <Input id="whatsappTemplateName" name="whatsappTemplateName" defaultValue={clinic.whatsappTemplateName ?? "appointment_reminder_es"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsappTemplateLang">Idioma</Label>
                <Input id="whatsappTemplateLang" name="whatsappTemplateLang" defaultValue={clinic.whatsappTemplateLang ?? "es"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminderHoursBefore">Antelación (horas)</Label>
                <Input id="reminderHoursBefore" name="reminderHoursBefore" type="number" min={1} defaultValue={clinic.reminderHoursBefore} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <div className="flex gap-4 text-sm">
            <Link href="/cabins" className="text-primary hover:underline">Gestionar cabinas →</Link>
            <Link href="/workers" className="text-primary hover:underline">Gestionar trabajadores →</Link>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Guardar configuración"}
          </Button>
        </div>
      </form>
    </div>
  )
}

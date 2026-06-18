import Link from "next/link"
import { Calendar, Clock, AlertTriangle, CheckCircle2, ArrowRight, MessageCircle, Package } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KPICard } from "@/components/kpi-card"
import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { dayRange, toDateInputValue, toTimeString } from "@/lib/format"
import { STATUS_META, type AppointmentStatus } from "@/lib/enums"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const clinic = await getActiveClinic()
  const today = toDateInputValue(new Date())
  const { start, end } = dayRange(today)
  const now = new Date()

  const [todays, pending, failed, upcoming, lowStockProducts] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, startAt: { gte: start, lte: end }, status: { not: "CANCELLED" } },
      include: { customer: true, service: true, worker: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.count({
      where: { clinicId: clinic.id, startAt: { gte: now }, status: "PENDING" },
    }),
    prisma.appointment.count({
      where: { clinicId: clinic.id, reminderStatus: "FAILED" },
    }),
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, startAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } },
      include: { customer: true, service: true },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
    prisma.product.findMany({
      where: { clinicId: clinic.id, active: true, stockMin: { gt: 0 } },
      orderBy: { name: "asc" },
    }).then((ps) => ps.filter((p) => p.stock <= p.stockMin)),
  ])

  const confirmed = todays.filter((a) => a.status === "CONFIRMED").length

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Resumen operativo de {clinic.name}</p>
        </div>
        <Button asChild>
          <Link href="/agenda">
            <Calendar className="mr-2 h-4 w-4" /> Ir a la agenda
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <KPICard title="Citas hoy" value={String(todays.length)} trend={`${confirmed} confirmadas`} trendUp icon={Calendar} />
        <KPICard title="Pendientes de confirmar" value={String(pending)} trend="Próximas citas" trendUp={false} icon={Clock} />
        <KPICard title="Recordatorios fallidos" value={String(failed)} trend="Revisar WhatsApp" trendUp={false} icon={AlertTriangle} />
        <KPICard title="Confirmadas hoy" value={String(confirmed)} trend="De las de hoy" trendUp icon={CheckCircle2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium">Citas de hoy</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/agenda">
                Ver agenda <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {todays.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No hay citas hoy.</p>}
              {todays.map((a) => {
                const meta = STATUS_META[a.status as AppointmentStatus] ?? STATUS_META.PENDING
                const reminded = ["SENT", "DELIVERED", "READ"].includes(a.reminderStatus)
                return (
                  <div key={a.id} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50">
                    <span className="w-14 shrink-0 text-sm font-medium">{toTimeString(a.startAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.customer.firstName} {a.customer.lastName ?? ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.service.name} · {a.worker.name}
                      </p>
                    </div>
                    {reminded && <MessageCircle className="h-4 w-4 shrink-0 text-[#1E6B34]" />}
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Próximas citas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {upcoming.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin próximas citas.</p>}
              {upcoming.map((a) => (
                <div key={a.id} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50">
                  <div className="w-20 shrink-0 text-xs text-muted-foreground">
                    {a.startAt.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                    <br />
                    {toTimeString(a.startAt)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.customer.firstName} {a.customer.lastName ?? ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{a.service.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-orange-600" />
              <CardTitle className="text-base font-medium text-orange-800">Stock bajo mínimo</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/stock" className="text-orange-700 hover:text-orange-900">
                Ver stock <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {lowStockProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-orange-100/50 transition-colors">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-sm text-orange-700 font-medium">{p.stock} ud · mín. {p.stockMin}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

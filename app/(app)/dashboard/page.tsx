import Link from "next/link"
import { Calendar, AlertTriangle, CheckCircle2, ArrowRight, Package, ShoppingCart, Lock, Receipt } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KPICard } from "@/components/kpi-card"
import { DashboardRemindersCard, type DashboardReminderRow } from "@/components/dashboard-reminders-card"
import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { dayRange, toDateInputValue, toTimeString } from "@/lib/format"
import { STATUS_META, type AppointmentStatus } from "@/lib/enums"
import { isReminderActive, isReminderOverdue } from "@/lib/reminders"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const clinic = await getActiveClinic()
  const today = toDateInputValue(new Date())
  const { start, end } = dayRange(today)
  const now = new Date()

  // La caja se indexa por fecha UTC (ver openCashRegister en lib/actions),
  // no por la fecha local que usa el resto del dashboard.
  const cashDate = new Date().toISOString().slice(0, 10)

  const [todays, failed, upcoming, lowStockProducts, todaySales, activeReminders, todayRegister] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, startAt: { gte: start, lte: end }, status: { not: "CANCELLED" } },
      include: { customer: true, service: true, worker: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.count({
      where: { clinicId: clinic.id, reminderStatus: "FAILED" },
    }),
    prisma.appointment.findMany({
      where: { clinicId: clinic.id, startAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } },
      include: { customer: true, service: true, worker: true },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
    prisma.product.findMany({
      where: { clinicId: clinic.id, active: true, stockMin: { gt: 0 } },
      orderBy: { name: "asc" },
    }).then((ps) => ps.filter((p) => p.stock <= p.stockMin)),
    prisma.sale.findMany({
      where: { clinicId: clinic.id, createdAt: { gte: start, lte: end } },
      select: { totalCents: true, paymentMethod: true, saleType: true },
    }),
    prisma.customerReminder.findMany({
      where: { clinicId: clinic.id, completedAt: null },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { dueDate: "asc" },
    }).then((rs) => rs.filter((r) => isReminderActive(r.dueDate, r.alertDaysBefore, now))),
    prisma.cashRegister.findUnique({
      where: { clinicId_date: { clinicId: clinic.id, date: cashDate } },
      select: { status: true },
    }),
  ])

  const reminderRows: DashboardReminderRow[] = activeReminders.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" "),
    title: r.title,
    dueDate: r.dueDate.toISOString(),
    overdue: isReminderOverdue(r.dueDate, now),
  }))

  // "Realizada" es el estado siguiente a "confirmada", no uno paralelo: la cita
  // ya ha ocurrido, así que cuenta como confirmada. Si solo se mirase CONFIRMED,
  // el contador bajaría según se van marcando las citas del día como realizadas.
  const confirmed = todays.filter((a) => a.status === "CONFIRMED" || a.status === "DONE").length
  const todaySalesTotal = todaySales.reduce((s, x) => s + x.totalCents, 0)
  const todayCash = todaySales.filter((x) => x.paymentMethod === "CASH").reduce((s, x) => s + x.totalCents, 0)
  const todayCard = todaySales.filter((x) => x.paymentMethod === "CARD").reduce((s, x) => s + x.totalCents, 0)
  const fmtEur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card p-6">
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

      <div className="p-8 space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-accent p-2">
                  <Calendar className="h-4 w-4 text-accent-foreground" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Citas hoy</p>
                  <p className="text-3xl font-bold tracking-tight">{todays.length}</p>
                  <p className="text-sm text-muted-foreground">
                    Confirmadas {confirmed}/{todays.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <KPICard title="Recordatorios fallidos" value={String(failed)} trend="Revisar WhatsApp" trendUp={false} icon={AlertTriangle} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex min-h-[260px] flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-accent p-2">
                  <Calendar className="h-4 w-4 text-accent-foreground" />
                </div>
                <CardTitle className="text-base font-medium">Próximas citas</CardTitle>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/agenda">
                  Ver agenda <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="space-y-1">
                {upcoming.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin próximas citas.</p>}
                {upcoming.map((a) => {
                  const meta = STATUS_META[a.status as AppointmentStatus] ?? STATUS_META.PENDING
                  return (
                    <div key={a.id} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50">
                      <div className="w-20 shrink-0 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {a.startAt.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                        </span>
                        <br />
                        {toTimeString(a.startAt)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.customer.firstName} {a.customer.lastName ?? ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.service.name} · {a.worker.name}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <DashboardRemindersCard reminders={reminderRows} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex min-h-[260px] flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-accent p-2">
                  <ShoppingCart className="h-4 w-4 text-accent-foreground" />
                </div>
                <CardTitle className="text-base font-medium">Ventas de hoy</CardTitle>
              </div>
              {todaySales.length > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/sales">Ver ventas <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {!todayRegister ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Lock className="h-6 w-6 opacity-40" />
                  <p className="font-medium text-foreground">Caja sin abrir</p>
                  <p>Ábrela para poder registrar ventas.</p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/cash-register">Ir a caja</Link>
                  </Button>
                </div>
              ) : todaySales.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Receipt className="h-6 w-6 opacity-40" />
                  <p>Sin ventas registradas hoy.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="text-2xl font-semibold">{fmtEur(todaySalesTotal)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Efectivo</p>
                    <p className="text-xl font-medium">{fmtEur(todayCash)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tarjeta</p>
                    <p className="text-xl font-medium">{fmtEur(todayCard)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nº ventas</p>
                    <p className="text-xl font-medium">{todaySales.length}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-[260px] flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-accent p-2">
                  <Package className="h-4 w-4 text-accent-foreground" />
                </div>
                <CardTitle className="text-base font-medium">Stock bajo mínimo</CardTitle>
              </div>
              {lowStockProducts.length > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/stock">
                    Ver stock <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {lowStockProducts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="h-6 w-6 opacity-40" />
                  <p className="font-medium text-foreground">Stock OK</p>
                  <p>Todos los productos tienen stock suficiente.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {lowStockProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-sm font-medium text-amber-700">{p.stock} ud · mín. {p.stockMin}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Bell, CheckCircle2, PartyPopper } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { completeCustomerReminder } from "@/lib/actions"
import {
  reminderCompleteLabel, reminderCompletedMessage, REMINDER_TONE,
} from "@/lib/reminders"

export interface DashboardReminderRow {
  id: string
  customerId: string
  customerName: string
  title: string
  dueDate: string
  overdue: boolean
}

export function DashboardRemindersCard({ reminders }: { reminders: DashboardReminderRow[] }) {
  const router = useRouter()
  const [items, setItems] = useState(reminders)
  const [completingId, setCompletingId] = useState<string | null>(null)

  async function complete(id: string) {
    const dueDate = items.find((r) => r.id === id)?.dueDate ?? null
    setCompletingId(id)
    const res = await completeCustomerReminder(id)
    setCompletingId(null)
    if (res.ok) {
      setItems((prev) => prev.filter((r) => r.id !== id))
      toast.success(reminderCompletedMessage(dueDate))
      router.refresh()
    } else {
      toast.error(res.error ?? "Error al completar el recordatorio.")
    }
  }

  return (
    <Card className="flex min-h-[260px] flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent p-2">
            <Bell className="h-4 w-4 text-accent-foreground" />
          </div>
          <CardTitle className="text-base font-medium">Recordatorios de clientes</CardTitle>
        </div>
        {items.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{items.length}</span>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <PartyPopper className="h-6 w-6 opacity-40" />
            <p>Sin recordatorios pendientes.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <Link href={`/clients?open=${r.customerId}`} className="truncate text-sm font-medium hover:underline block">
                    {r.customerName}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{r.title}</p>
                  <p className={cn("text-xs font-medium", REMINDER_TONE[r.overdue ? "overdue" : "due"].accent)}>
                    {r.overdue ? "Venció el " : "Vence el "}
                    {new Date(r.dueDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1"
                  disabled={completingId === r.id}
                  onClick={() => complete(r.id)}
                >
                  <CheckCircle2 className="h-4 w-4" /> {reminderCompleteLabel(r.dueDate)}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

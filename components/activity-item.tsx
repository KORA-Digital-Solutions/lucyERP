import { cn } from "@/lib/utils"

interface ActivityItemProps {
  title: string
  description: string
  time: string
  type: "appointment" | "invoice" | "client"
}

const typeStyles = {
  appointment: "bg-primary/10 text-primary",
  invoice: "bg-secondary/10 text-secondary",
  client: "bg-accent text-accent-foreground",
}

const typeLabels = {
  appointment: "Cita",
  invoice: "Factura",
  client: "Cliente",
}

export function ActivityItem({ title, description, time, type }: ActivityItemProps) {
  return (
    <div className="flex items-start gap-4 py-3">
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
          typeStyles[type]
        )}
      >
        {typeLabels[type]}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{time}</span>
    </div>
  )
}

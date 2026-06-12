import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface KPICardProps {
  title: string
  value: string
  trend?: string
  trendUp?: boolean
  icon: LucideIcon
  className?: string
}

export function KPICard({ title, value, trend, trendUp, icon: Icon, className }: KPICardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {trend && (
              <p
                className={cn(
                  "text-sm",
                  trendUp ? "text-secondary" : "text-muted-foreground"
                )}
              >
                {trend}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-accent p-3">
            <Icon className="h-5 w-5 text-accent-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

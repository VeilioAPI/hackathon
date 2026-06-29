import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

export function KpiCard({
  label,
  value,
  delta,
  trend = "up",
  icon: Icon,
  tone = "primary",
}: {
  label: string
  value: string
  delta?: string
  trend?: "up" | "down"
  icon: LucideIcon
  tone?: "primary" | "accent" | "amber"
}) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    amber: "bg-amber-100 text-amber-700",
  }
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center justify-between">
        <span className={cn("flex size-9 items-center justify-center rounded-lg", toneClasses[tone])}>
          <Icon className="size-4.5" />
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              trend === "up" ? "text-emerald-600" : "text-red-600",
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {delta}
          </span>
        )}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </Card>
  )
}

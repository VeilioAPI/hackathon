import { cn } from "@/lib/utils"
import type { RiskLevel, AgreementStatus } from "@/lib/view-models"

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const styles: Record<RiskLevel, string> = {
    Low: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    Medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
    High: "bg-red-50 text-red-700 ring-red-600/20",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[risk],
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          risk === "Low" && "bg-emerald-500",
          risk === "Medium" && "bg-amber-500",
          risk === "High" && "bg-red-500",
        )}
      />
      {risk}
    </span>
  )
}

export function StatusBadge({ status }: { status: AgreementStatus }) {
  const styles: Record<AgreementStatus, string> = {
    Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    Expiring: "bg-amber-50 text-amber-700 ring-amber-600/20",
    Revoked: "bg-secondary text-muted-foreground ring-border",
    Pending: "bg-blue-50 text-blue-700 ring-blue-600/20",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[status],
      )}
    >
      {status}
    </span>
  )
}

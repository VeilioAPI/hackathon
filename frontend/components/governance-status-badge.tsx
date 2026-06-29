import { cn } from "@/lib/utils"
import type { CatalogGovernanceStatus } from "@/lib/api"

const styles: Record<CatalogGovernanceStatus, string> = {
  Available: "bg-slate-50 text-slate-700 ring-slate-500/20",
  ProposalPending: "bg-blue-50 text-blue-700 ring-blue-600/20",
  AgreementActive: "bg-violet-50 text-violet-700 ring-violet-600/20",
  PassportPending: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  ConsentPending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Revoked: "bg-secondary text-muted-foreground ring-border",
  Expired: "bg-orange-50 text-orange-700 ring-orange-600/20",
}

const labels: Record<CatalogGovernanceStatus, string> = {
  Available: "Available",
  ProposalPending: "Request Pending",
  AgreementActive: "Agreement Active",
  PassportPending: "Passport Pending",
  ConsentPending: "Consent Required",
  Active: "Governed · Active",
  Revoked: "Revoked",
  Expired: "Expired",
}

const ownerLabels: Partial<Record<CatalogGovernanceStatus, string>> = {
  ConsentPending: "Awaiting recipient consent",
  PassportPending: "Passport issued",
  ProposalPending: "Proposal sent",
}

export function GovernanceStatusBadge({
  status,
  perspective,
  recipientHint,
}: {
  status: CatalogGovernanceStatus
  perspective?: "owner" | "recipient"
  recipientHint?: string
}) {
  const label =
    perspective === "owner" && ownerLabels[status]
      ? recipientHint && status === "ConsentPending"
        ? `Awaiting consent from ${recipientHint}`
        : ownerLabels[status]!
      : labels[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[status],
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "Active" && "bg-emerald-500",
          status === "ConsentPending" && "bg-amber-500",
          status === "ProposalPending" && "bg-blue-500",
          status === "Revoked" && "bg-muted-foreground",
          status === "Available" && "bg-slate-400",
        )}
      />
      {label}
    </span>
  )
}

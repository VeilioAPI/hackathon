import {
  Database,
  Share2,
  KeyRound,
  CheckCircle2,
  PencilLine,
  Ban,
  FileCog,
  type LucideIcon,
} from "lucide-react"
import type { AuditAction } from "@/lib/view-models"

export const actionMeta: Record<
  AuditAction,
  { icon: LucideIcon; className: string }
> = {
  "Dataset Registered": { icon: Database, className: "bg-indigo-50 text-indigo-600" },
  "Dataset Shared": { icon: Share2, className: "bg-blue-50 text-blue-600" },
  "Sharing Accepted": { icon: CheckCircle2, className: "bg-sky-50 text-sky-600" },
  "Access Granted": { icon: KeyRound, className: "bg-emerald-50 text-emerald-600" },
  "Consent Approved": {
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-600",
  },
  "Access Modified": { icon: PencilLine, className: "bg-amber-50 text-amber-600" },
  "Access Revoked": { icon: Ban, className: "bg-red-50 text-red-600" },
  "Policy Updated": { icon: FileCog, className: "bg-accent/10 text-accent" },
}

import { Shell } from "@/components/shell"
import { AuditTrail } from "@/components/audit-trail"

export default function AuditTrailPage() {
  return (
    <Shell
      title="Audit Trail"
      subtitle="Immutable governance timeline with full Canton transaction IDs"
    >
      <AuditTrail />
    </Shell>
  )
}

"use client"

import Link from "next/link"
import { OwnerExposureView } from "@/components/owner-exposure-view"
import { Shell } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { usePartnerContext } from "@/contexts/partner-context"

export default function MyDataExposurePage() {
  const { viewer } = usePartnerContext()

  return (
    <Shell
      title="Who has access to my data?"
      subtitle={
        viewer
          ? `Exposure map for ${viewer.displayName} — purpose, partner, and validity of every grant`
          : "Owner visibility over external dataset access (grant.md Q1)"
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" render={<Link href="/datasets" />}>
            Deposit dataset
          </Button>
          <Button size="sm" variant="outline" render={<Link href="/governance/passports" />}>
            All passports
          </Button>
          <Button size="sm" variant="outline" render={<Link href="/compliance" />}>
            Compliance export
          </Button>
        </div>
        <OwnerExposureView ownerHint={viewer?.hint} />
      </div>
    </Shell>
  )
}

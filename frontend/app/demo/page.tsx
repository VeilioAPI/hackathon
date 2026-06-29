"use client"

import { JuryDemoView } from "@/components/jury-demo-view"
import { Shell } from "@/components/shell"
import { usePartnerContext } from "@/contexts/partner-context"

export default function DemoPage() {
  const { viewer } = usePartnerContext()

  return (
    <Shell
      title="Jury Demo"
      subtitle={
        viewer
          ? `Guided walkthrough for ${viewer.displayName}`
          : "5-minute governed data sharing scenario on Canton"
      }
    >
      <JuryDemoView />
    </Shell>
  )
}

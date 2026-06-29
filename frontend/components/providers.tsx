"use client"

import type { ReactNode } from "react"
import { PartnerProvider } from "@/contexts/partner-context"

export function Providers({ children }: { children: ReactNode }) {
  return <PartnerProvider>{children}</PartnerProvider>
}

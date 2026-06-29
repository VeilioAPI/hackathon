"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Network, ShieldCheck, Users } from "lucide-react"
import { ExchangeHubSummary } from "@/components/exchange-hub-summary"
import { CantonscanBanner } from "@/components/cantonscan-banner"
import { KpiCard } from "@/components/kpi-card"
import { TrustNetworkMap } from "@/components/trust-network-map"
import { UseCaseFilterChips } from "@/components/use-case-filter-chips"
import { Shell } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type AccessPassport, type ExchangeSummary } from "@/lib/api"
import { categories } from "@/lib/view-models"

function daysUntil(iso: string): number | null {
  const expiry = new Date(iso).getTime()
  if (Number.isNaN(expiry)) return null
  return Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function InsightsPage() {
  const [summary, setSummary] = useState<ExchangeSummary | null>(null)
  const [passports, setPassports] = useState<AccessPassport[]>([])
  const [useCaseFilter, setUseCaseFilter] = useState<(typeof categories)[number]>("All")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.exchangeSummary(), api.passports()])
      .then(([summaryResult, passportRows]) => {
        setSummary(summaryResult)
        setPassports(passportRows)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load insights"),
      )
  }, [])

  const filteredPassports = useMemo(() => {
    if (useCaseFilter === "All") return passports
    return passports.filter((row) => row.useCase === useCaseFilter)
  }, [passports, useCaseFilter])

  const activeFiltered = useMemo(
    () => filteredPassports.filter((row) => row.status === "Active"),
    [filteredPassports],
  )

  const expiringSoon = useMemo(
    () =>
      activeFiltered.filter((passport) => {
        const days = daysUntil(passport.expiresAt)
        return days != null && days >= 0 && days <= 7
      }),
    [activeFiltered],
  )

  const uniquePartners = useMemo(() => {
    const hints = new Set<string>()
    for (const passport of activeFiltered) {
      hints.add(passport.ownerHint)
      hints.add(passport.recipientHint)
    }
    return hints.size
  }, [activeFiltered])

  return (
    <Shell
      title="Insights"
      subtitle="Trust network, exposure summary, and expiration risk across governed datasets"
    >
      <div className="space-y-6">
        <CantonscanBanner />

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <UseCaseFilterChips value={useCaseFilter} onChange={setUseCaseFilter} />

        <ExchangeHubSummary />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Active (filtered)"
            value={String(activeFiltered.length)}
            icon={ShieldCheck}
            tone="primary"
          />
          <KpiCard
            label="Partners in view"
            value={String(uniquePartners)}
            icon={Users}
            tone="accent"
          />
          <KpiCard
            label="Expiring ≤ 7d"
            value={String(expiringSoon.length)}
            icon={AlertTriangle}
            tone={expiringSoon.length > 0 ? "amber" : "accent"}
          />
          <KpiCard
            label="Revoked (30d)"
            value={summary ? String(summary.revokedLast30Days) : "—"}
            icon={Network}
            tone="primary"
          />
        </div>

        {expiringSoon.length > 0 ? (
          <Card className="border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-amber-600" />
                Exposure — passports expiring soon
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringSoon.map((passport) => {
                const days = daysUntil(passport.expiresAt)
                return (
                  <div
                    key={passport.passportId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{passport.datasetTitle ?? passport.datasetId}</p>
                      <p className="text-xs text-muted-foreground">
                        {passport.useCase} · {passport.ownerDisplayName ?? passport.ownerHint} →{" "}
                        {passport.recipientDisplayName ?? passport.recipientHint}
                        {days != null ? ` · ${days}d left` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <Link
                          href={`/governance/passports/${encodeURIComponent(passport.passportId)}`}
                        />
                      }
                    >
                      Review
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ) : null}

        <TrustNetworkMap useCaseFilter={useCaseFilter === "All" ? undefined : useCaseFilter} />
      </div>
    </Shell>
  )
}

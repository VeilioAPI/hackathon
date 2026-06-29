"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, FileClock, IdCard, ShieldCheck, Users } from "lucide-react"
import { KpiCard } from "@/components/kpi-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type AccessPassport, type ExchangeSummary } from "@/lib/api"

function daysUntil(iso: string): number | null {
  const expiry = new Date(iso).getTime()
  if (Number.isNaN(expiry)) return null
  return Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24))
}

export function ExchangeHubSummary() {
  const [summary, setSummary] = useState<ExchangeSummary | null>(null)
  const [passports, setPassports] = useState<AccessPassport[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.exchangeSummary(), api.passports()])
      .then(([summaryResult, passportRows]) => {
        setSummary(summaryResult)
        setPassports(passportRows)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load exchange summary"),
      )
  }, [])

  const expiringSoon = useMemo(
    () =>
      passports.filter((passport) => {
        if (passport.status !== "Active") return false
        const days = daysUntil(passport.expiresAt)
        return days != null && days >= 0 && days <= 7
      }),
    [passports],
  )

  if (error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    )
  }

  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Active Passports"
          value={String(summary.activePassports)}
          icon={IdCard}
          tone="primary"
        />
        <KpiCard
          label="Pending Requests"
          value={String(summary.pendingRequests)}
          icon={FileClock}
          tone="amber"
        />
        <KpiCard
          label="Expiring ≤ 7 days"
          value={String(summary.expiringWithin7Days)}
          icon={AlertTriangle}
          tone={summary.expiringWithin7Days > 0 ? "amber" : "accent"}
        />
        <KpiCard
          label="Trust Partners"
          value={String(summary.partnerCount)}
          icon={Users}
          tone="accent"
        />
      </div>

      {expiringSoon.length > 0 ? (
        <Card className="border-amber-200/60 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-100">
              <AlertTriangle className="size-4" />
              Expiration alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiringSoon.map((passport) => {
              const days = daysUntil(passport.expiresAt)
              return (
                <div
                  key={passport.passportId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/50 bg-card/80 px-3 py-2 text-sm dark:border-amber-900/30"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {passport.datasetTitle ?? passport.datasetId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {passport.ownerDisplayName ?? passport.ownerHint} →{" "}
                      {passport.recipientDisplayName ?? passport.recipientHint}
                      {days != null ? ` · ${days} day${days === 1 ? "" : "s"} left` : ""}
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
      ) : summary.activePassports > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-600" />
          No active passports expiring in the next 7 days.
        </p>
      ) : null}
    </div>
  )
}

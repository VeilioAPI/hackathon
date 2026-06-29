"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Activity, Database, FileClock, IdCard } from "lucide-react"
import { Shell } from "@/components/shell"
import { KpiCard } from "@/components/kpi-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type AccessPassport, type AuditEvent, type ExchangeSummary } from "@/lib/api"
import { mapAuditEvents, seedSummaryFallback } from "@/lib/view-models"

export default function DashboardPage() {
  const [summary, setSummary] = useState<ExchangeSummary | null>(null)
  const [passports, setPassports] = useState<AccessPassport[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.exchangeSummary(), api.passports(), api.audit()])
      .then(([summaryResult, passportsResult, auditResult]) => {
        setSummary(summaryResult)
        setPassports(passportsResult)
        setAudit(auditResult)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load dashboard"),
      )
  }, [])

  const counters = seedSummaryFallback(summary ?? undefined)
  const recentAudit = useMemo(() => mapAuditEvents(audit).slice(0, 8), [audit])
  const expiringSoon = useMemo(
    () =>
      passports.filter((passport) => {
        if (passport.status !== "Active") return false
        const expiry = new Date(passport.expiresAt).getTime()
        if (Number.isNaN(expiry)) return false
        const days = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24))
        return days >= 0 && days <= 7
      }),
    [passports],
  )

  return (
    <Shell
      title="Dashboard"
      subtitle="Operational overview of cross-bank governance activity"
      action={
        <Button
          render={<Link href="/governance/access-requests" />}
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          New governance action
        </Button>
      }
    >
      <div className="space-y-6">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Active Passports"
            value={String(counters.activePassports)}
            icon={IdCard}
            tone="primary"
          />
          <KpiCard
            label="Pending Requests"
            value={String(counters.pendingRequests)}
            icon={FileClock}
            tone="amber"
          />
          <KpiCard
            label="Registered Datasets"
            value={String(counters.datasetCount)}
            icon={Database}
            tone="accent"
          />
          <KpiCard
            label="Revoked (30d)"
            value={String(counters.revokedLast30Days)}
            icon={Activity}
            tone="amber"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Audit Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit events yet.</p>
              ) : (
                recentAudit.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{event.action}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {event.dataset} · {event.actor}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {event.timestamp}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expiring Within 7 Days</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringSoon.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active passports expiring in the next 7 days.
                </p>
              ) : (
                expiringSoon.slice(0, 8).map((passport) => (
                  <div
                    key={passport.passportId}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      {passport.datasetTitle ?? passport.datasetId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {passport.ownerHint} → {passport.recipientHint} ·{" "}
                      {new Date(passport.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Shell>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Database,
  Users,
  IdCard,
  Clock,
  Building2,
  Target,
  CalendarClock,
  ShieldAlert,
  Check,
  X,
} from "lucide-react"
import { KpiCard } from "@/components/kpi-card"
import { RiskBadge, StatusBadge } from "@/components/status-badges"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api, type ExchangeSummary, type Permission } from "@/lib/api"
import {
  categories,
  mapPassportsToExchange,
  type Category,
  type ExchangeAgreement,
} from "@/lib/view-models"

export function ExchangeHub() {
  const [filter, setFilter] = useState<(typeof categories)[number]>("All")
  const [agreements, setAgreements] = useState<ExchangeAgreement[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [summary, setSummary] = useState<ExchangeSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  async function load() {
    const [passports, perms, exchangeSummary] = await Promise.all([
      api.passports(),
      api.permissions(),
      api.exchangeSummary(),
    ])
    setAgreements(mapPassportsToExchange(passports))
    setPermissions(perms)
    setSummary(exchangeSummary)
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load exchange hub"),
    )
  }, [])

  const filtered =
    filter === "All"
      ? agreements
      : agreements.filter((a) => a.category === filter)

  const metrics = useMemo(() => {
    if (summary) {
      return {
        sharedDatasets: summary.datasetCount,
        connectedPartners: summary.partnerCount,
        activePassports: summary.activePassports,
        expiringPermissions: summary.expiringWithin7Days,
      }
    }
    const sharedDatasets = new Set(agreements.map((agreement) => agreement.datasetId)).size
    const connectedPartners = new Set(
      agreements.map((agreement) => agreement.recipient),
    ).size
    const activePassports = permissions.filter(
      (permission) => permission.status === "PSActive",
    ).length
    const expiringPermissions = permissions.filter((permission) => {
      if (permission.status !== "PSActive") return false
      const expiresAt = new Date(permission.expiresAt).getTime()
      if (Number.isNaN(expiresAt)) return false
      const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
      return days >= 0 && days <= 14
    }).length

    return {
      sharedDatasets,
      connectedPartners,
      activePassports,
      expiringPermissions,
    }
  }, [agreements, permissions])

  async function revokeAccess(agreement: ExchangeAgreement) {
    const revocable = permissions.find(
      (permission) =>
        permission.agreementId === agreement.agreementId &&
        (permission.status === "PSActive" || permission.status === "PSPending"),
    )

    if (!revocable) {
      setError(`No active or pending permission for ${agreement.agreementId}`)
      return
    }

    setIsBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.revokePermission({
        permissionId: revocable.permissionId,
        revocationId: `REV-${revocable.permissionId}-${Date.now().toString(36)}`,
        reason: "Revoked from Exchange Hub",
      })
      setMessage(`Access revoked for ${revocable.permissionId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revocation failed")
    } finally {
      setIsBusy(false)
    }
  }

  async function acceptProposal(agreement: ExchangeAgreement) {
    setIsBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.acceptSharing(agreement.agreementId)
      setMessage(`Proposal accepted: ${agreement.agreementId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Shared Datasets"
          value={String(metrics.sharedDatasets)}
          icon={Database}
          tone="primary"
        />
        <KpiCard
          label="Connected Partners"
          value={String(metrics.connectedPartners)}
          icon={Users}
          tone="accent"
        />
        <KpiCard
          label="Active Access Passports"
          value={String(metrics.activePassports)}
          icon={IdCard}
          tone="primary"
        />
        <KpiCard
          label="Expiring Permissions"
          value={String(metrics.expiringPermissions)}
          icon={Clock}
          tone="amber"
        />
      </div>

      {summary ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="text-muted-foreground">Pending Requests</p>
            <p className="text-lg font-semibold">{summary.pendingRequests}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="text-muted-foreground">Pending Consent</p>
            <p className="text-lg font-semibold">{summary.pendingConsent}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="text-muted-foreground">Revoked (30d)</p>
            <p className="text-lg font-semibold">{summary.revokedLast30Days}</p>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <Card key={a.id} className="gap-0 p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-tight text-foreground text-balance">
                {a.dataset}
              </h3>
              <StatusBadge status={a.status} />
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-2.5">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <dt className="sr-only">Recipient</dt>
                <dd className="text-foreground">{a.recipient}</dd>
              </div>
              <div className="flex items-center gap-2.5">
                <Target className="size-4 shrink-0 text-muted-foreground" />
                <dt className="sr-only">Purpose</dt>
                <dd className="text-muted-foreground">{a.purpose}</dd>
              </div>
              <div className="flex items-center gap-2.5">
                <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                <dt className="sr-only">Expires</dt>
                <dd className="text-muted-foreground">
                  Expires{" "}
                  <span className="font-medium text-foreground">
                    {a.status === "Revoked"
                      ? "Revoked"
                      : `in ${a.expiresInDays} days`}
                  </span>{" "}
                  · {a.expiresOn}
                  {a.status === "Active" && a.expiresInDays <= 7 ? (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      Expiring soon
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
                <dt className="sr-only">Risk</dt>
                <dd>
                  <RiskBadge risk={a.risk} />
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
              <Button
                render={
                  <Link
                    href={`/governance/passports?agreementId=${encodeURIComponent(a.agreementId)}`}
                  />
                }
                variant="outline"
                size="sm"
                className="flex-1"
              >
                View Passport
              </Button>
              {a.status === "Pending" ? (
                <Button
                  variant="default"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => acceptProposal(a)}
                  className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check className="mr-1 size-4" />
                  Accept
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={a.status === "Revoked" || isBusy}
                  onClick={() => revokeAccess(a)}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700"
                >
                  <X className="mr-1 size-4" />
                  Revoke Access
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

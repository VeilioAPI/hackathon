"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Ban,
  Building2,
  CalendarClock,
  Database,
  Eye,
  RefreshCw,
  Target,
  Users,
} from "lucide-react"
import { KpiCard } from "@/components/kpi-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api, type OwnerExposure, type OwnerExposureGrant } from "@/lib/api"
import { cn } from "@/lib/utils"

function grantStatusLabel(status: OwnerExposureGrant["status"]): string {
  if (status === "PendingConsent") return "Pending consent"
  if (status === "Active") return "Active"
  if (status === "Revoked") return "Revoked"
  if (status === "Expired") return "Expired"
  return status
}

function grantStatusClass(status: OwnerExposureGrant["status"]): string {
  if (status === "Active") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
  }
  if (status === "PendingConsent") {
    return "bg-amber-50 text-amber-800 ring-amber-600/20"
  }
  return "bg-muted text-muted-foreground ring-border"
}

function formatExpiry(days: number | null, expiresAt: string): string {
  if (days == null) {
    return new Date(expiresAt).toLocaleDateString()
  }
  if (days < 0) return "Expired"
  if (days === 0) return "Expires today"
  if (days <= 7) return `${days}d left`
  return new Date(expiresAt).toLocaleDateString()
}

export function OwnerExposureView({ ownerHint }: { ownerHint?: string }) {
  const router = useRouter()
  const [exposure, setExposure] = useState<OwnerExposure | null>(null)
  const [tab, setTab] = useState<"dataset" | "partner">("dataset")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!ownerHint) {
      setExposure(null)
      return
    }
    const result = await api.ownerExposure(ownerHint)
    setExposure(result)
  }, [ownerHint])

  useEffect(() => {
    setError(null)
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load data exposure"),
    )
  }, [load])

  async function renewGrant(grant: OwnerExposureGrant) {
    setRevokingId(grant.passportId)
    setError(null)
    setMessage(null)
    try {
      const result = await api.renewPassport(grant.passportId, {
        reason: "Renewed from owner exposure view",
      })
      setMessage(result.message)
      router.push(`/governance/passports/${encodeURIComponent(result.newPermissionId)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Renewal failed")
    } finally {
      setRevokingId(null)
    }
  }

  async function revokeGrant(grant: OwnerExposureGrant) {
    setRevokingId(grant.passportId)
    setError(null)
    setMessage(null)
    try {
      await api.revokePermission({
        permissionId: grant.passportId,
        revocationId: `REV-${grant.passportId}-${Date.now().toString(36)}`,
        reason: "Revoked from owner exposure view",
      })
      setMessage(`Access revoked for ${grant.recipientDisplayName ?? grant.recipientHint}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revocation failed")
    } finally {
      setRevokingId(null)
    }
  }

  if (!ownerHint) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Select an organization in the header (<strong>Viewing as</strong>) to see who has access
          to your datasets.
        </CardContent>
      </Card>
    )
  }

  if (!exposure) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    )
  }

  const ownerLabel = exposure.ownerDisplayName ?? exposure.ownerHint

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          label="Datasets owned"
          value={String(exposure.summary.datasetsOwned)}
          icon={Database}
          tone="primary"
        />
        <KpiCard
          label="Shared datasets"
          value={String(exposure.summary.datasetsWithAccess)}
          icon={Eye}
          tone="accent"
        />
        <KpiCard
          label="Active grants"
          value={String(exposure.summary.activeGrants)}
          icon={Users}
          tone="primary"
        />
        <KpiCard
          label="Partners with access"
          value={String(exposure.summary.uniqueRecipients)}
          icon={Building2}
          tone="accent"
        />
        <KpiCard
          label="Pending consent"
          value={String(exposure.summary.pendingConsent)}
          icon={Target}
          tone="amber"
        />
        <KpiCard
          label="Expiring ≤ 7d"
          value={String(exposure.summary.expiringWithin7Days)}
          icon={AlertTriangle}
          tone={exposure.summary.expiringWithin7Days > 0 ? "amber" : "accent"}
        />
      </div>

      {exposure.summary.expiringWithin7Days > 0 ? (
        <Card className="border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600" />
              Review access expiring soon
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {exposure.summary.expiringWithin7Days} active grant
            {exposure.summary.expiringWithin7Days === 1 ? "" : "s"} for {ownerLabel} expire within 7
            days. Renew or revoke before purpose ends.
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-1">
        {(
          [
            { id: "dataset", label: "By dataset" },
            { id: "partner", label: "By partner" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === item.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "dataset" ? (
        <div className="space-y-4">
          {exposure.byDataset.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No datasets registered for {ownerLabel} yet.{" "}
                <Link href="/datasets" className="font-medium text-primary underline">
                  Deposit a dataset
                </Link>{" "}
                to start governed sharing.
              </CardContent>
            </Card>
          ) : (
            exposure.byDataset.map((dataset) => (
              <Card key={dataset.datasetId} className="overflow-hidden pt-0 gap-0">
                <CardHeader className="border-b border-border py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {dataset.datasetTitle ?? dataset.datasetId}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {dataset.useCase ?? "General"}
                        {dataset.classification ? ` · ${dataset.classification}` : ""}
                        {dataset.dataFormat ? ` · ${dataset.dataFormat}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {dataset.grants.length} grant{dataset.grants.length === 1 ? "" : "s"}
                      {dataset.pending.length > 0
                        ? ` · ${dataset.pending.length} pending`
                        : ""}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {dataset.grants.length === 0 && dataset.pending.length === 0 ? (
                    <p className="px-6 py-6 text-sm text-muted-foreground">
                      No external access granted — dataset is not shared outside {ownerLabel}.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Partner</TableHead>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Scope</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Valid until</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dataset.pending.map((pending) => (
                          <TableRow key={`${pending.agreementId}-pending`}>
                            <TableCell className="font-medium">
                              {pending.recipientDisplayName ?? pending.recipientHint}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground">
                              {pending.purpose}
                            </TableCell>
                            <TableCell className="text-muted-foreground">—</TableCell>
                            <TableCell>
                              <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                                Awaiting acceptance
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(pending.expiration).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                render={<Link href="/governance/access-requests" />}
                              >
                                Manage
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {dataset.grants.map((grant) => (
                          <TableRow key={grant.passportId}>
                            <TableCell className="font-medium">
                              {grant.recipientDisplayName ?? grant.recipientHint}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground">
                              {grant.purpose}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {grant.accessScope}
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                  grantStatusClass(grant.status),
                                )}
                              >
                                {grantStatusLabel(grant.status)}
                              </span>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-muted-foreground",
                                grant.daysUntilExpiry != null &&
                                  grant.daysUntilExpiry <= 7 &&
                                  grant.daysUntilExpiry >= 0 &&
                                  grant.status === "Active" &&
                                  "font-medium text-amber-700",
                              )}
                            >
                              <span className="inline-flex items-center gap-1">
                                {grant.daysUntilExpiry != null &&
                                grant.daysUntilExpiry <= 7 &&
                                grant.status === "Active" ? (
                                  <CalendarClock className="size-3.5" />
                                ) : null}
                                {formatExpiry(grant.daysUntilExpiry, grant.expiresAt)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  render={
                                    <Link
                                      href={`/governance/passports/${encodeURIComponent(grant.passportId)}`}
                                    />
                                  }
                                >
                                  View
                                </Button>
                                {grant.status === "Active" || grant.status === "PendingConsent" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={revokingId === grant.passportId}
                                    onClick={() => revokeGrant(grant)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Ban className="mr-1 size-3.5" />
                                    {revokingId === grant.passportId ? "…" : "Revoke"}
                                  </Button>
                                ) : null}
                                {grant.status === "Active" &&
                                grant.daysUntilExpiry != null &&
                                grant.daysUntilExpiry <= 14 ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={revokingId === grant.passportId}
                                    onClick={() => renewGrant(grant)}
                                  >
                                    <RefreshCw className="mr-1 size-3.5" />
                                    Renew
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className="overflow-hidden pt-0 gap-0">
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="text-base">Partners with access to your data</CardTitle>
            <p className="text-sm text-muted-foreground">
              Aggregated view — who {ownerLabel} has shared datasets with, and for which purposes.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {exposure.byRecipient.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No partners currently have access to datasets owned by {ownerLabel}.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Partner</TableHead>
                    <TableHead>Datasets</TableHead>
                    <TableHead>Purposes</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exposure.byRecipient.map((recipient) => (
                    <TableRow key={recipient.recipientHint}>
                      <TableCell className="font-medium">
                        {recipient.recipientDisplayName ?? recipient.recipientHint}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-muted-foreground">
                        {recipient.datasetTitles.join(", ")}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-muted-foreground">
                        {recipient.purposes.join(" · ")}
                      </TableCell>
                      <TableCell>{recipient.activeGrants}</TableCell>
                      <TableCell>{recipient.pendingGrants}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

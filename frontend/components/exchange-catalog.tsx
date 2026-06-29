"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Building2,
  CalendarClock,
  Database,
  FileText,
  IdCard,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react"
import { GovernanceStatusBadge } from "@/components/governance-status-badge"
import { DatasetAccessButtons } from "@/components/dataset-access-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { usePartnerContext } from "@/contexts/partner-context"
import { api, type CatalogListing } from "@/lib/api"
import { categories, type Category } from "@/lib/view-models"
import { cn } from "@/lib/utils"
import { UseCaseFilterChips } from "@/components/use-case-filter-chips"

const classStyles: Record<string, string> = {
  "Regulated-Financial": "bg-blue-50 text-blue-800 ring-blue-600/15",
  "Trade-Finance": "bg-violet-50 text-violet-800 ring-violet-600/15",
  Internal: "bg-slate-50 text-slate-700 ring-slate-500/15",
  Operational: "bg-emerald-50 text-emerald-800 ring-emerald-600/15",
}

function useCaseLabel(useCase: string): string {
  if (useCase === "TradeFinance") return "Trade Finance"
  return useCase
}

function veilioProtectionLabel(listing: {
  tokenized: boolean
  tokenizedColumnNames?: string[]
  piiFieldsTokenized?: number | null
  protectedFileName?: string
}): string | null {
  const isPdf = listing.protectedFileName?.toLowerCase().endsWith(".pdf")
  if (isPdf) {
    return "PDF sealed in Vault"
  }
  if (listing.piiFieldsTokenized != null && listing.piiFieldsTokenized > 0) {
    return `${listing.piiFieldsTokenized} PII field(s) tokenized`
  }
  if (listing.tokenizedColumnNames?.length) {
    return `${listing.tokenizedColumnNames.length} column(s) protected`
  }
  if (listing.tokenized) {
    return "Tokenized in Vault"
  }
  return null
}

function daysUntilExpiry(expiresAt?: string): number | null {
  if (!expiresAt) return null
  const expiry = new Date(expiresAt).getTime()
  if (Number.isNaN(expiry)) return null
  return Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24))
}

export function ExchangeCatalog({
  highlightDatasetId,
  useCaseFilter: controlledFilter,
  onUseCaseFilterChange,
  catalogScope = "all",
}: {
  highlightDatasetId?: string | null
  useCaseFilter?: (typeof categories)[number]
  onUseCaseFilterChange?: (value: (typeof categories)[number]) => void
  catalogScope?: "all" | "shared-by-me" | "shared-with-me"
}) {
  const { viewerHint, refreshBanks } = usePartnerContext()
  const [listings, setListings] = useState<CatalogListing[]>([])
  const [internalFilter, setInternalFilter] = useState<(typeof categories)[number]>("All")
  const filter = controlledFilter ?? internalFilter
  const setFilter = onUseCaseFilterChange ?? setInternalFilter
  const showLocalFilter = controlledFilter === undefined
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    const rows = await api.catalog(
      viewerHint || filter !== "All"
        ? {
            viewerHint: viewerHint ?? undefined,
            useCase: filter === "All" ? undefined : filter,
          }
        : undefined,
    )
    setListings(rows)
  }, [viewerHint, filter])

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load catalog"),
    )
  }, [load])

  const filtered = useMemo(() => {
    let rows = listings
    if (filter !== "All") {
      rows = rows.filter((row) => row.useCase === filter)
    }
    if (catalogScope === "shared-by-me") {
      rows = rows.filter((row) => row.relationship === "owner")
    } else if (catalogScope === "shared-with-me") {
      rows = rows.filter((row) => row.relationship === "recipient")
    }
    return rows
  }, [filter, listings, catalogScope])

  async function rejectProposal(listing: CatalogListing) {
    if (!listing.agreementId) return
    setBusyId(listing.listingId)
    setError(null)
    setMessage(null)
    try {
      await api.rejectSharing(listing.agreementId, "Rejected from Exchange catalog")
      setMessage(`Sharing proposal rejected for ${listing.title}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed")
    } finally {
      setBusyId(null)
    }
  }

  async function denyConsent(listing: CatalogListing) {
    if (!listing.passportId) return
    setBusyId(listing.listingId)
    setError(null)
    setMessage(null)
    try {
      await api.denyConsent({
        permissionId: listing.passportId,
        consentId: `DENY-${listing.passportId}-${Date.now().toString(36)}`,
        reason: "Consent denied — scope or purpose not acceptable",
      })
      setMessage(`Consent denied for ${listing.title}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deny consent failed")
    } finally {
      setBusyId(null)
    }
  }

  async function seedDemo() {
    setSeeding(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api.seedDemo()
      await refreshBanks()
      await load()
      setMessage(
        `Demo network loaded — ${result.listings.length} governed datasets, ${result.partners.length} partners.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo seed failed")
    } finally {
      setSeeding(false)
    }
  }

  async function runAction(listing: CatalogListing) {
    if (!viewerHint) {
      setError("Select an organization context first")
      return
    }

    setBusyId(listing.listingId)
    setError(null)
    setMessage(null)

    try {
      if (listing.governanceStatus === "Available" && listing.relationship !== "owner") {
        await api.requestCatalogAccess(listing.listingId, {
          requesterHint: viewerHint,
          purpose: listing.defaultPurpose,
        })
        setMessage(`Access request sent for ${listing.title}`)
      } else if (listing.governanceStatus === "ProposalPending" && listing.relationship === "recipient") {
        if (!listing.agreementId) throw new Error("Missing agreement id")
        await api.acceptSharing(listing.agreementId)
        setMessage(`Sharing agreement accepted for ${listing.title}`)
      } else if (
        (listing.governanceStatus === "AgreementActive" ||
          listing.governanceStatus === "PassportPending") &&
        listing.relationship === "owner"
      ) {
        if (!listing.agreementId) throw new Error("Missing agreement id")
        const passportId = listing.passportId ?? `VP-${listing.datasetId}-${Date.now().toString(36)}`
        await api.issuePermission({
          agreementId: listing.agreementId,
          permissionId: passportId,
          accessScope: listing.useCase === "KYC" ? "ReadOnly" : "Analytics",
        })
        setMessage(`Access Passport issued for ${listing.title}`)
      } else if (listing.governanceStatus === "ConsentPending" && listing.relationship === "recipient") {
        if (!listing.passportId) throw new Error("Missing passport id")
        await api.recordConsent({
          permissionId: listing.passportId,
          consentId: `CONSENT-${listing.passportId}-${Date.now().toString(36)}`,
        })
        setMessage(`Consent recorded — passport now active for ${listing.title}`)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  function primaryAction(listing: CatalogListing): {
    label: string
    disabled: boolean
    hidden: boolean
  } {
    if (listing.governanceStatus === "Active") {
      return { label: "View Passport", disabled: false, hidden: false }
    }
    if (listing.governanceStatus === "Revoked" || listing.governanceStatus === "Expired") {
      return { label: "View History", disabled: false, hidden: false }
    }
    if (listing.relationship === "owner") {
      if (listing.governanceStatus === "ConsentPending") {
        return { label: "Awaiting recipient consent", disabled: true, hidden: false }
      }
      if (listing.governanceStatus === "AgreementActive") {
        return { label: "Issue Access Passport", disabled: false, hidden: false }
      }
      if (listing.governanceStatus === "Available") {
        return { label: "Manage Governance", disabled: true, hidden: false }
      }
      return { label: "Awaiting Partner", disabled: true, hidden: false }
    }
    if (listing.relationship === "recipient") {
      if (listing.governanceStatus === "ProposalPending") {
        return { label: "Accept Agreement", disabled: false, hidden: false }
      }
      if (listing.governanceStatus === "ConsentPending") {
        return { label: "Record Consent", disabled: false, hidden: false }
      }
    }
    if (listing.governanceStatus === "Available") {
      return { label: "Request Access Passport", disabled: false, hidden: false }
    }
    return { label: "In Progress", disabled: true, hidden: false }
  }

  const metrics = useMemo(() => {
    const active = listings.filter((row) => row.governanceStatus === "Active").length
    const pending = listings.filter((row) =>
      ["ProposalPending", "ConsentPending", "AgreementActive"].includes(row.governanceStatus),
    ).length
    const owners = new Set(listings.map((row) => row.ownerHint)).size
    return { total: listings.length, active, pending, owners }
  }, [listings])

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/8 via-card to-accent/5 p-6 md:p-8">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Governed Exchange Catalog
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Externally shared datasets, governed on Canton
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Browse tokenized dataset listings, manage cross-organization access passports,
            and demonstrate compliance without exposing sensitive data on-ledger.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              onClick={seedDemo}
              disabled={seeding}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="size-4" />
              {seeding ? "Loading demo…" : "Load Demo Network"}
            </Button>
            {listings.length > 0 ? (
              <Button render={<Link href="/governance/audit-trail" />} variant="outline">
                View Audit Trail
              </Button>
            ) : null}
          </div>
        </div>
        <div className="pointer-events-none absolute -right-8 -top-8 size-48 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Listed Assets", value: metrics.total, icon: Database },
          { label: "Active Passports", value: metrics.active, icon: IdCard },
          { label: "In Governance", value: metrics.pending, icon: ShieldCheck },
          { label: "Data Owners", value: metrics.owners, icon: Users },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="size-4" />
                <span className="text-xs">{item.label}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
            </div>
          )
        })}
      </div>

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

      {showLocalFilter ? (
        <UseCaseFilterChips value={filter} onChange={setFilter} />
      ) : null}

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 border-dashed p-12 text-center">
          <Database className="size-10 text-muted-foreground/60" />
          <div>
            <p className="font-medium text-foreground">No shared datasets yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Load the demo network to populate KYC, trade finance, and audit scenarios —
              or register a dataset and publish it to the exchange catalog.
            </p>
          </div>
          <Button onClick={seedDemo} disabled={seeding}>
            Load Demo Network
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((listing) => {
            const action = primaryAction(listing)
            const protectionLabel = veilioProtectionLabel(listing)
            const classStyle =
              classStyles[listing.classification] ?? classStyles["Regulated-Financial"]
            const isActive = listing.governanceStatus === "Active"
            const expiryDays = daysUntilExpiry(listing.expiresAt)
            const expiringSoon =
              isActive && expiryDays != null && expiryDays >= 0 && expiryDays <= 7
            const canAccessFile =
              isActive &&
              Boolean(listing.protectedFileName) &&
              Boolean(viewerHint) &&
              (listing.relationship === "owner" || listing.relationship === "recipient")
            const passportHref = listing.passportId
              ? `/governance/passports/${encodeURIComponent(listing.passportId)}`
              : "/governance/passports"

            return (
              <Card
                key={listing.listingId}
                id={`catalog-dataset-${listing.datasetId}`}
                className={cn(
                  "group flex flex-col gap-0 overflow-hidden border-border/80 p-0 shadow-sm transition-all duration-500 hover:shadow-md",
                  highlightDatasetId === listing.datasetId &&
                    "ring-2 ring-primary shadow-lg shadow-primary/20 scale-[1.02]",
                )}
              >
                <div className="border-b border-border/60 bg-muted/20 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {useCaseLabel(listing.useCase)}
                      </p>
                      <h3 className="mt-1 text-base font-semibold leading-snug text-foreground">
                        {listing.title}
                      </h3>
                    </div>
                    <GovernanceStatusBadge
                      status={listing.governanceStatus}
                      perspective={
                        listing.relationship === "owner"
                          ? "owner"
                          : listing.relationship === "recipient"
                            ? "recipient"
                            : undefined
                      }
                      recipientHint={listing.recipientHint}
                    />
                    {expiringSoon ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                        ⚠ {expiryDays}d left
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-5 py-4">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {listing.description}
                  </p>

                  <dl className="mt-4 space-y-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                      <dd className="text-foreground">
                        {listing.ownerDisplayName ?? listing.ownerHint}
                      </dd>
                    </div>
                    {listing.recipientDisplayName ? (
                      <div className="flex items-center gap-2.5">
                        <Users className="size-4 shrink-0 text-muted-foreground" />
                        <dd className="text-muted-foreground">
                          Shared with{" "}
                          <span className="font-medium text-foreground">
                            {listing.recipientDisplayName}
                          </span>
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2.5">
                      <Target className="size-4 shrink-0 text-muted-foreground" />
                      <dd className="text-muted-foreground">{listing.defaultPurpose}</dd>
                    </div>
                    {listing.expiresAt ? (
                      <div className="flex items-center gap-2.5">
                        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                        <dd className="text-muted-foreground">
                          Expires {new Date(listing.expiresAt).toLocaleDateString()}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                        classStyle,
                      )}
                    >
                      {listing.classification}
                    </span>
                    {protectionLabel ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/15 ring-inset">
                        <Lock className="size-3" />
                        {protectionLabel}
                      </span>
                    ) : null}
                    {listing.veilioVaultId ? (
                      <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-600/15 ring-inset dark:bg-violet-950/30 dark:text-violet-200">
                        Vault {listing.veilioVaultId}
                      </span>
                    ) : null}
                    {listing.protectedFileName ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-500/15 ring-inset dark:bg-slate-800 dark:text-slate-200">
                        {listing.protectedFileName.toLowerCase().endsWith(".pdf") ? (
                          <span className="inline-flex items-center gap-1">
                            <FileText className="size-3" />
                            PDF sealed
                          </span>
                        ) : listing.protectedRowCount != null ? (
                          `${listing.protectedRowCount} rows`
                        ) : (
                          "File attached"
                        )}
                        {" · "}
                        {listing.protectedFileName}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/15 ring-inset">
                        No protected file yet
                      </span>
                    )}
                    {listing.onLedger ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20 ring-inset">
                        <ShieldCheck className="size-3" />
                        On Canton
                      </span>
                    ) : null}
                    {listing.visibility === "private" ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-500/15 ring-inset dark:bg-slate-800 dark:text-slate-200">
                        Private
                      </span>
                    ) : listing.visibility === "direct" ? (
                      <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-600/15 ring-inset">
                        Direct invite
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-blue-600/15 ring-inset">
                        Exchange catalog
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    {canAccessFile && viewerHint ? (
                      <DatasetAccessButtons
                        datasetId={listing.datasetId}
                        datasetTitle={listing.title}
                        requesterHint={viewerHint}
                        size="sm"
                      />
                    ) : null}
                    {!action.hidden && isActive ? (
                      <Button
                        render={<Link href={passportHref} />}
                        variant="outline"
                        size="sm"
                        className={canAccessFile ? "" : "flex-1"}
                      >
                        {action.label}
                      </Button>
                    ) : !action.hidden ? (
                      <>
                        <Button
                          onClick={() => runAction(listing)}
                          disabled={action.disabled || busyId === listing.listingId}
                          size="sm"
                          className="flex-1"
                        >
                          {busyId === listing.listingId ? "Working…" : action.label}
                        </Button>
                        {listing.governanceStatus === "ProposalPending" &&
                        listing.relationship === "recipient" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === listing.listingId}
                            onClick={() => rejectProposal(listing)}
                          >
                            Reject
                          </Button>
                        ) : null}
                        {listing.governanceStatus === "ConsentPending" &&
                        listing.relationship === "recipient" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === listing.listingId}
                            onClick={() => denyConsent(listing)}
                          >
                            Deny
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {listing.passportId && !isActive ? (
                      <Button
                        render={<Link href={passportHref} />}
                        variant="ghost"
                        size="sm"
                      >
                        Details
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

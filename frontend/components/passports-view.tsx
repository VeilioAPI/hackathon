"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Ban,
  CheckCircle2,
  Circle,
  Database,
  Target,
  ShieldCheck,
  CalendarDays,
  ListChecks,
} from "lucide-react"
import { StatusBadge } from "@/components/status-badges"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { usePartnerContext } from "@/contexts/partner-context"
import { api } from "@/lib/api"
import { mapAccessPassports, type Passport } from "@/lib/view-models"

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Database
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  )
}

export function PassportsView({
  viewerHint,
  useCaseFilter,
}: {
  viewerHint?: string
  useCaseFilter?: string
}) {
  const [agreementIdFilter, setAgreementIdFilter] = useState<string | null>(null)
  const [passports, setPassports] = useState<Passport[]>([])
  const [selected, setSelected] = useState<Passport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { viewerHint: contextViewerHint } = usePartnerContext()
  const effectiveViewerHint = viewerHint ?? contextViewerHint

  async function load() {
    const result = await api.passports(
      useCaseFilter ? { useCase: useCaseFilter } : undefined,
    )
    const filtered = viewerHint
      ? result.filter(
          (passport) =>
            passport.ownerHint === viewerHint || passport.recipientHint === viewerHint,
        )
      : result
    setPassports(mapAccessPassports(filtered))
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      setAgreementIdFilter(params.get("agreementId"))
    }

    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load passports"),
    )
  }, [viewerHint, useCaseFilter])

  const rows = useMemo(() => {
    let result = passports
    if (agreementIdFilter) {
      result = result.filter((passport) => passport.agreementId === agreementIdFilter)
    }
    return result
  }, [agreementIdFilter, passports])

  async function revoke(passport: Passport) {
    setBusyId(passport.permissionId)
    setError(null)
    setMessage(null)
    try {
      await api.revokePermission({
        permissionId: passport.permissionId,
        revocationId: `REV-${passport.permissionId}-${Date.now().toString(36)}`,
        reason: "Revoked from Access Passports",
      })
      setMessage(`Access revoked: ${passport.permissionId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revocation failed")
    } finally {
      setBusyId(null)
    }
  }

  async function consent(passport: Passport) {
    setBusyId(passport.permissionId)
    setError(null)
    setMessage(null)
    try {
      await api.recordConsent({
        permissionId: passport.permissionId,
        consentId: `CONSENT-${passport.permissionId}-${Date.now().toString(36)}`,
      })
      setMessage(`Consent recorded: ${passport.permissionId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consent failed")
    } finally {
      setBusyId(null)
    }
  }

  async function deny(passport: Passport) {
    setBusyId(passport.permissionId)
    setError(null)
    setMessage(null)
    try {
      await api.denyConsent({
        permissionId: passport.permissionId,
        consentId: `DENY-${passport.permissionId}-${Date.now().toString(36)}`,
        reason: "Consent denied by recipient",
      })
      setMessage(`Consent denied: ${passport.permissionId}`)
      await load()
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deny consent failed")
    } finally {
      setBusyId(null)
    }
  }

  async function checkExpiration(passport: Passport) {
    setBusyId(passport.permissionId)
    setError(null)
    setMessage(null)
    try {
      const result = await api.checkPermissionExpiration(passport.permissionId)
      setMessage(`Expiration check: ${result.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Expiration check failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
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

      <Card className="pt-0 gap-0 overflow-hidden">
        <CardHeader className="border-b border-border py-4">
          <CardTitle>Access Passports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Passport ID</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Owner Org</TableHead>
                <TableHead>Recipient Org</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-xs font-medium text-primary">
                    <Link
                      href={`/governance/passports/${encodeURIComponent(p.id)}`}
                      onClick={(event) => event.stopPropagation()}
                      className="underline-offset-2 hover:underline"
                    >
                      {p.id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {p.dataset}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.owner}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.recipient}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.purpose}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.validUntil}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="gap-0 overflow-y-auto p-0">
          {selected && (
            <>
              <DialogHeader className="border-b border-border bg-muted/40 p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-primary">
                    {selected.id}
                  </span>
                  <StatusBadge status={selected.status} />
                </div>
                <DialogTitle className="text-balance">{selected.dataset}</DialogTitle>
                <DialogDescription>
                  Governance passport controlling access to this dataset.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 p-6">
                <div className="divide-y divide-border">
                  <DetailRow icon={Database} label="Dataset Information">
                    {selected.dataset} · Owned by {selected.owner}
                  </DetailRow>
                  <DetailRow icon={Target} label="Purpose of Use">
                    {selected.purpose}
                  </DetailRow>
                  <DetailRow icon={ShieldCheck} label="Consent Status">
                    <span
                      className={cn(
                        selected.consent === "Granted" && "text-emerald-600",
                        selected.consent === "Withdrawn" && "text-red-600",
                        selected.consent === "Pending" && "text-amber-600",
                      )}
                    >
                      {selected.consent}
                    </span>
                  </DetailRow>
                  <DetailRow icon={ListChecks} label="Access Scope">
                    <div className="flex flex-wrap gap-1.5">
                      {selected.scope.map((s) => (
                        <span
                          key={s}
                          className="rounded-md bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </DetailRow>
                  <DetailRow icon={CalendarDays} label="Issue / Expiration">
                    {selected.issueDate} — {selected.validUntil}
                  </DetailRow>
                </div>

                <div>
                  <p className="mb-3 text-sm font-semibold text-foreground">
                    Governance Timeline
                  </p>
                  <ol className="relative space-y-1">
                    {selected.timeline.map((t, i) => {
                      const isLast = i === selected.timeline.length - 1
                      return (
                        <li key={t.stage} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            {t.done ? (
                              t.stage === "Revoked" ? (
                                <Ban className="size-4 text-red-500" />
                              ) : (
                                <CheckCircle2 className="size-4 text-primary" />
                              )
                            ) : (
                              <Circle className="size-4 text-muted-foreground/40" />
                            )}
                            {!isLast && (
                              <span
                                className={cn(
                                  "my-0.5 w-px flex-1",
                                  t.done ? "bg-primary/30" : "bg-border",
                                )}
                              />
                            )}
                          </div>
                          <div className={cn("pb-4", !t.done && "opacity-50")}>
                            <p className="text-sm font-medium text-foreground">
                              {t.stage}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t.date} {t.done && `· ${t.actor}`}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>

                {(() => {
                  const isOwner =
                    !!effectiveViewerHint &&
                    selected.ownerHint === effectiveViewerHint
                  const isRecipient =
                    !!effectiveViewerHint &&
                    selected.recipientHint === effectiveViewerHint

                  return (
                    <>
                      {isOwner ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                          <p className="text-sm font-medium text-foreground">
                            Revocation Controls
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            As the dataset owner, you can immediately terminate this
                            recipient&apos;s access. This action is logged to the audit trail.
                          </p>
                          <Button
                            variant="destructive"
                            className="mt-3 w-full gap-1.5"
                            disabled={
                              selected.status === "Revoked" ||
                              busyId === selected.permissionId
                            }
                            onClick={() => revoke(selected)}
                          >
                            <Ban className="size-4" />
                            {selected.status === "Revoked"
                              ? "Access Revoked"
                              : "Revoke Access"}
                          </Button>
                          {selected.status === "Active" ? (
                            <Button
                              variant="outline"
                              className="mt-2 w-full"
                              disabled={busyId === selected.permissionId}
                              onClick={() => checkExpiration(selected)}
                            >
                              Check expiration on Canton
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {isRecipient && selected.status === "Pending" ? (
                        <div className="rounded-lg border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">
                            Consent Required
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            As the recipient, approve or deny access before the passport
                            becomes active.
                          </p>
                          <div className="mt-3 flex flex-col gap-2">
                            <Button
                              variant="outline"
                              className="w-full"
                              disabled={busyId === selected.permissionId}
                              onClick={() => consent(selected)}
                            >
                              Record Consent
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full text-destructive hover:text-destructive"
                              disabled={busyId === selected.permissionId}
                              onClick={() => deny(selected)}
                            >
                              Deny Consent
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {isRecipient && selected.status === "Active" ? (
                        <div className="rounded-lg border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">
                            Recipient view
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            You have been granted access to this dataset. Only{" "}
                            <span className="font-medium text-foreground">
                              {selected.owner}
                            </span>{" "}
                            can revoke this passport.
                          </p>
                        </div>
                      ) : null}
                    </>
                  )
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

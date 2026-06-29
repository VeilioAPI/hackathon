"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Ban, CheckCircle2, Circle, RefreshCw } from "lucide-react"
import { Shell } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { DatasetAccessButtons } from "@/components/dataset-access-sheet"
import { usePartnerContext } from "@/contexts/partner-context"
import { api, type PassportDetail } from "@/lib/api"

export default function PassportDetailPage() {
  const params = useParams<{ passportId: string }>()
  const router = useRouter()
  const passportId = params?.passportId ?? ""
  const { viewerHint } = usePartnerContext()
  const [passport, setPassport] = useState<PassportDetail | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!passportId) return
    setPassport(await api.passport(passportId))
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load passport"),
    )
  }, [passportId])

  async function revoke() {
    if (!passport) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.revokePermission({
        permissionId: passport.passportId,
        revocationId: `REV-${passport.passportId}-${Date.now().toString(36)}`,
        reason: "Revoked from passport detail",
      })
      setMessage(`Access revoked for ${passport.passportId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revocation failed")
    } finally {
      setBusy(false)
    }
  }

  async function denyConsent() {
    if (!passport) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.denyConsent({
        permissionId: passport.passportId,
        consentId: `DENY-${passport.passportId}-${Date.now().toString(36)}`,
        reason: "Consent denied from passport detail",
      })
      setMessage(`Consent denied for ${passport.passportId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deny consent failed")
    } finally {
      setBusy(false)
    }
  }

  async function grantConsent() {
    if (!passport) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.recordConsent({
        permissionId: passport.passportId,
        consentId: `CONSENT-${passport.passportId}-${Date.now().toString(36)}`,
      })
      setMessage(`Consent recorded — passport ${passport.passportId} is now active`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consent failed")
    } finally {
      setBusy(false)
    }
  }

  const isOwner = passport ? passport.ownerHint === viewerHint : false
  const isRecipient = passport ? passport.recipientHint === viewerHint : false

  async function checkExpiration() {
    if (!passport) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api.checkPermissionExpiration(passport.passportId)
      setMessage(`Canton expiration check: ${result.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Expiration check failed")
    } finally {
      setBusy(false)
    }
  }

  async function renew() {
    if (!passport) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api.renewPassport(passport.passportId, {
        reason: "Access Passport renewed by owner",
      })
      setMessage(result.message)
      router.push(`/governance/passports/${encodeURIComponent(result.newPermissionId)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Renewal failed")
    } finally {
      setBusy(false)
    }
  }

  const daysUntilExpiry =
    passport && passport.expiresAt
      ? Math.ceil(
          (new Date(passport.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
      : null
  const canRenew =
    passport &&
    isOwner &&
    (passport.status === "Active" ||
      passport.status === "Expired" ||
      (daysUntilExpiry != null && daysUntilExpiry <= 14))

  return (
    <Shell
      title={`Access Passport ${passportId}`}
      subtitle="Purpose-bound, time-limited, revocable access proof on Canton"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button render={<Link href="/governance/passports" />} variant="outline" size="sm">
            Back to Passports
          </Button>
          <Button render={<Link href="/demo" />} variant="outline" size="sm">
            Back to Jury Demo
          </Button>
          {passport ? (
            <>
              {passport.status === "PendingConsent" && isRecipient ? (
                <>
                  <Button size="sm" onClick={grantConsent} disabled={busy}>
                    Record Consent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={denyConsent}
                    disabled={busy}
                  >
                    Deny Consent
                  </Button>
                </>
              ) : null}
              {passport.status === "Active" && isOwner ? (
                <Button variant="outline" size="sm" onClick={checkExpiration} disabled={busy}>
                  Check Expiration
                </Button>
              ) : null}
              {canRenew ? (
                <Button variant="outline" size="sm" onClick={renew} disabled={busy}>
                  <RefreshCw className="mr-1 size-3.5" />
                  Renew Passport
                </Button>
              ) : null}
              {isOwner ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={revoke}
                  disabled={busy || passport.status === "Revoked"}
                >
                  {passport.status === "Revoked" ? "Already Revoked" : "Revoke Access"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>

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

        {passport ? (
          <>
            {passport.status === "Active" && viewerHint ? (
              <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-3 text-base font-semibold">Protected file access</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Preview or download the dataset file — gated by this active Access Passport.
                </p>
                <div className="flex flex-wrap gap-2">
                  <DatasetAccessButtons
                    datasetId={passport.datasetId}
                    datasetTitle={passport.datasetTitle ?? passport.datasetId}
                    requesterHint={viewerHint}
                  />
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p><strong>Dataset:</strong> {passport.datasetTitle ?? passport.datasetId}</p>
                <p><strong>Use case:</strong> {passport.useCase ?? "General"}</p>
                <p><strong>Owner:</strong> {passport.ownerDisplayName ?? passport.ownerHint}</p>
                <p><strong>Recipient:</strong> {passport.recipientDisplayName ?? passport.recipientHint}</p>
                <p><strong>Purpose:</strong> {passport.purpose}</p>
                <p><strong>Scope:</strong> {passport.accessScope}</p>
                <p><strong>Status:</strong> {passport.status}</p>
                <p><strong>Issued:</strong> {new Date(passport.issuedAt).toLocaleString()}</p>
                <p><strong>Expires:</strong> {new Date(passport.expiresAt).toLocaleString()}
                  {daysUntilExpiry != null && passport.status === "Active" ? (
                    <span className="ml-2 text-muted-foreground">
                      ({daysUntilExpiry <= 0 ? "expired" : `${daysUntilExpiry}d left`})
                    </span>
                  ) : null}
                </p>
                <p><strong>Permission contract:</strong> <code>{passport.permissionContractId.slice(0, 22)}...</code></p>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-base font-semibold">Governance timeline proof</h2>
              <ol className="space-y-2">
                {passport.timeline.map((event, index) => (
                  <li key={`${event.contractId}-${index}`} className="rounded border border-border/70 p-3 text-sm">
                    <div className="flex items-start gap-2">
                      {event.action.includes("Revoked") ? (
                        <Ban className="mt-0.5 size-4 text-red-500" />
                      ) : event.action.includes("Denied") ? (
                        <Circle className="mt-0.5 size-4 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{event.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()} · {event.actorHint ?? event.actor}
                        </p>
                        {event.details ? (
                          <p className="mt-1 text-xs text-muted-foreground">{event.details}</p>
                        ) : null}
                        {event.txId ? (
                          <p className="mt-1 truncate text-xs">
                            <strong>Tx:</strong> <code title={event.txId}>{event.txId}</code>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : null}
      </div>
    </Shell>
  )
}

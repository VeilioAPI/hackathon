"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Download, FileCheck2, IdCard, Lock, ScrollText, ShieldCheck } from "lucide-react"
import { Shell } from "@/components/shell"
import { KpiCard } from "@/components/kpi-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  api,
  type AccessPassport,
  type AuditEvent,
  type DatasetUpload,
  type ExchangeSummary,
  type FileAccessLog,
} from "@/lib/api"
import { mapAuditEvents } from "@/lib/view-models"

export default function CompliancePage() {
  const [summary, setSummary] = useState<ExchangeSummary | null>(null)
  const [passports, setPassports] = useState<AccessPassport[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [fileAccess, setFileAccess] = useState<FileAccessLog[]>([])
  const [uploads, setUploads] = useState<DatasetUpload[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [sweeping, setSweeping] = useState(false)

  useEffect(() => {
    Promise.all([
      api.exchangeSummary(),
      api.passports(),
      api.audit(),
      api.fileAccessLogs(50),
      api.datasetUploads(),
    ])
      .then(([summaryResult, passportRows, auditRows, fileRows, uploadRows]) => {
        setSummary(summaryResult)
        setPassports(passportRows)
        setAudit(auditRows)
        setFileAccess(fileRows)
        setUploads(uploadRows.filter((row) => row.isCurrent))
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load compliance posture"),
      )
  }, [])

  const activeConsents = useMemo(
    () => passports.filter((passport) => passport.status === "Active").length,
    [passports],
  )
  const pendingConsents = useMemo(
    () => passports.filter((passport) => passport.status === "PendingConsent").length,
    [passports],
  )
  const revoked = useMemo(
    () => passports.filter((passport) => passport.status === "Revoked").length,
    [passports],
  )
  const recentAudit = useMemo(() => mapAuditEvents(audit).slice(0, 6), [audit])
  const auditWithTx = useMemo(
    () => audit.filter((event) => Boolean(event.txId)).length,
    [audit],
  )
  const deniedFileAccess = useMemo(
    () => fileAccess.filter((row) => row.outcome === "denied").length,
    [fileAccess],
  )
  const protectedUploads = useMemo(
    () =>
      uploads.filter(
        (row) =>
          row.veilioVaultId ||
          (row.piiFieldsTokenized ?? 0) > 0 ||
          (row.tokenizedColumnNames?.length ?? 0) > 0,
      ),
    [uploads],
  )
  const tokenizedColumnTotal = useMemo(
    () =>
      uploads.reduce((sum, row) => sum + (row.tokenizedColumnNames?.length ?? 0), 0),
    [uploads],
  )
  const governedActiveShares = useMemo(
    () => passports.filter((passport) => passport.status === "Active").length,
    [passports],
  )

  async function sweepExpired() {
    setSweeping(true)
    setError(null)
    try {
      const result = await api.sweepExpiredPermissions()
      setMessage(
        `Expiration sweep: ${result.expired.length} expired of ${result.scanned} scanned` +
          (result.errors.length ? ` · ${result.errors.length} error(s)` : ""),
      )
      const [summaryResult, passportRows] = await Promise.all([
        api.exchangeSummary(),
        api.passports(),
      ])
      setSummary(summaryResult)
      setPassports(passportRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Expiration sweep failed")
    } finally {
      setSweeping(false)
    }
  }

  async function exportPack() {
    setExporting(true)
    setError(null)
    try {
      await api.exportCompliancePack()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <Shell
      title="Compliance posture"
      subtitle="Live governance evidence from Canton — no simulated scores"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportPack} disabled={exporting} className="gap-2">
            <Download className="size-4" />
            {exporting ? "Exporting…" : "Export compliance pack (JSON)"}
          </Button>
          <Button
            variant="outline"
            onClick={sweepExpired}
            disabled={sweeping}
            className="gap-2"
          >
            <ShieldCheck className="size-4" />
            {sweeping ? "Sweeping…" : "Sweep expired passports"}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Includes Canton governance, Veilio Vault protection metadata, governed shares, and file
            access logs (schema v2).
          </p>
          <Button variant="outline" render={<Link href="/governance/audit-trail" />}>
            Full audit trail
          </Button>
          <Button variant="outline" render={<Link href="/exchange/my-data" />}>
            Who has access to my data?
          </Button>
          <Button variant="outline" render={<Link href="/insights" />}>
            Insights & exposure
          </Button>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Active consents"
            value={summary ? String(activeConsents) : "—"}
            icon={FileCheck2}
            tone="accent"
          />
          <KpiCard
            label="Veilio-protected files"
            value={String(protectedUploads.length)}
            icon={Lock}
            tone="primary"
          />
          <KpiCard
            label="Tokenized columns"
            value={String(tokenizedColumnTotal)}
            icon={ShieldCheck}
            tone="accent"
          />
          <KpiCard
            label="Governed active shares"
            value={String(governedActiveShares)}
            icon={IdCard}
            tone="primary"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Pending consent"
            value={summary ? String(pendingConsents) : "—"}
            icon={IdCard}
            tone="amber"
          />
          <KpiCard
            label="Revoked (ledger)"
            value={summary ? String(revoked) : "—"}
            icon={ShieldCheck}
            tone="primary"
          />
          <KpiCard
            label="Audit events (tx proof)"
            value={summary ? String(auditWithTx) : "—"}
            icon={ScrollText}
            tone="primary"
          />
          <KpiCard
            label="Denied file access"
            value={String(deniedFileAccess)}
            icon={FileCheck2}
            tone={deniedFileAccess > 0 ? "amber" : "accent"}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Governance coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{summary?.activePassports ?? 0}</span>{" "}
                active Access Passports across{" "}
                <span className="font-medium text-foreground">{summary?.partnerCount ?? 0}</span>{" "}
                partners.
              </p>
              <p>
                <span className="font-medium text-foreground">{summary?.expiringWithin7Days ?? 0}</span>{" "}
                passports expire within 7 days — review renewals or revoke.
              </p>
              <p>
                <span className="font-medium text-foreground">{summary?.revokedLast30Days ?? 0}</span>{" "}
                revocations recorded in the last 30 days.
              </p>
              <p>
                <span className="font-medium text-foreground">{deniedFileAccess}</span> denied file
                access attempts logged (preview/download).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regulatory principles (PoC)</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✓ No PII stored on Canton — governance metadata only</li>
                <li>✓ Purpose-bound Access Passports with expiration</li>
                <li>✓ Immutable revocation and consent events</li>
                <li>✓ Veilio Vault tokenization before external sharing</li>
                <li>✓ Off-ledger file access audit trail</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Export pack contents</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✓ Privacy model (PII off-ledger, governance on Canton)</li>
                <li>✓ Veilio Vault protection per dataset (vault ID, tokenized columns)</li>
                <li>✓ Governed shares — passport ↔ protected file cross-reference</li>
                <li>✓ Exchange catalog snapshot + Access Passports</li>
                <li>✓ Consents, revocations, Canton audit trail with tx IDs</li>
                <li>✓ Off-ledger file access log (preview/download)</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4" />
              Veilio data protection (off-ledger)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {protectedUploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Veilio-protected files yet. Deposit a dataset from{" "}
                <Link href="/datasets" className="font-medium text-primary underline">
                  Datasets
                </Link>{" "}
                — column tokenization metadata will appear here and in the export pack.
              </p>
            ) : (
              <ol className="space-y-2">
                {protectedUploads.slice(0, 10).map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      {row.datasetId} · {row.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vault {row.veilioVaultId ?? "—"}
                      {row.piiFieldsTokenized != null
                        ? ` · ${row.piiFieldsTokenized} PII field(s) tokenized`
                        : ""}
                      {row.tokenizedColumnNames?.length
                        ? ` · columns: ${row.tokenizedColumnNames.join(", ")}`
                        : ""}
                      {row.mimeType.toLowerCase().includes("pdf") ? " · PDF sealed" : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent file access (off-ledger)</CardTitle>
          </CardHeader>
          <CardContent>
            {fileAccess.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No file access logged yet. Preview or download a governed dataset from the{" "}
                <Link href="/exchange" className="font-medium text-primary underline">
                  Exchange catalog
                </Link>
                .
              </p>
            ) : (
              <ol className="space-y-2">
                {fileAccess.slice(0, 8).map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      {row.action === "prepare_for_llm" ? "LLM prepare" : row.action} · {row.datasetId} ·{" "}
                      <span
                        className={
                          row.outcome === "denied" ? "text-destructive" : "text-emerald-600"
                        }
                      >
                        {row.outcome}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()} · {row.requesterHint}
                      {row.passportId ? ` · passport ${row.passportId}` : ""}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent governance events</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No audit events yet.{" "}
                <Link href="/demo" className="font-medium text-primary underline">
                  Run the jury demo
                </Link>{" "}
                to populate Canton evidence.
              </p>
            ) : (
              <ol className="space-y-2">
                {recentAudit.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-foreground">{event.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.timestamp} · {event.actor}
                      {event.txId ? ` · tx ${event.txId.slice(0, 12)}…` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}

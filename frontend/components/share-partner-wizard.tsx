"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Share2,
  ShieldCheck,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  api,
  type BankRecord,
  type DatasetAnalyzeResult,
  type DatasetColumnAnalysis,
} from "@/lib/api"

const STEPS = [
  { id: 1, label: "File", icon: Upload },
  { id: 2, label: "Protect columns", icon: Lock },
  { id: 3, label: "Partner & purpose", icon: Share2 },
  { id: 4, label: "Visibility", icon: ShieldCheck },
  { id: 5, label: "Deposit", icon: CheckCircle2 },
] as const

function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
}

function formatFromFile(file: File): "CSV" | "JSON" | "PDF" {
  const ext = file.name.split(".").at(-1)?.toLowerCase()
  if (ext === "json" || file.type.includes("json")) return "JSON"
  if (ext === "pdf" || file.type.includes("pdf")) return "PDF"
  return "CSV"
}

function isTabularAnalysis(
  result: DatasetAnalyzeResult,
): result is Extract<DatasetAnalyzeResult, { columns: DatasetColumnAnalysis[] }> {
  return result.format === "CSV" || result.format === "JSON"
}

export function SharePartnerWizard({
  banks,
  ownerHint,
  onOwnerHintChange,
  onDeposited,
}: {
  banks: BankRecord[]
  ownerHint: string
  onOwnerHintChange: (hint: string) => void
  onDeposited: (message: string) => void
}) {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [classification, setClassification] = useState("Regulated-Financial")
  const [shareScope, setShareScope] = useState<"private" | "network" | "direct">("direct")
  const [invitedRecipientHint, setInvitedRecipientHint] = useState("")
  const [sharePurpose, setSharePurpose] = useState("Regulated data sharing")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<DatasetAnalyzeResult | null>(null)
  const [columnPolicy, setColumnPolicy] = useState<Record<string, boolean>>({})

  const fileFormat = file ? formatFromFile(file) : null
  const isPdf = fileFormat === "PDF"

  const recipients = useMemo(
    () => banks.filter((bank) => bank.hint !== ownerHint),
    [banks, ownerHint],
  )

  useEffect(() => {
    if (recipients.length > 0 && !recipients.some((bank) => bank.hint === invitedRecipientHint)) {
      setInvitedRecipientHint(recipients[0].hint)
    }
  }, [recipients, invitedRecipientHint])

  const loadAnalysis = useCallback(async (nextFile: File) => {
    setAnalyzing(true)
    setError(null)
    try {
      const result = await api.analyzeDatasetFile(nextFile)
      setAnalysis(result)
      if (isTabularAnalysis(result)) {
        const policy: Record<string, boolean> = {}
        for (const column of result.columns) {
          policy[column.name] = column.suggestedTokenize
        }
        setColumnPolicy(policy)
      } else {
        setColumnPolicy({})
      }
    } catch (err) {
      setAnalysis(null)
      setColumnPolicy({})
      setError(err instanceof Error ? err.message : "Failed to analyze file")
    } finally {
      setAnalyzing(false)
    }
  }, [])

  function onFileChange(next: File | null) {
    setFile(next)
    setAnalysis(null)
    setColumnPolicy({})
    if (next && !title) {
      setTitle(titleFromFileName(next.name))
    }
  }

  useEffect(() => {
    if (step === 2 && file && !isPdf && !analysis && !analyzing) {
      loadAnalysis(file)
    }
  }, [step, file, isPdf, analysis, analyzing, loadAnalysis])

  const tokenizeColumnCount = useMemo(
    () => Object.values(columnPolicy).filter(Boolean).length,
    [columnPolicy],
  )

  const canStep1 = Boolean(file)
  const canStep2 =
    isPdf ||
    (analysis !== null && isTabularAnalysis(analysis) && analysis.columns.length > 0)
  const canStep3 = shareScope !== "direct" || Boolean(invitedRecipientHint)
  const canStep4 = Boolean(ownerHint && banks.some((b) => b.hint === ownerHint))
  const canDeposit = canStep1 && canStep3 && canStep4

  function goNext() {
    setStep((value) => {
      if (value === 1 && file && formatFromFile(file) === "PDF") return 3
      return Math.min(5, value + 1)
    })
  }

  function goBack() {
    setStep((value) => {
      if (value === 3 && file && formatFromFile(file) === "PDF") return 1
      return Math.max(1, value - 1)
    })
  }

  function setAllColumns(tokenize: boolean) {
    if (!analysis || !isTabularAnalysis(analysis)) return
    const next: Record<string, boolean> = {}
    for (const column of analysis.columns) {
      next[column.name] = tokenize
    }
    setColumnPolicy(next)
  }

  async function deposit() {
    if (!file || !ownerHint) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.depositDataset({
        ownerHint,
        file,
        title: title || undefined,
        description: description || undefined,
        classification,
        shareScope,
        invitedRecipientHint: shareScope === "direct" ? invitedRecipientHint : undefined,
        sharePurpose: shareScope === "direct" ? sharePurpose : undefined,
        tokenizeColumns: isPdf ? undefined : columnPolicy,
      })
      const visibilityLabel =
        result.visibility === "network"
          ? "visible to all partners on Exchange"
          : result.visibility === "direct"
            ? `shared directly with ${result.share?.recipientHint ?? invitedRecipientHint}`
            : "private to your organization only"
      const columnNote =
        result.veilio?.tokenizedColumnNames?.length
          ? ` Columns protected: ${result.veilio.tokenizedColumnNames.join(", ")}.`
          : ""
      onDeposited(
        `Dataset deposited: ${result.fileName} → ${result.datasetId}` +
          (result.rowCount != null ? ` (${result.rowCount} rows)` : " (PDF document)") +
          `. ${visibilityLabel}.` +
          (result.veilio
            ? ` Veilio Vault ${result.veilio.vaultId}: ${result.veilio.piiFieldsTokenized} cell(s) tokenized.${columnNote}`
            : "") +
          (result.share
            ? ` Access Passport ${result.share.passportId} issued — recipient must record consent.`
            : ""),
      )
      setStep(1)
      setFile(null)
      setTitle("")
      setDescription("")
      setAnalysis(null)
      setColumnPolicy({})
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="border-b border-border/60 bg-primary/5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Share2 className="size-5" />
          </span>
          <div>
            <CardTitle>Share with partner — guided deposit</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a dataset, choose which columns to tokenize in Veilio Vault, then govern
              access on Canton.
            </p>
          </div>
        </div>
        <ol className="mt-4 flex flex-wrap gap-2">
          {STEPS.map((item) => {
            const Icon = item.icon
            const active = step === item.id
            const done = step > item.id
            const skipped = item.id === 2 && isPdf
            return (
              <li
                key={item.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  skipped && "opacity-40",
                  done && "bg-emerald-100 text-emerald-800",
                  active && !done && "bg-primary/15 text-primary",
                  !active && !done && "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {item.id}. {item.label}
              </li>
            )
          })}
        </ol>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {banks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-amber-300/50 bg-amber-50/50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            No partner organization yet.{" "}
            <Link href="/partners" className="font-medium underline">
              Add a partner
            </Link>{" "}
            or{" "}
            <Link href="/exchange" className="font-medium underline">
              load the demo network
            </Link>{" "}
            before depositing a dataset.
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-8 transition-colors hover:border-primary/40 hover:bg-muted/40">
              <FileSpreadsheet className="size-8 text-muted-foreground" />
              {file ? (
                <>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFromFile(file)} · {(file.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">
                    Drop CSV, JSON, or PDF here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CSV/JSON: choose columns to tokenize next step
                  </p>
                </>
              )}
              <input
                type="file"
                accept=".csv,.json,.pdf,text/csv,application/json,application/pdf"
                className="sr-only"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Auto-filled from file name"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            {isPdf ? (
              <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                <p className="font-medium text-foreground">PDF sealed in Veilio Vault</p>
                <p className="mt-2 text-muted-foreground">
                  PDF documents are stored as sealed files. Column-level tokenization applies to
                  CSV and JSON uploads. Inline PDF text tokenization is planned with the Veilio API.
                </p>
              </div>
            ) : analyzing ? (
              <p className="text-sm text-muted-foreground">Analyzing columns with Veilio…</p>
            ) : analysis && isTabularAnalysis(analysis) ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {analysis.rowCount} row(s) · {analysis.format} ·{" "}
                    <span className="font-medium text-foreground">
                      {tokenizeColumnCount} column(s) will be tokenized
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setAllColumns(true)}
                    >
                      Tokenize suggested
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setAllColumns(false)}
                    >
                      Clear all
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                        <th className="px-3 py-2">Tokenize</th>
                        <th className="px-3 py-2">Column</th>
                        <th className="px-3 py-2">Detection</th>
                        <th className="px-3 py-2">Sample</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.columns.map((column) => (
                        <tr key={column.name} className="border-b border-border/60">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={columnPolicy[column.name] ?? false}
                              onChange={(event) =>
                                setColumnPolicy((prev) => ({
                                  ...prev,
                                  [column.name]: event.target.checked,
                                }))
                              }
                              className="size-4 rounded border-input"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{column.name}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {column.reason}
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                            {column.sampleValues.join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {analysis.previewRows.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Protected preview (first rows)</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[480px] text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                            {analysis.columns.map((column) => (
                              <th key={column.name} className="px-2 py-1.5 whitespace-nowrap">
                                {column.name}
                                {columnPolicy[column.name] ? (
                                  <span className="ml-1 text-emerald-600">· TOK</span>
                                ) : null}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.previewRows.map((row, index) => (
                            <tr key={index} className="border-b border-border/60">
                              {analysis.columns.map((column) => (
                                <td
                                  key={column.name}
                                  className="max-w-[140px] truncate px-2 py-1.5 font-mono text-muted-foreground"
                                  title={row[column.name]}
                                >
                                  {columnPolicy[column.name] && row[column.name]
                                    ? `TOK_${row[column.name].slice(0, 6)}…`
                                    : row[column.name] || "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Partners only receive the protected version (TOK_* placeholders for
                      tokenized columns).
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Partners will only receive the protected version (TOK_* placeholders for
                    tokenized columns).
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-destructive">
                Could not analyze this file. Go back and choose a valid CSV or JSON.
              </p>
            )}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Owner organization</label>
              <select
                value={ownerHint}
                onChange={(event) => onOwnerHintChange(event.target.value)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                {banks.map((bank) => (
                  <option key={bank.hint} value={bank.hint}>
                    {bank.displayName} ({bank.hint})
                  </option>
                ))}
              </select>
            </div>
            {shareScope === "direct" ? (
              <>
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">Recipient partner</label>
                  <select
                    value={invitedRecipientHint}
                    onChange={(event) => setInvitedRecipientHint(event.target.value)}
                    className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                  >
                    {recipients.map((bank) => (
                      <option key={bank.hint} value={bank.hint}>
                        {bank.displayName} ({bank.hint})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">Authorized purpose</label>
                  <input
                    value={sharePurpose}
                    onChange={(event) => setSharePurpose(event.target.value)}
                    className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                  />
                </div>
              </>
            ) : null}
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Description (optional)</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                className="rounded-md border border-input bg-card px-3 py-2 text-sm"
                placeholder="Business context for governance"
              />
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="grid gap-2 md:max-w-xs">
              <label className="text-sm text-muted-foreground">Classification</label>
              <select
                value={classification}
                onChange={(event) => setClassification(event.target.value)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="Regulated-Financial">Regulated-Financial</option>
                <option value="Trade-Finance">Trade-Finance</option>
                <option value="Confidential">Confidential</option>
                <option value="Internal">Internal</option>
              </select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Who can discover this dataset?</p>
              {[
                {
                  id: "direct" as const,
                  title: "Direct share — one specific partner",
                  detail: "Recommended for jury demos. Passport issued immediately.",
                },
                {
                  id: "network" as const,
                  title: "Exchange catalog — all partners",
                  detail: "Metadata visible to every partner. They request access.",
                },
                {
                  id: "private" as const,
                  title: "Private — my organization only",
                  detail: "Hidden from Exchange until you share later.",
                },
              ].map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3",
                    shareScope === option.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card",
                  )}
                >
                  <input
                    type="radio"
                    name="wizardShareScope"
                    checked={shareScope === option.id}
                    onChange={() => setShareScope(option.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
            <p className="font-medium text-foreground">Review before deposit</p>
            <dl className="space-y-1.5 text-muted-foreground">
              <div>
                <dt className="inline font-medium text-foreground">File: </dt>
                <dd className="inline">{file?.name}</dd>
              </div>
              {!isPdf ? (
                <div>
                  <dt className="inline font-medium text-foreground">Columns tokenized: </dt>
                  <dd className="inline">
                    {tokenizeColumnCount > 0
                      ? Object.entries(columnPolicy)
                          .filter(([, on]) => on)
                          .map(([name]) => name)
                          .join(", ")
                      : "None — raw values kept (not recommended for PII)"}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="inline font-medium text-foreground">Owner: </dt>
                <dd className="inline">{ownerHint}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Visibility: </dt>
                <dd className="inline">{shareScope}</dd>
              </div>
              {shareScope === "direct" ? (
                <div>
                  <dt className="inline font-medium text-foreground">Recipient: </dt>
                  <dd className="inline">{invitedRecipientHint}</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-xs">
              Veilio Vault stores the protected file off-ledger. Canton records governance metadata
              only.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-between gap-3 pt-2">
          <Button
            variant="outline"
            disabled={step === 1 || busy}
            onClick={goBack}
            className="gap-2"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          {step < 5 ? (
            <Button
              disabled={
                busy ||
                analyzing ||
                (step === 1 && !canStep1) ||
                (step === 2 && !isPdf && !canStep2) ||
                (step === 3 && !canStep3) ||
                (step === 4 && !canStep4)
              }
              onClick={goNext}
              className="gap-2"
            >
              Next
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={deposit} disabled={!canDeposit || busy} className="gap-2">
              {busy ? "Depositing…" : "Deposit & share"}
              <CheckCircle2 className="size-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

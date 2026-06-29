"use client"

import { useEffect, useMemo, useState } from "react"
import { Bot, Check, Copy, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api, type LlmPrepareResult } from "@/lib/api"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api"

export function PrepareForLlmSheet({
  open,
  onOpenChange,
  datasetId,
  datasetTitle,
  requesterHint,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetId: string
  datasetTitle: string
  requesterHint: string
}) {
  const [result, setResult] = useState<LlmPrepareResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [llmProvider, setLlmProvider] = useState("internal")
  const [copied, setCopied] = useState<"content" | "curl" | null>(null)

  useEffect(() => {
    if (!open || !datasetId || !requesterHint) {
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    api
      .prepareDatasetForLlm(datasetId, {
        requesterHint,
        maxPreviewRows: 10,
      })
      .then(setResult)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to prepare dataset for LLM"),
      )
      .finally(() => setLoading(false))
  }, [open, datasetId, requesterHint])

  async function prepareWithProvider() {
    if (!datasetId || !requesterHint) return
    setLoading(true)
    setError(null)
    try {
      const next = await api.prepareDatasetForLlm(datasetId, {
        requesterHint,
        maxPreviewRows: 10,
        llmProvider: llmProvider.trim() || undefined,
      })
      setResult(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare dataset for LLM")
    } finally {
      setLoading(false)
    }
  }

  const curlExample = useMemo(() => {
    const body = JSON.stringify(
      { requesterHint, maxPreviewRows: 10, llmProvider },
      null,
      2,
    )
    return `curl -X POST "${API_BASE}/datasets/${datasetId}/prepare-for-llm" \\
  -H "Authorization: Bearer $VEILIO_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/'/g, "'\\''")}'`
  }, [datasetId, requesterHint, llmProvider])

  async function copyText(value: string, kind: "content" | "curl") {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5" />
            Prepare for LLM
          </DialogTitle>
          <DialogDescription>
            {datasetTitle} — protected export for your AI pipeline (no raw PII).
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="llm-provider">
              LLM provider (audit tag)
            </label>
            <input
              id="llm-provider"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={llmProvider}
              onChange={(event) => setLlmProvider(event.target.value)}
              placeholder="openai, azure-openai, mistral, internal…"
            />
            <p className="text-xs text-muted-foreground">
              Logged in file-access audit when you click Prepare.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => prepareWithProvider()}
            >
              {loading ? "Preparing…" : "Prepare with provider tag"}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Preparing protected content…</p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {result ? (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{result.llmUsage.instruction}</p>
                    <p className="text-muted-foreground">{result.llmUsage.warning}</p>
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Format</dt>
                  <dd className="font-medium">{result.format}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rows</dt>
                  <dd className="font-medium">{result.rowCount ?? result.preview.totalRows}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Access</dt>
                  <dd className="font-medium capitalize">{result.accessRole}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Vault</dt>
                  <dd className="font-mono text-xs">{result.veilioVaultId ?? "—"}</dd>
                </div>
              </dl>

              {result.tokenizedColumnNames.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Tokenized columns</p>
                  <div className="flex flex-wrap gap-2">
                    {result.tokenizedColumnNames.map((column) => (
                      <span
                        key={column}
                        className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-600/20 ring-inset"
                      >
                        {column}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-medium">Preview (first rows)</p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {result.preview.columns.map((column) => (
                          <TableHead key={column}>{column}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.preview.rows.map((row, index) => (
                        <TableRow key={index}>
                          {result.preview.columns.map((column) => (
                            <TableCell key={column} className="max-w-[12rem] truncate font-mono text-xs">
                              {row[column] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => copyText(result.content, "content")}
                >
                  {copied === "content" ? (
                    <Check className="mr-1 size-3.5" />
                  ) : (
                    <Copy className="mr-1 size-3.5" />
                  )}
                  {copied === "content" ? "Copied" : "Copy protected content"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => copyText(curlExample, "curl")}>
                  {copied === "curl" ? (
                    <Check className="mr-1 size-3.5" />
                  ) : (
                    <Copy className="mr-1 size-3.5" />
                  )}
                  {copied === "curl" ? "Copied" : "Copy API curl"}
                </Button>
              </div>

              <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                {curlExample}
              </pre>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

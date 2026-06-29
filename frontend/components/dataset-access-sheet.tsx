"use client"

import { useEffect, useState } from "react"
import { Download, Eye, FileText, Lock } from "lucide-react"
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
import { api, type DatasetPreview } from "@/lib/api"

export function DatasetAccessSheet({
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
  const [preview, setPreview] = useState<DatasetPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open || !datasetId || !requesterHint) {
      return
    }
    setLoading(true)
    setError(null)
    setPreview(null)
    api
      .previewDataset(datasetId, requesterHint)
      .then(setPreview)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Preview unavailable"),
      )
      .finally(() => setLoading(false))
  }, [open, datasetId, requesterHint])

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      await api.downloadDataset(datasetId, requesterHint)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download denied")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-4" />
            {datasetTitle}
          </DialogTitle>
          <DialogDescription>
            Governed preview — full download requires an active Access Passport.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading protected file preview…</p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {preview ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                  <Lock className="size-3" />
                  {preview.accessRole === "owner" ? "Owner access" : "Passport access"}
                </span>
                <span>{preview.fileName}</span>
                <span>·</span>
                {preview.format === "PDF" ? (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="size-3" />
                    PDF · sealed in Veilio Vault
                    {preview.fileSize
                      ? ` · ${(preview.fileSize / 1024).toFixed(1)} KB`
                      : ""}
                  </span>
                ) : (
                  <span>
                    {preview.totalRows} record{preview.totalRows === 1 ? "" : "s"}
                    {preview.truncated ? ` (showing ${preview.rows.length})` : ""}
                  </span>
                )}
              </div>

              {preview.format === "PDF" && preview.pdfBase64 ? (
                <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
                  <iframe
                    title={`PDF preview — ${preview.fileName}`}
                    src={`data:application/pdf;base64,${preview.pdfBase64}`}
                    className="h-[min(70vh,520px)] w-full"
                  />
                </div>
              ) : preview.columns.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {preview.columns.map((column) => (
                          <TableHead key={column} className="whitespace-nowrap">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row, index) => (
                        <TableRow key={index}>
                          {preview.columns.map((column) => (
                            <TableCell
                              key={column}
                              className="max-w-[200px] truncate text-muted-foreground"
                              title={row[column]}
                            >
                              {row[column]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : preview.format !== "PDF" ? (
                <p className="text-sm text-muted-foreground">No rows to preview.</p>
              ) : null}
              {preview.format !== "PDF" &&
              preview.rows.some((row) =>
                Object.values(row).some((v) => String(v).startsWith("TOK_")),
              ) ? (
                <p className="text-xs text-muted-foreground">
                  Values prefixed with <code className="font-mono">TOK_</code> are tokenized by
                  Veilio Vault — raw PII never leaves the protected file.
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="border-t border-border pt-4">
          <Button
            onClick={download}
            disabled={downloading || loading || Boolean(error)}
            className="w-full gap-2"
          >
            <Download className="size-4" />
            {downloading ? "Downloading…" : "Download full file"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function DatasetAccessButtons({
  datasetId,
  datasetTitle,
  requesterHint,
  size = "sm",
}: {
  datasetId: string
  datasetTitle: string
  requesterHint: string
  size?: "sm" | "default"
}) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      await api.downloadDataset(datasetId, requesterHint)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download denied")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
      <Button size={size} variant="outline" onClick={() => setOpen(true)}>
        <Eye className="mr-1 size-3.5" />
        Preview
      </Button>
      <Button size={size} variant="outline" onClick={download} disabled={downloading}>
        <Download className="mr-1 size-3.5" />
        {downloading ? "…" : "Download"}
      </Button>
      <DatasetAccessSheet
        open={open}
        onOpenChange={setOpen}
        datasetId={datasetId}
        datasetTitle={datasetTitle}
        requesterHint={requesterHint}
      />
    </>
  )
}

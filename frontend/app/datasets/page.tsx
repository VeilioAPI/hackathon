"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Database, Bot, Eye, Lock, ShieldCheck, Share2, Trash2 } from "lucide-react"
import { Shell } from "@/components/shell"
import { KpiCard } from "@/components/kpi-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatasetAccessSheet } from "@/components/dataset-access-sheet"
import { PrepareForLlmSheet } from "@/components/prepare-for-llm-sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { usePartnerContext } from "@/contexts/partner-context"
import { SharePartnerWizard } from "@/components/share-partner-wizard"
import { ShareDatasetSheet } from "@/components/share-dataset-sheet"
import { GovernanceStatusBadge } from "@/components/governance-status-badge"
import {
  api,
  type AccessPassport,
  type CatalogListing,
  type DatasetUpload,
  type LedgerDataset,
} from "@/lib/api"

const classStyles: Record<string, string> = {
  Restricted: "bg-red-50 text-red-700 ring-red-600/20",
  Confidential: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Internal: "bg-blue-50 text-blue-700 ring-blue-600/20",
  "Regulated-Financial": "bg-blue-50 text-blue-800 ring-blue-600/15",
  "Trade-Finance": "bg-violet-50 text-violet-800 ring-violet-600/15",
}

export default function DatasetsPage() {
  const { viewerHint, banks, refreshBanks } = usePartnerContext()
  const [datasets, setDatasets] = useState<LedgerDataset[]>([])
  const [uploads, setUploads] = useState<DatasetUpload[]>([])
  const [passports, setPassports] = useState<AccessPassport[]>([])
  const [catalog, setCatalog] = useState<CatalogListing[]>([])
  const [shareTarget, setShareTarget] = useState<{
    datasetId: string
    title: string
    ownerHint: string
  } | null>(null)
  const [ownerHint, setOwnerHint] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [accessTarget, setAccessTarget] = useState<{
    datasetId: string
    title: string
  } | null>(null)
  const [llmTarget, setLlmTarget] = useState<{
    datasetId: string
    title: string
  } | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    if (viewerHint) {
      setOwnerHint(viewerHint)
    } else if (banks.length > 0) {
      setOwnerHint(banks[0].hint)
    }
  }, [viewerHint, banks])

  async function load() {
    const [datasetRows, uploadRows, passportRows, catalogRows] = await Promise.all([
      api.datasets(),
      api.datasetUploads(),
      api.passports(),
      api.catalog(viewerHint ? { viewerHint } : undefined),
    ])
    setDatasets(datasetRows)
    setUploads(uploadRows)
    setPassports(passportRows)
    setCatalog(catalogRows)
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load datasets"),
    )
  }, [viewerHint])

  async function removeDataset(row: {
    datasetId: string
    name: string
    owner: string
    activeShares: number
  }) {
    const shareNote =
      row.activeShares > 0
        ? `\n\nThis dataset has ${row.activeShares} active share(s). Revoke those passports first.`
        : ""
    if (
      !window.confirm(
        `Delete "${row.name}" (${row.datasetId})?\n\nThe protected file and Exchange listing will be removed.${shareNote}`,
      )
    ) {
      return
    }
    setDeletingId(row.datasetId)
    setError(null)
    setMessage(null)
    try {
      await api.deleteDataset({ datasetId: row.datasetId, ownerHint: row.owner })
      setMessage(`Dataset ${row.datasetId} deleted.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeletingId(null)
    }
  }

  async function downloadFile(datasetId: string) {
    if (!viewerHint) return
    setDownloadingId(datasetId)
    setError(null)
    try {
      await api.downloadDataset(datasetId, viewerHint)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download denied")
    } finally {
      setDownloadingId(null)
    }
  }

  const inventory = useMemo(() => {
    const uploadByDataset = new Map<string, DatasetUpload>()
    for (const upload of uploads) {
      if (upload.isCurrent && !uploadByDataset.has(upload.datasetId)) {
        uploadByDataset.set(upload.datasetId, upload)
      }
    }

    return datasets.map((dataset) => {
      const upload = uploadByDataset.get(dataset.datasetId)
      const displayTitle = dataset.description.includes(": ")
        ? dataset.description.split(": ")[0]
        : dataset.datasetId
      const datasetPassports = passports.filter((p) => p.datasetId === dataset.datasetId)
      const activeShares = datasetPassports.filter((p) => p.status === "Active")
      const pendingShares = datasetPassports.filter((p) => p.status === "PendingConsent")
      const listing = catalog.find((row) => row.datasetId === dataset.datasetId)
      const resolvedOwner =
        listing?.ownerHint ??
        upload?.ownerHint ??
        dataset.ownerHint ??
        dataset.owner.split("::")[0]
      const isOwner = Boolean(viewerHint && viewerHint === resolvedOwner)
      const activeRecipientPassport = datasetPassports.find(
        (passport) => passport.recipientHint === viewerHint && passport.status === "Active",
      )
      const canAccessFile = Boolean(upload && (isOwner || activeRecipientPassport))
      return {
        id: dataset.contractId,
        datasetId: dataset.datasetId,
        name: displayTitle,
        description: dataset.description,
        dataFormat: dataset.dataFormat ?? "CSV",
        classification: dataset.classification,
        owner: resolvedOwner,
        records: upload?.rowCount ?? null,
        fileName: upload?.fileName ?? null,
        hasFile: Boolean(upload),
        sha256: upload?.sha256 ?? null,
        activeShares: activeShares.length,
        pendingShares: pendingShares.map(
          (p) => p.recipientDisplayName ?? p.recipientHint ?? "partner",
        ),
        sharePartners: activeShares.map(
          (p) => p.recipientDisplayName ?? p.recipientHint,
        ),
        governanceStatus: listing?.governanceStatus,
        visibility: listing?.visibility ?? "private",
        invitedRecipientHint: listing?.invitedRecipientHint,
        passportId:
          activeRecipientPassport?.passportId ??
          activeShares[0]?.passportId ??
          datasetPassports[0]?.passportId,
        isOwner,
        canAccessFile,
      }
    })
  }, [datasets, uploads, passports, catalog, viewerHint])

  const withFiles = inventory.filter((row) => row.hasFile).length
  const totalActiveShares = inventory.reduce((sum, row) => sum + row.activeShares, 0)

  return (
    <Shell
      title="Datasets"
      subtitle="Deposit protected datasets — file off-ledger, governance metadata on Canton"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total Datasets"
            value={String(inventory.length)}
            icon={Database}
            tone="primary"
          />
          <KpiCard
            label="With Protected File"
            value={String(withFiles)}
            icon={Lock}
            tone="amber"
          />
          <KpiCard label="On Canton" value={String(datasets.length)} icon={ShieldCheck} tone="accent" />
          <KpiCard
            label="Active External Shares"
            value={String(totalActiveShares)}
            icon={Share2}
            tone="primary"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div />
          <Button size="sm" variant="outline" render={<Link href="/exchange/my-data" />}>
            Who has access to my data? →
          </Button>
        </div>

        <SharePartnerWizard
          banks={banks}
          ownerHint={ownerHint}
          onOwnerHintChange={setOwnerHint}
          onDeposited={(text) => {
            setMessage(text)
            load().catch(() => undefined)
            refreshBanks().catch(() => undefined)
          }}
        />

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

        <Card className="pt-0 gap-0 overflow-hidden">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Your datasets</CardTitle>
            <p className="text-sm text-muted-foreground">
              To delete or share, select the owner in the header (Viewing as). Preview / Download
              require an active passport or dataset ownership.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {inventory.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No datasets yet. Deposit a file above to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Dataset</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead>External shares</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-foreground">
                        <div>
                          <p>{row.name}</p>
                          {row.name !== row.datasetId ? (
                            <p className="text-xs text-muted-foreground">{row.datasetId}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.dataFormat}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                            classStyles[row.classification] ?? classStyles.Internal,
                          )}
                        >
                          {row.classification}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.fileName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.records ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.owner}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                          {row.visibility === "network"
                            ? "All partners"
                            : row.visibility === "direct"
                              ? `Direct · ${row.invitedRecipientHint ?? "—"}`
                              : "Private"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.activeShares > 0 ? (
                          <div>
                            <p className="font-medium text-foreground">{row.activeShares}</p>
                            <p className="text-xs">{row.sharePartners.join(", ")}</p>
                          </div>
                        ) : row.pendingShares.length > 0 ? (
                          <div>
                            <p className="font-medium text-amber-800 dark:text-amber-200">
                              Pending consent
                            </p>
                            <p className="text-xs">{row.pendingShares.join(", ")}</p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {row.governanceStatus ? (
                          <GovernanceStatusBadge
                            status={row.governanceStatus}
                            perspective={row.isOwner ? "owner" : "recipient"}
                            recipientHint={row.invitedRecipientHint}
                          />
                        ) : row.hasFile ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                            Protected · Listed
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                            Metadata only
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {row.canAccessFile && viewerHint ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setAccessTarget({
                                    datasetId: row.datasetId,
                                    title: row.name,
                                  })
                                }
                              >
                                <Eye className="mr-1 size-3.5" />
                                Preview
                              </Button>
                              {row.dataFormat !== "PDF" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setLlmTarget({
                                      datasetId: row.datasetId,
                                      title: row.name,
                                    })
                                  }
                                >
                                  <Bot className="mr-1 size-3.5" />
                                  For LLM
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={downloadingId === row.datasetId}
                                onClick={() => downloadFile(row.datasetId)}
                              >
                                {downloadingId === row.datasetId ? "…" : "Download"}
                              </Button>
                            </>
                          ) : null}
                          {row.isOwner && row.hasFile ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setShareTarget({
                                  datasetId: row.datasetId,
                                  title: row.name,
                                  ownerHint: row.owner,
                                })
                              }
                            >
                              <Share2 className="mr-1 size-3.5" />
                              Share
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            render={<Link href="/exchange" />}
                          >
                            Exchange
                          </Button>
                          {row.passportId ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              render={
                                <Link
                                  href={`/governance/passports/${encodeURIComponent(row.passportId)}`}
                                />
                              }
                            >
                              Passport
                            </Button>
                          ) : null}
                          {row.isOwner ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={deletingId === row.datasetId}
                              onClick={() =>
                                removeDataset({
                                  datasetId: row.datasetId,
                                  name: row.name,
                                  owner: row.owner,
                                  activeShares: row.activeShares,
                                })
                              }
                            >
                              <Trash2 className="mr-1 size-3.5" />
                              {deletingId === row.datasetId ? "Suppression…" : "Supprimer"}
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

        <ShareDatasetSheet
          open={shareTarget !== null}
          onOpenChange={(open) => {
            if (!open) setShareTarget(null)
          }}
          datasetId={shareTarget?.datasetId ?? ""}
          datasetTitle={shareTarget?.title ?? ""}
          ownerHint={shareTarget?.ownerHint ?? ""}
          banks={banks}
          onShared={(text) => {
            setMessage(text)
            load().catch(() => undefined)
          }}
        />

        {viewerHint ? (
          <>
            <DatasetAccessSheet
              open={accessTarget !== null}
              onOpenChange={(open) => {
                if (!open) setAccessTarget(null)
              }}
              datasetId={accessTarget?.datasetId ?? ""}
              datasetTitle={accessTarget?.title ?? ""}
              requesterHint={viewerHint}
            />
            <PrepareForLlmSheet
              open={llmTarget !== null}
              onOpenChange={(open) => {
                if (!open) setLlmTarget(null)
              }}
              datasetId={llmTarget?.datasetId ?? ""}
              datasetTitle={llmTarget?.title ?? ""}
              requesterHint={viewerHint}
            />
          </>
        ) : null}
      </div>
    </Shell>
  )
}

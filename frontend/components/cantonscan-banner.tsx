"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Globe, Package } from "lucide-react"
import { api, type CantonBootstrapInfo } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

function cantonscanUpdateUrl(baseUrl: string, updateId: string): string {
  const base = baseUrl.replace(/\/$/, "")
  return `${base}/update/${encodeURIComponent(updateId)}`
}

export function CantonscanBanner() {
  const [info, setInfo] = useState<CantonBootstrapInfo | null>(null)

  useEffect(() => {
    api
      .cantonBootstrap()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  if (!info) return null

  const isPublic = info.mode === "public"
  const scanBase = info.cantonScanBaseUrl ?? "https://www.cantonscan.com"
  const packageId = info.packageId ?? info.packageIds?.[0]
  const recentUpdates = info.recentUpdateIds ?? []

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        isPublic
          ? "border-sky-200/70 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/30"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <p className="text-sm font-semibold">
              {isPublic ? "Canton Network — live on ledger" : "Local Canton ledger"}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                isPublic
                  ? "bg-sky-200/80 text-sky-900 dark:bg-sky-900/80 dark:text-sky-100"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {isPublic ? "Public" : "Local dev"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isPublic
              ? "Governance actions from this app are written to Canton Network. Verify them on Cantonscan."
              : "Embedded Canton sandbox — switch to public mode to publish transactions visible on Cantonscan."}
          </p>
          {packageId ? (
            <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Package className="size-3.5 shrink-0" />
              Package {truncateMiddle(packageId)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {isPublic ? (
            <>
              <Button size="sm" variant="outline" render={<a href={scanBase} target="_blank" rel="noreferrer" />}>
                Cantonscan
                <ExternalLink className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={<a href={`${scanBase.replace(/\/$/, "")}/updates`} target="_blank" rel="noreferrer" />}
              >
                Latest updates
                <ExternalLink className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              render={<a href="https://www.cantonscan.com" target="_blank" rel="noreferrer" />}
            >
              About Cantonscan
              <ExternalLink className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {recentUpdates.length > 0 ? (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {isPublic ? "Recent governance updates" : "Recent local ledger updates"}
          </p>
          {!isPublic ? (
            <p className="mb-2 text-[11px] text-muted-foreground">
              These update IDs exist only on your embedded Canton sandbox — they are not indexed on
              public Cantonscan.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {recentUpdates.map((updateId) =>
              isPublic ? (
                <a
                  key={updateId}
                  href={cantonscanUpdateUrl(scanBase, updateId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-sky-400/60 hover:bg-sky-50/50 dark:hover:bg-sky-950/40"
                >
                  {truncateMiddle(updateId, 12, 10)}
                  <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              ) : (
                <span
                  key={updateId}
                  title={updateId}
                  className="inline-flex cursor-default items-center rounded-md border border-dashed border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground"
                >
                  {truncateMiddle(updateId, 12, 10)}
                </span>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

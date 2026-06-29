"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Search } from "lucide-react"
import { actionMeta } from "@/components/audit-helpers"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { mapAuditEvents, type AuditAction, type AuditViewEvent } from "@/lib/view-models"

const actionFilters: ("All" | AuditAction)[] = [
  "All",
  "Dataset Registered",
  "Dataset Shared",
  "Sharing Accepted",
  "Access Granted",
  "Consent Approved",
  "Access Modified",
  "Access Revoked",
  "Policy Updated",
]

export function AuditTrail() {
  const [query, setQuery] = useState("")
  const [action, setAction] = useState<(typeof actionFilters)[number]>("All")
  const [auditEvents, setAuditEvents] = useState<AuditViewEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api
      .audit()
      .then((events) => setAuditEvents(mapAuditEvents(events)))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load audit events"),
      )
  }, [])

  const filtered = useMemo(() => {
    return auditEvents.filter((e) => {
      const matchesAction = action === "All" || e.action === action
      const q = query.toLowerCase()
      const matchesQuery =
        !q ||
        e.dataset.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.organization.toLowerCase().includes(q)
      return matchesAction && matchesQuery
    })
  }, [auditEvents, query, action])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const e of filtered) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return Array.from(map.entries())
  }, [filtered])

  async function exportPack() {
    setExporting(true)
    try {
      await api.exportCompliancePack()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={exportPack} disabled={exporting} className="gap-2" size="sm">
          <Download className="size-4" />
          {exporting ? "Exporting…" : "Export compliance pack"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by dataset, actor, or organization..."
            className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none ring-ring/40 placeholder:text-muted-foreground focus:ring-2"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actionFilters.map((a) => (
          <button
            key={a}
            onClick={() => setAction(a)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              action === a
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {a}
          </button>
        ))}
      </div>

      {grouped.length === 0 && (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No governance events match your filters.
        </p>
      )}

      <div className="space-y-8">
        {grouped.map(([date, events]) => (
          <div key={date}>
            <div className="sticky top-16 z-10 mb-3 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              {date}
            </div>
            <ol className="relative space-y-0 border-l border-border pl-6">
              {events.map((e) => {
                const meta = actionMeta[e.action]
                const Icon = meta.icon
                return (
                  <li key={e.id} className="relative pb-6 last:pb-0">
                    <span
                      className={cn(
                        "absolute -left-[2.05rem] flex size-7 items-center justify-center rounded-full ring-4 ring-background",
                        meta.className,
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {e.action}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {e.timestamp}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="text-foreground">{e.dataset}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Actor:{" "}
                          <span className="font-medium text-foreground">
                            {e.actor}
                          </span>
                        </span>
                        <span className="text-border">·</span>
                        <span>{e.organization}</span>
                        {e.txId ? (
                          <>
                            <span className="text-border">·</span>
                            <span className="truncate max-w-[24rem]" title={e.txId}>
                              Tx: {e.txId}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}

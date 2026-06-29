"use client"

import { useState } from "react"
import Link from "next/link"
import { LayoutGrid, IdCard } from "lucide-react"
import { ExchangeCatalog } from "@/components/exchange-catalog"
import { ExchangeHubSummary } from "@/components/exchange-hub-summary"
import { PassportsView } from "@/components/passports-view"
import { Shell } from "@/components/shell"
import { UseCaseFilterChips } from "@/components/use-case-filter-chips"
import { Button } from "@/components/ui/button"
import { usePartnerContext } from "@/contexts/partner-context"
import { categories } from "@/lib/view-models"
import { cn } from "@/lib/utils"

const tabs = [
  { id: "catalog", label: "Shared Datasets", icon: LayoutGrid },
  { id: "passports", label: "My Passports", icon: IdCard },
] as const

const catalogScopes = [
  { id: "all", label: "All datasets" },
  { id: "shared-by-me", label: "Shared by me" },
  { id: "shared-with-me", label: "Shared with me" },
] as const

type TabId = (typeof tabs)[number]["id"]
type CatalogScope = (typeof catalogScopes)[number]["id"]

export default function ExchangePage() {
  const { viewer } = usePartnerContext()
  const [tab, setTab] = useState<TabId>("catalog")
  const [catalogScope, setCatalogScope] = useState<CatalogScope>("all")
  const [useCaseFilter, setUseCaseFilter] = useState<(typeof categories)[number]>("All")

  return (
    <Shell
      title="Veilio Exchange"
      subtitle={
        viewer
          ? `Governed external data sharing for ${viewer.displayName}`
          : "Cross-organization dataset governance on Canton"
      }
    >
      <div className="space-y-6">
        <ExchangeHubSummary />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <UseCaseFilterChips value={useCaseFilter} onChange={setUseCaseFilter} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" render={<Link href="/exchange/my-data" />}>
              Who has access? →
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/insights" />}>
              Trust network →
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
          {tabs.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            )
          })}
        </div>

        {tab === "catalog" ? (
          <>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-1">
              {catalogScopes.map((scope) => {
                const active = catalogScope === scope.id
                return (
                  <button
                    key={scope.id}
                    type="button"
                    onClick={() => setCatalogScope(scope.id)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {scope.label}
                  </button>
                )
              })}
            </div>
            <ExchangeCatalog
              useCaseFilter={useCaseFilter}
              onUseCaseFilterChange={setUseCaseFilter}
              catalogScope={catalogScope}
            />
          </>
        ) : null}
        {tab === "passports" ? (
          <PassportsView
            viewerHint={viewer?.hint}
            useCaseFilter={useCaseFilter === "All" ? undefined : useCaseFilter}
          />
        ) : null}
      </div>
    </Shell>
  )
}

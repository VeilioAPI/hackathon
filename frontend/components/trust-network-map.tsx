"use client"

import { useEffect, useState } from "react"
import { Building2, Network } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { makeTrustNetworkRows, mapPassportsToExchange, type RiskLevel } from "@/lib/view-models"

type TrustNode = {
  id: string
  label: string
  type: "owner" | "recipient"
  x: number
  y: number
}

type TrustLink = {
  from: string
  to: string
  label: string
  risk: RiskLevel
}

const riskStroke: Record<RiskLevel, string> = {
  Low: "var(--chart-4)",
  Medium: "#d97706",
  High: "#dc2626",
}

export function TrustNetworkMap({ useCaseFilter }: { useCaseFilter?: string }) {
  const [active, setActive] = useState<string | null>(null)
  const [trustNodes, setTrustNodes] = useState<TrustNode[]>([])
  const [trustLinks, setTrustLinks] = useState<TrustLink[]>([])

  useEffect(() => {
    api
      .passports(useCaseFilter ? { useCase: useCaseFilter, status: "Active" } : { status: "Active" })
      .then((passports) => {
        const active = mapPassportsToExchange(passports).filter(
          (row) => row.status === "Active",
        )
        const network = makeTrustNetworkRows(active)
        setTrustNodes(network.nodes)
        setTrustLinks(network.links)
      })
      .catch(() => {
        setTrustNodes([])
        setTrustLinks([])
      })
  }, [useCaseFilter])

  const nodeById = (id: string) => trustNodes.find((n) => n.id === id)!

  return (
    <Card className="gap-0 pt-6">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-primary" />
          <CardTitle>Trust Network Map</CardTitle>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[var(--chart-4)]" /> Low
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-amber-600" /> Medium
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-red-600" /> High
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Organizations connected by governed data relationships
        </p>
        <div className="relative w-full overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:20px_20px]">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            {trustLinks.map((link, i) => {
              const from = nodeById(link.from)
              const to = nodeById(link.to)
              const isActive =
                active === link.from || active === link.to || active === null
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={riskStroke[link.risk]}
                  strokeWidth={0.4}
                  strokeDasharray="1.2 0.8"
                  vectorEffect="non-scaling-stroke"
                  className={cn(
                    "transition-opacity",
                    isActive ? "opacity-70" : "opacity-15",
                  )}
                  style={{ strokeWidth: isActive ? 1.5 : 1 }}
                />
              )
            })}
          </svg>

          <div className="relative aspect-[16/9] w-full sm:aspect-[2/1]">
            {trustNodes.map((node) => {
              const isOwner = node.type === "owner"
              return (
                <button
                  key={node.id}
                  onMouseEnter={() => setActive(node.id)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(node.id)}
                  onBlur={() => setActive(null)}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 outline-none"
                >
                  <span
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all",
                      isOwner
                        ? "border-primary/30 bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:border-accent/50",
                      active && active !== node.id && "opacity-50",
                    )}
                  >
                    <Building2 className="size-3" />
                    {node.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

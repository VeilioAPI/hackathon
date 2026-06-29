"use client"

import { useState } from "react"
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  Play,
  Sparkles,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type DemoStepId =
  | "seed"
  | "owner"
  | "recipient-preview"
  | "revoke"
  | "denied"

export const DEMO_STEPS: Array<{
  id: DemoStepId
  title: string
  detail: string
  visual: string
}> = [
  {
    id: "seed",
    title: "Load governed demo network",
    detail: "6 partners, 3 verticals, tokenized files in Veilio Vault.",
    visual: "Scrolls to the catalog — datasets appear below.",
  },
  {
    id: "owner",
    title: "View as data owner (Meridian Bank)",
    detail: "BankA owns the KYC dataset and issued the Access Passport.",
    visual: "Header switches to Meridian Bank · KYC card highlighted.",
  },
  {
    id: "recipient-preview",
    title: "Preview as recipient (VeriTrust KYC)",
    detail: "Active passport unlocks governed preview — no raw PII on Canton.",
    visual: "Header switches to VeriTrust · preview dialog opens in the center.",
  },
  {
    id: "revoke",
    title: "Revoke access from owner",
    detail: "Purpose fulfilled → immediate revocation on Canton.",
    visual: "Passport dialog opens in the center · revoke recorded on ledger.",
  },
  {
    id: "denied",
    title: "Prove access cut-off (403)",
    detail: "Recipient preview blocked — governance enforced.",
    visual: "VeriTrust · preview dialog shows access denied.",
  },
]

export function GuidedDemoPanel({
  onExecuteStep,
  onPauseBetweenSteps,
}: {
  onExecuteStep: (step: DemoStepId) => Promise<void>
  onPauseBetweenSteps?: () => Promise<void>
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [completed, setCompleted] = useState<Set<DemoStepId>>(new Set())
  const [activeStep, setActiveStep] = useState<DemoStepId>("seed")
  const [busy, setBusy] = useState(false)
  const [touring, setTouring] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  function markDone(step: DemoStepId, next?: DemoStepId) {
    setCompleted((prev) => new Set([...prev, step]))
    if (next) setActiveStep(next)
  }

  async function runStep(step: DemoStepId) {
    setBusy(true)
    setCollapsed(true)
    setStepError(null)
    try {
      setActiveStep(step)
      await onExecuteStep(step)
      const index = DEMO_STEPS.findIndex((item) => item.id === step)
      markDone(step, DEMO_STEPS[index + 1]?.id)
    } catch (err) {
      setStepError(err instanceof Error ? err.message : "Demo step failed")
    } finally {
      setBusy(false)
    }
  }

  async function runAll() {
    setTouring(true)
    setCollapsed(true)
    setCompleted(new Set())
    setActiveStep("seed")
    setStepError(null)
    try {
      for (const step of DEMO_STEPS) {
        setActiveStep(step.id)
        try {
          await onExecuteStep(step.id)
          markDone(step.id)
        } catch (err) {
          setStepError(
            `Step ${step.id} failed: ${err instanceof Error ? err.message : "unknown error"}`,
          )
          break
        }
        if (step.id !== "denied" && onPauseBetweenSteps) {
          await onPauseBetweenSteps()
        }
      }
    } finally {
      setTouring(false)
    }
  }

  return (
    <Card
      className={cn(
        "border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card transition-all",
        touring && "ring-2 ring-primary/40",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="size-4 text-primary" />
              5-minute jury demo
              {touring ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-normal text-primary">
                  Paused — read the banner, then Continue
                </span>
              ) : null}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Each step pauses so you can read along. Side panels (preview, passport) — no browser
              popups.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand demo steps" : "Collapse demo steps"}
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
        </div>
      </CardHeader>

      {!collapsed ? (
        <CardContent className="space-y-4">
          <ol className="space-y-2">
            {DEMO_STEPS.map((step, index) => {
              const done = completed.has(step.id)
              const current = activeStep === step.id
              const Icon = done ? CheckCircle2 : current ? Sparkles : Circle
              return (
                <li
                  key={step.id}
                  className={cn(
                    "flex gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    done
                      ? "border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/20"
                      : current
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-card",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      done
                        ? "text-emerald-600"
                        : current
                          ? "text-primary"
                          : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {index + 1}. {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.detail}</p>
                    <p className="mt-1 text-xs font-medium text-primary/80">{step.visual}</p>
                  </div>
                  {!done && !touring ? (
                    <Button
                      size="sm"
                      variant={current ? "default" : "outline"}
                      disabled={busy}
                      onClick={() => runStep(step.id)}
                    >
                      {step.id === "recipient-preview" || step.id === "denied" ? (
                        <Eye className="mr-1 size-3.5" />
                      ) : step.id === "revoke" ? (
                        <Ban className="mr-1 size-3.5" />
                      ) : step.id === "owner" ? (
                        <UserRound className="mr-1 size-3.5" />
                      ) : (
                        <Sparkles className="mr-1 size-3.5" />
                      )}
                      Show
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ol>

          <Button onClick={runAll} disabled={busy || touring} className="gap-2">
            <Play className="size-4" />
            {touring ? "Demo in progress…" : busy ? "Working…" : "Run step-by-step demo"}
          </Button>
          {stepError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {stepError}
            </p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}

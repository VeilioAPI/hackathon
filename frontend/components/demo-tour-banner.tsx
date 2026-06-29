"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type DemoTourBannerState = {
  step?: { current: number; total: number }
  title: string
  message: string
  tone?: "primary" | "success" | "error"
  waitingForContinue?: boolean
}

export function DemoTourBanner({
  banner,
  onDismiss,
  onContinue,
}: {
  banner: DemoTourBannerState | null
  onDismiss?: () => void
  onContinue?: () => void
}) {
  if (!banner) return null

  const tone = banner.tone ?? "primary"

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !banner.waitingForContinue) {
          onDismiss?.()
        }
      }}
    >
      <DialogContent
        showCloseButton={!banner.waitingForContinue}
        className={cn(
          "gap-0 p-0",
          tone === "success" &&
            "border-emerald-400/60 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-50",
          tone === "error" &&
            "border-destructive/50 bg-destructive/10 text-destructive dark:bg-destructive/20",
          tone === "primary" && "border-primary/40",
        )}
      >
        <DialogHeader className="space-y-3 border-b border-border/60 p-6 pb-5">
          {banner.step ? (
            <span
              className={cn(
                "inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                tone === "success" &&
                  "bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900/80 dark:text-emerald-100",
                tone === "error" && "bg-destructive/20 text-destructive",
                tone === "primary" && "bg-primary/15 text-primary",
              )}
            >
              Step {banner.step.current} / {banner.step.total}
            </span>
          ) : null}
          <DialogTitle className="text-xl leading-snug">{banner.title}</DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-foreground/85">
            {banner.message}
          </DialogDescription>
          {banner.waitingForContinue ? (
            <p className="text-sm font-medium text-muted-foreground">
              Take your time to read — click Continue when you are ready.
            </p>
          ) : null}
        </DialogHeader>

        {banner.waitingForContinue && onContinue ? (
          <div className="flex justify-end p-6 pt-5">
            <Button onClick={onContinue} className="gap-2" size="lg">
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

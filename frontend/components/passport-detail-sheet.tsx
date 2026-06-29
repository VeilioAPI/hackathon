"use client"

import { useEffect, useState } from "react"
import { Ban, CheckCircle2, Circle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, type PassportDetail } from "@/lib/api"

export function PassportDetailSheet({
  open,
  onOpenChange,
  passportId,
  refreshKey = 0,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  passportId: string
  refreshKey?: number
}) {
  const [passport, setPassport] = useState<PassportDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !passportId) return
    setError(null)
    setPassport(null)
    api
      .passport(passportId)
      .then(setPassport)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load passport"),
      )
  }, [open, passportId, refreshKey])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle>Access Passport — Canton proof</DialogTitle>
          <DialogDescription>
            Purpose-bound, time-limited, revocable access recorded on the ledger.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {passport ? (
          <div className="mt-6 space-y-6">
            <section className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <p className="mb-2 font-semibold text-foreground">{passport.passportId}</p>
              <dl className="grid gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Dataset</dt>
                  <dd>{passport.datasetTitle ?? passport.datasetId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Owner → Recipient</dt>
                  <dd>
                    {passport.ownerDisplayName ?? passport.ownerHint} →{" "}
                    {passport.recipientDisplayName ?? passport.recipientHint}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Purpose</dt>
                  <dd>{passport.purpose}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd
                    className={
                      passport.status === "Revoked"
                        ? "font-semibold text-destructive"
                        : "font-semibold text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {passport.status}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold">Governance timeline</h3>
              <ol className="space-y-2">
                {passport.timeline.map((event, index) => (
                  <li
                    key={`${event.contractId}-${index}`}
                    className="rounded border border-border/70 p-3 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      {event.action.includes("Revoked") ? (
                        <Ban className="mt-0.5 size-4 shrink-0 text-red-500" />
                      ) : event.action.includes("Denied") ? (
                        <Circle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{event.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                          {event.actorHint ? ` · ${event.actorHint}` : ""}
                        </p>
                        {event.details ? (
                          <p className="mt-1 text-xs text-muted-foreground">{event.details}</p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : !error ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading passport from Canton…</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

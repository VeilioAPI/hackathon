"use client"

import { useState } from "react"
import { Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, type BankRecord } from "@/lib/api"

export function ShareDatasetSheet({
  open,
  onOpenChange,
  datasetId,
  datasetTitle,
  ownerHint,
  banks,
  onShared,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetId: string
  datasetTitle: string
  ownerHint: string
  banks: BankRecord[]
  onShared: (message: string) => void
}) {
  const recipients = banks.filter((bank) => bank.hint !== ownerHint)
  const [recipientHint, setRecipientHint] = useState(recipients[0]?.hint ?? "")
  const [purpose, setPurpose] = useState("Regulated data sharing")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function share() {
    if (!recipientHint) {
      setError("Select a recipient partner")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.shareDataset({
        datasetId,
        ownerHint,
        recipientHint,
        purpose,
        expirationDays: 90,
      })
      const recipient = banks.find((bank) => bank.hint === recipientHint)
      const name = recipient?.displayName ?? recipientHint
      if (result.status === "Active") {
        onShared(`Already shared with ${name} — passport ${result.passportId} is active.`)
      } else {
        onShared(
          `Access Passport ${result.passportId} issued for ${name}. ` +
            `Switch to ${name} in the header and record consent on Exchange.`,
        )
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            Share externally
          </DialogTitle>
          <DialogDescription>
            Issue governed access to <strong>{datasetTitle}</strong> ({datasetId}). Canton
            coordinates the passport; your file stays protected off-ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add another partner on the Partners page before sharing externally.
            </p>
          ) : (
            <>
              <div className="grid gap-2">
                <label className="text-sm text-muted-foreground">Recipient organization</label>
                <select
                  value={recipientHint}
                  onChange={(event) => setRecipientHint(event.target.value)}
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                >
                  {recipients.map((bank) => (
                    <option key={bank.hint} value={bank.hint}>
                      {bank.displayName} ({bank.hint})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-muted-foreground">Authorized purpose</label>
                <input
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <Button onClick={share} disabled={busy} className="w-full">
                {busy ? "Creating access passport…" : "Issue Access Passport"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

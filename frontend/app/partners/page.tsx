"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { Shell } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePartnerContext } from "@/contexts/partner-context"
import { api, type BankRecord, type ParticipantKey } from "@/lib/api"

const PARTICIPANTS: ParticipantKey[] = [
  "participant1",
  "participant2",
  "participant3",
  "participant4",
  "participant5",
]

const HINT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

export default function PartnersPage() {
  const { refreshBanks } = usePartnerContext()
  const [rows, setRows] = useState<BankRecord[]>([])
  const [hint, setHint] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [participant, setParticipant] = useState<ParticipantKey>("participant1")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyHint, setBusyHint] = useState<string | null>(null)

  async function load() {
    const banks = await api.banks()
    setRows(banks)
    await refreshBanks()
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load partners"),
    )
  }, [])

  async function createPartner() {
    setError(null)
    setMessage(null)
    const trimmedHint = hint.trim()
    if (!HINT_PATTERN.test(trimmedHint)) {
      setError(
        "Partner ID must start with a letter and use only letters, digits, underscores, or hyphens (e.g. BankA, AcmeCorp).",
      )
      return
    }
    setBusy(true)
    try {
      const created = await api.createBank({
        hint: trimmedHint,
        displayName: displayName.trim(),
        description: description.trim(),
        participant,
      })
      const allocationNote = created.partyId
        ? "Canton party allocated."
        : "Saved in PostgreSQL — Canton allocation is pending (use Retry on the row below or check backend logs in production)."
      setMessage(`Partner created: ${created.displayName} (${created.hint}). ${allocationNote}`)
      setHint("")
      setDisplayName("")
      setDescription("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create partner")
    } finally {
      setBusy(false)
    }
  }

  async function retryAllocation(row: BankRecord) {
    setBusyHint(row.hint)
    setError(null)
    setMessage(null)
    try {
      const updated = await api.allocateBankParty(row.hint)
      setMessage(
        updated.partyId
          ? `Canton party allocated for ${row.displayName}.`
          : `Allocation still pending for ${row.displayName}.`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Allocation failed")
    } finally {
      setBusyHint(null)
    }
  }

  async function removePartner(row: BankRecord) {
    if (
      !window.confirm(
        `Delete partner "${row.displayName}" (${row.hint})?\n\nThis only works if they have no datasets, listings, or passports on Canton.`,
      )
    ) {
      return
    }
    setBusyHint(row.hint)
    setError(null)
    setMessage(null)
    try {
      await api.deleteBank(row.hint)
      setMessage(`Partner deleted: ${row.displayName}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete partner")
    } finally {
      setBusyHint(null)
    }
  }

  return (
    <Shell title="Partners" subtitle="Manage regulated counterparties on Canton participants">
      <div className="space-y-6">
        <p className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Partners are stored in <strong className="text-foreground">PostgreSQL</strong> and
          mapped to Canton party IDs. Demo partners (Meridian Bank, VeriTrust, etc.) appear after
          loading the demo network on Exchange — they use the same database, not a separate mock
          list.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Add partner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Partner ID</label>
              <input
                value={hint}
                onChange={(event) => setHint(event.target.value)}
                placeholder="e.g. BankA"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring/40 focus:ring-2"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Display name</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Meridian Bank"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring/40 focus:ring-2"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Description (optional)</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none ring-ring/40 focus:ring-2"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Participant node</label>
              <select
                value={participant}
                onChange={(event) => setParticipant(event.target.value as ParticipantKey)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring/40 focus:ring-2"
              >
                {PARTICIPANTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={createPartner}
              disabled={busy || !hint.trim() || !displayName.trim()}
            >
              {busy ? "Creating..." : "Create partner"}
            </Button>
          </CardContent>
        </Card>

        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Registered partners ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Partner ID</th>
                  <th className="pb-2">Display name</th>
                  <th className="pb-2">Participant</th>
                  <th className="pb-2">Party ID</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.hint} className="border-b border-border/60">
                    <td className="py-2 font-medium">{row.hint}</td>
                    <td className="py-2">{row.displayName}</td>
                    <td className="py-2">{row.participant}</td>
                    <td className="py-2">
                      <code title={row.partyId ?? ""}>
                        {row.partyId ? `${row.partyId.slice(0, 14)}...` : "Pending allocation"}
                      </code>
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        {!row.partyId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyHint === row.hint}
                            onClick={() => retryAllocation(row)}
                          >
                            {busyHint === row.hint ? "…" : "Retry Canton"}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          disabled={busyHint === row.hint}
                          onClick={() => removePartner(row)}
                        >
                          <Trash2 className="mr-1 size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}

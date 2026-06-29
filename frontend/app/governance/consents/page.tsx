"use client"

import { useEffect, useState } from "react"
import { Undo2 } from "lucide-react"
import { Shell } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { usePartnerContext } from "@/contexts/partner-context"
import { api, type ConsentRecord } from "@/lib/api"

export default function ConsentsPage() {
  const { viewerHint } = usePartnerContext()
  const [rows, setRows] = useState<ConsentRecord[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setRows(await api.consents())
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load consents"),
    )
  }, [])

  async function withdraw(consentId: string) {
    setBusyId(consentId)
    setError(null)
    setMessage(null)
    try {
      await api.withdrawConsent({
        consentId,
        reason: "Consent withdrawn by recipient",
      })
      setMessage(`Consent withdrawn: ${consentId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Shell title="Consents" subtitle="Track granted, denied, and withdrawn consent records">
      <div className="space-y-4">
        {message ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2">Consent</th>
                <th className="pb-2">Permission</th>
                <th className="pb-2">Dataset</th>
                <th className="pb-2">Owner → Recipient</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Recorded</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.contractId} className="border-b border-border/60">
                  <td className="py-2">{row.consentId}</td>
                  <td className="py-2">{row.permissionId}</td>
                  <td className="py-2">{row.datasetId}</td>
                  <td className="py-2">
                    {row.ownerHint ?? row.owner} → {row.recipientHint ?? row.recipient}
                  </td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{new Date(row.recordedAt).toLocaleString()}</td>
                  <td className="py-2">
                    {row.status === "CSGranted" &&
                    viewerHint &&
                    row.recipientHint === viewerHint ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => withdraw(row.consentId)}
                        disabled={busyId === row.consentId}
                        className="bg-red-600 text-white hover:bg-red-700"
                      >
                        <Undo2 className="mr-1 size-4" />
                        Withdraw
                      </Button>
                    ) : row.status === "CSGranted" ? (
                      <span className="text-xs text-muted-foreground">
                        Recipient only
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )
}

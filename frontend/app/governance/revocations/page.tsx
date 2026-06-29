"use client"

import { useEffect, useState } from "react"
import { Shell } from "@/components/shell"
import { api, type RevocationRecord } from "@/lib/api"

export default function RevocationsPage() {
  const [rows, setRows] = useState<RevocationRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .revocations()
      .then(setRows)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load revocations"),
      )
  }, [])

  return (
    <Shell title="Revocations" subtitle="Immutable history of revoked access passports">
      <div className="space-y-4">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2">Revocation</th>
                <th className="pb-2">Permission</th>
                <th className="pb-2">Dataset</th>
                <th className="pb-2">Revoker</th>
                <th className="pb-2">Affected</th>
                <th className="pb-2">Reason</th>
                <th className="pb-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.contractId} className="border-b border-border/60">
                  <td className="py-2">{row.revocationId}</td>
                  <td className="py-2">{row.permissionId}</td>
                  <td className="py-2">{row.datasetId}</td>
                  <td className="py-2">{row.revokerHint ?? row.revoker}</td>
                  <td className="py-2">{row.affectedHint ?? row.affectedParty}</td>
                  <td className="py-2">{row.reason}</td>
                  <td className="py-2">{new Date(row.revokedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, KeyRound, Send, X } from "lucide-react"
import { Shell } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { usePartnerContext } from "@/contexts/partner-context"
import {
  api,
  type BankRecord,
  type LedgerDataset,
  type Permission,
  type SharingAgreement,
  type SharingProposal,
} from "@/lib/api"

function partyHint(row: { ownerHint?: string; owner: string }): string {
  return row.ownerHint ?? row.owner.split("::")[0]
}

function recipientPartyHint(row: { recipientHint?: string; recipient: string }): string {
  return row.recipientHint ?? row.recipient.split("::")[0]
}

function isOwnerRow<T extends { ownerHint?: string; owner: string }>(
  row: T,
  viewerHint: string | null,
): boolean {
  return !!viewerHint && partyHint(row) === viewerHint
}

function isRecipientRow<T extends { recipientHint?: string; recipient: string }>(
  row: T,
  viewerHint: string | null,
): boolean {
  return !!viewerHint && recipientPartyHint(row) === viewerHint
}

function isPartyToRow(
  row: { ownerHint?: string; owner: string; recipientHint?: string; recipient: string },
  viewerHint: string | null,
): boolean {
  return isOwnerRow(row, viewerHint) || isRecipientRow(row, viewerHint)
}

export default function AccessRequestsPage() {
  const { viewerHint, viewer } = usePartnerContext()
  const [proposals, setProposals] = useState<SharingProposal[]>([])
  const [agreements, setAgreements] = useState<SharingAgreement[]>([])
  const [datasets, setDatasets] = useState<LedgerDataset[]>([])
  const [banks, setBanks] = useState<BankRecord[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [proposalDatasetId, setProposalDatasetId] = useState("")
  const [proposalRecipientHint, setProposalRecipientHint] = useState("")
  const [proposalPurpose, setProposalPurpose] = useState("")
  const [proposalAgreementId, setProposalAgreementId] = useState("")
  const [proposalDays, setProposalDays] = useState("30")
  const [issueAgreementId, setIssueAgreementId] = useState("")
  const [issuePermissionId, setIssuePermissionId] = useState("")
  const [issueScope, setIssueScope] = useState<"ReadOnly" | "Analytics" | "FullAccess">("Analytics")
  const [consentPermissionId, setConsentPermissionId] = useState("")
  const [consentId, setConsentId] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const [sharing, datasetRows, bankRows, permissionRows] = await Promise.all([
      api.sharing(),
      api.datasets(),
      api.banks(),
      api.permissions(),
    ])
    setProposals(sharing.proposals)
    setAgreements(sharing.agreements)
    setDatasets(datasetRows)
    setBanks(bankRows)
    setPermissions(permissionRows)
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load access requests"),
    )
  }, [])

  const activeAgreements = useMemo(
    () => agreements.filter((row) => row.status === "ASActive"),
    [agreements],
  )
  const visibleProposals = useMemo(() => {
    if (!viewerHint) return proposals
    return proposals.filter((row) => isPartyToRow(row, viewerHint))
  }, [proposals, viewerHint])
  const visibleAgreements = useMemo(() => {
    if (!viewerHint) return activeAgreements
    return activeAgreements.filter((row) => isPartyToRow(row, viewerHint))
  }, [activeAgreements, viewerHint])
  const ownedDatasets = useMemo(() => {
    if (!viewerHint) return datasets
    return datasets.filter((dataset) => dataset.ownerHint === viewerHint)
  }, [datasets, viewerHint])
  const ownerAgreements = useMemo(
    () => visibleAgreements.filter((row) => isOwnerRow(row, viewerHint)),
    [visibleAgreements, viewerHint],
  )
  const recipientPendingPermissions = useMemo(() => {
    const pending = permissions.filter((permission) => permission.status === "PSPending")
    if (!viewerHint) return pending
    return pending.filter((permission) => isRecipientRow(permission, viewerHint))
  }, [permissions, viewerHint])
  const pendingPermissions = recipientPendingPermissions
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.datasetId === proposalDatasetId),
    [datasets, proposalDatasetId],
  )
  const recipientOptions = useMemo(() => {
    const owner = selectedDataset?.ownerHint ?? ""
    return banks.filter((bank) => bank.hint !== owner)
  }, [banks, selectedDataset])

  useEffect(() => {
    if (!proposalDatasetId && ownedDatasets.length > 0) {
      setProposalDatasetId(ownedDatasets[0].datasetId)
    }
  }, [ownedDatasets, proposalDatasetId])

  useEffect(() => {
    if (!issueAgreementId && ownerAgreements.length > 0) {
      setIssueAgreementId(ownerAgreements[0].agreementId)
    }
  }, [ownerAgreements, issueAgreementId])

  useEffect(() => {
    if (!proposalRecipientHint && recipientOptions.length > 0) {
      setProposalRecipientHint(recipientOptions[0].hint)
      return
    }
    if (proposalRecipientHint && !recipientOptions.some((bank) => bank.hint === proposalRecipientHint)) {
      setProposalRecipientHint(recipientOptions[0]?.hint ?? "")
    }
  }, [proposalRecipientHint, recipientOptions])

  useEffect(() => {
    if (!consentPermissionId && pendingPermissions.length > 0) {
      setConsentPermissionId(pendingPermissions[0].permissionId)
    }
  }, [pendingPermissions, consentPermissionId])

  async function accept(agreementId: string) {
    setBusyId(agreementId)
    setError(null)
    setMessage(null)
    try {
      await api.acceptSharing(agreementId)
      setMessage(`Request accepted: ${agreementId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed")
    } finally {
      setBusyId(null)
    }
  }

  function createId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}`
  }

  async function propose() {
    setBusyId("propose")
    setError(null)
    setMessage(null)
    try {
      const agreementId = proposalAgreementId || createId(`SA-${proposalDatasetId}`)
      await api.proposeSharing({
        datasetId: proposalDatasetId,
        agreementId,
        recipientHint: proposalRecipientHint,
        purpose: proposalPurpose,
        expirationDays: Number.parseInt(proposalDays, 10) || 30,
      })
      setMessage(`Sharing proposed: ${agreementId}`)
      setProposalAgreementId("")
      setProposalPurpose("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proposal failed")
    } finally {
      setBusyId(null)
    }
  }

  async function issuePermission() {
    setBusyId("issue")
    setError(null)
    setMessage(null)
    try {
      const permissionId = issuePermissionId || createId("VP")
      await api.issuePermission({
        agreementId: issueAgreementId,
        permissionId,
        accessScope: issueScope,
      })
      setMessage(`Permission issued: ${permissionId}`)
      setIssuePermissionId("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Issue permission failed")
    } finally {
      setBusyId(null)
    }
  }

  async function recordConsent() {
    setBusyId("consent")
    setError(null)
    setMessage(null)
    try {
      const newConsentId = consentId || createId("CONSENT")
      await api.recordConsent({
        permissionId: consentPermissionId,
        consentId: newConsentId,
      })
      setMessage(`Consent recorded: ${newConsentId}`)
      setConsentId("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consent failed")
    } finally {
      setBusyId(null)
    }
  }

  async function denyConsentAction() {
    if (!consentPermissionId) return
    setBusyId("deny")
    setError(null)
    setMessage(null)
    try {
      await api.denyConsent({
        permissionId: consentPermissionId,
        consentId: consentId || createId("DENY"),
        reason: "Denied from Access Requests",
      })
      setMessage(`Consent denied for ${consentPermissionId}`)
      setConsentId("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deny consent failed")
    } finally {
      setBusyId(null)
    }
  }

  async function reject(agreementId: string) {
    setBusyId(agreementId)
    setError(null)
    setMessage(null)
    try {
      await api.rejectSharing(agreementId, "Rejected by governance policy")
      setMessage(`Request rejected: ${agreementId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed")
    } finally {
      setBusyId(null)
    }
  }

  async function revokeAgreement(agreementId: string) {
    setBusyId(agreementId)
    setError(null)
    setMessage(null)
    try {
      await api.revokeAgreement(agreementId, "Agreement revoked by owner")
      setMessage(`Agreement revoked: ${agreementId}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Shell
      title="Access Requests"
      subtitle="Review pending sharing proposals and agreement-level governance actions"
    >
      <div className="space-y-6">
        {viewer ? (
          <p className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Viewing as <strong className="text-foreground">{viewer.displayName}</strong> (
            {viewer.hint}). Actions are limited to your role as dataset owner or recipient on
            each request.
          </p>
        ) : null}

        {viewerHint && ownedDatasets.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-1 text-base font-semibold">Create sharing request</h2>
          <p className="mb-3 text-xs text-muted-foreground">Dataset owner only</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Dataset</label>
              <select
                value={proposalDatasetId}
                onChange={(event) => setProposalDatasetId(event.target.value)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                {ownedDatasets.map((dataset) => (
                  <option key={dataset.contractId} value={dataset.datasetId}>
                    {dataset.datasetId}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Recipient partner</label>
              <select
                value={proposalRecipientHint}
                onChange={(event) => setProposalRecipientHint(event.target.value)}
                disabled={busyId !== null}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                {recipientOptions.map((bank) => (
                  <option key={bank.hint} value={bank.hint}>
                    {bank.displayName} ({bank.hint})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Agreement ID (optional)</label>
              <input
                value={proposalAgreementId}
                onChange={(event) => setProposalAgreementId(event.target.value)}
                placeholder="Auto-generated if blank"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Purpose</label>
              <input
                value={proposalPurpose}
                onChange={(event) => setProposalPurpose(event.target.value)}
                placeholder="e.g. KYC verification"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Expiration days</label>
              <input
                value={proposalDays}
                onChange={(event) => setProposalDays(event.target.value)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </div>
          </div>
          <div className="mt-3">
            <Button
              onClick={propose}
              disabled={busyId !== null || !proposalDatasetId || !proposalRecipientHint || !proposalPurpose}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Send className="mr-1 size-4" />
              Propose sharing
            </Button>
          </div>
        </section>
        ) : null}

        {viewerHint && ownerAgreements.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-1 text-base font-semibold">Issue Access Passport</h2>
          <p className="mb-3 text-xs text-muted-foreground">Dataset owner only</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Agreement</label>
              <select
                value={issueAgreementId}
                onChange={(event) => setIssueAgreementId(event.target.value)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                {ownerAgreements.map((agreement) => (
                  <option key={agreement.contractId} value={agreement.agreementId}>
                    {agreement.agreementId}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Permission ID (optional)</label>
              <input
                value={issuePermissionId}
                onChange={(event) => setIssuePermissionId(event.target.value)}
                placeholder="Auto-generated if blank"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Scope</label>
              <select
                value={issueScope}
                onChange={(event) =>
                  setIssueScope(event.target.value as "ReadOnly" | "Analytics" | "FullAccess")
                }
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="ReadOnly">ReadOnly</option>
                <option value="Analytics">Analytics</option>
                <option value="FullAccess">FullAccess</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <Button
              onClick={issuePermission}
              disabled={busyId !== null || !issueAgreementId}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <KeyRound className="mr-1 size-4" />
              Issue Access Passport
            </Button>
          </div>
        </section>
        ) : null}

        {viewerHint && pendingPermissions.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-1 text-base font-semibold">Record consent</h2>
          <p className="mb-3 text-xs text-muted-foreground">Recipient only</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Pending permission</label>
              <select
                value={consentPermissionId}
                onChange={(event) => setConsentPermissionId(event.target.value)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                {pendingPermissions.map((permission) => (
                  <option key={permission.contractId} value={permission.permissionId}>
                    {permission.permissionId}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Consent ID (optional)</label>
              <input
                value={consentId}
                onChange={(event) => setConsentId(event.target.value)}
                placeholder="Auto-generated if blank"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={recordConsent}
              disabled={busyId !== null || !consentPermissionId}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Check className="mr-1 size-4" />
              Record consent
            </Button>
            <Button
              onClick={denyConsentAction}
              disabled={busyId !== null || !consentPermissionId}
              variant="outline"
              className="text-destructive hover:text-destructive"
            >
              <X className="mr-1 size-4" />
              Deny consent
            </Button>
          </div>
        </section>
        ) : null}

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

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            Pending proposals ({visibleProposals.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Agreement</th>
                  <th className="pb-2">Dataset</th>
                  <th className="pb-2">Owner</th>
                  <th className="pb-2">Recipient</th>
                  <th className="pb-2">Purpose</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleProposals.map((row) => {
                  const canActAsRecipient = isRecipientRow(row, viewerHint)
                  return (
                  <tr key={row.contractId} className="border-b border-border/60">
                    <td className="py-2">{row.agreementId}</td>
                    <td className="py-2">{row.datasetId}</td>
                    <td className="py-2">{row.ownerHint ?? row.owner}</td>
                    <td className="py-2">{row.recipientHint ?? row.recipient}</td>
                    <td className="py-2">{row.purpose}</td>
                    <td className="py-2">
                      {canActAsRecipient ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => accept(row.agreementId)}
                            disabled={busyId === row.agreementId}
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <Check className="mr-1 size-4" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => reject(row.agreementId)}
                            disabled={busyId === row.agreementId}
                            className="bg-red-600 text-white hover:bg-red-700"
                          >
                            <X className="mr-1 size-4" />
                            Reject
                          </Button>
                        </div>
                      ) : isOwnerRow(row, viewerHint) ? (
                        <span className="text-xs text-muted-foreground">
                          Awaiting recipient
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            Active agreements ({visibleAgreements.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Agreement</th>
                  <th className="pb-2">Dataset</th>
                  <th className="pb-2">Owner</th>
                  <th className="pb-2">Recipient</th>
                  <th className="pb-2">Expires</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleAgreements.map((row) => {
                  const canRevoke = isOwnerRow(row, viewerHint)
                  return (
                  <tr key={row.contractId} className="border-b border-border/60">
                    <td className="py-2">{row.agreementId}</td>
                    <td className="py-2">{row.datasetId}</td>
                    <td className="py-2">{row.ownerHint ?? row.owner}</td>
                    <td className="py-2">{row.recipientHint ?? row.recipient}</td>
                    <td className="py-2">{new Date(row.expiration).toLocaleDateString()}</td>
                    <td className="py-2">
                      {canRevoke ? (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => revokeAgreement(row.agreementId)}
                          disabled={busyId === row.agreementId}
                          className="bg-red-600 text-white hover:bg-red-700"
                        >
                          <X className="mr-1 size-4" />
                          Revoke agreement
                        </Button>
                      ) : isRecipientRow(row, viewerHint) ? (
                        <span className="text-xs text-muted-foreground">Owner only</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  )
}

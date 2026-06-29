import type {
  AccessPassport,
  AuditEvent,
  ExchangeSummary,
  LedgerDataset,
  Permission,
  SharingAgreement,
  SharingProposal,
} from "@/lib/api"

export type RiskLevel = "Low" | "Medium" | "High"
export type AgreementStatus = "Active" | "Expiring" | "Revoked" | "Pending"
export type Category =
  | "KYC"
  | "TradeFinance"
  | "AI"
  | "Audit"
  | "Healthcare"
  | "General"
export type AuditAction =
  | "Dataset Registered"
  | "Dataset Shared"
  | "Sharing Accepted"
  | "Access Granted"
  | "Consent Approved"
  | "Access Modified"
  | "Access Revoked"
  | "Policy Updated"

export type ExchangeAgreement = {
  id: string
  agreementId: string
  dataset: string
  datasetId: string
  recipient: string
  owner: string
  purpose: string
  expiresInDays: number
  expiresOn: string
  risk: RiskLevel
  status: AgreementStatus
  category: Category
}

export type PassportStage =
  | "Created"
  | "Approved"
  | "Access Granted"
  | "Modified"
  | "Revoked"

export type Passport = {
  id: string
  permissionId: string
  agreementId: string
  dataset: string
  owner: string
  ownerHint: string
  recipient: string
  recipientHint: string
  purpose: string
  validUntil: string
  status: AgreementStatus
  consent: "Granted" | "Pending" | "Withdrawn"
  scope: string[]
  issueDate: string
  timeline: { stage: PassportStage; date: string; actor: string; done: boolean }[]
}

export type AuditViewEvent = {
  id: string
  txId: string | null
  occurredAt: string
  timestamp: string
  date: string
  actor: string
  organization: string
  action: AuditAction
  dataset: string
}

const actionMap: Record<string, AuditAction> = {
  DatasetRegistered: "Dataset Registered",
  SharingProposed: "Dataset Shared",
  SharingAgreementProposed: "Dataset Shared",
  SharingAccepted: "Sharing Accepted",
  SharingAgreementAccepted: "Sharing Accepted",
  PermissionIssued: "Access Granted",
  ConsentRecorded: "Consent Approved",
  ConsentDenied: "Access Revoked",
  ConsentWithdrawn: "Access Revoked",
  PermissionUpdated: "Access Modified",
  PermissionRevoked: "Access Revoked",
  AgreementRevoked: "Access Revoked",
  AgreementExpired: "Access Revoked",
  DatasetArchived: "Policy Updated",
  PolicyUpdated: "Policy Updated",
}

function parseDate(value?: string): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function daysUntil(dateIso: string): number {
  const parsed = parseDate(dateIso)
  if (!parsed) return 0
  const now = Date.now()
  const diffMs = parsed.getTime() - now
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

function friendlyDate(dateIso: string): string {
  const parsed = parseDate(dateIso)
  if (!parsed) return "—"
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function categoryFromText(value: string): Category {
  const text = value.toLowerCase()
  if (text.includes("kyc") || text.includes("identity")) return "KYC"
  if (text.includes("invoice") || text.includes("trade") || text.includes("finance")) {
    return "TradeFinance"
  }
  if (text.includes("audit")) return "Audit"
  if (
    text.includes("health") ||
    text.includes("clinical") ||
    text.includes("patient")
  ) {
    return "Healthcare"
  }
  return "AI"
}

function riskFromCategory(category: Category): RiskLevel {
  if (category === "Healthcare") return "High"
  if (category === "TradeFinance" || category === "AI") return "Medium"
  return "Low"
}

export function mapAgreementStatus(status: string, expiration: string): AgreementStatus {
  if (status === "ASRevoked") return "Revoked"
  if (status === "ASPending") return "Pending"
  const days = daysUntil(expiration)
  if (days > 0 && days <= 14) return "Expiring"
  return "Active"
}

export function mapPermissionStatus(status: string): AgreementStatus {
  if (status === "PSRevoked") return "Revoked"
  if (status === "PSPending") return "Pending"
  return "Active"
}

export function mapPassportStatus(status: string): AgreementStatus {
  if (status === "Revoked") return "Revoked"
  if (status === "PendingConsent" || status === "Denied") return "Pending"
  if (status === "Expired") return "Expiring"
  return "Active"
}

export function mapPassportsToExchange(passports: AccessPassport[]): ExchangeAgreement[] {
  return passports.map((passport) => {
    const category = (passport.useCase as Category | undefined) ?? categoryFromText(
      `${passport.purpose} ${passport.datasetId} ${passport.ownerHint} ${passport.recipientHint}`,
    )
    const expiry = friendlyDate(passport.expiresAt)
    return {
      id: passport.permissionContractId,
      agreementId: passport.agreementId,
      dataset: passport.datasetTitle ?? passport.datasetId,
      datasetId: passport.datasetId,
      recipient: passport.recipientDisplayName ?? passport.recipientHint,
      owner: passport.ownerDisplayName ?? passport.ownerHint,
      purpose: passport.purpose,
      expiresInDays: daysUntil(passport.expiresAt),
      expiresOn: expiry,
      risk: riskFromCategory(category),
      status: mapPassportStatus(passport.status),
      category,
    }
  })
}

export function mapAccessPassports(passports: AccessPassport[]): Passport[] {
  return passports.map((passport) => {
    const status = mapPassportStatus(passport.status)
    const consent =
      passport.status === "Active"
        ? "Granted"
        : passport.status === "Revoked" || passport.status === "Denied"
          ? "Withdrawn"
          : "Pending"

    const timeline = [
      {
        stage: "Created",
        date: friendlyDate(passport.issuedAt),
        actor: passport.ownerDisplayName ?? passport.ownerHint,
        done: true,
      },
      {
        stage: "Approved",
        date: friendlyDate(passport.issuedAt),
        actor: passport.ownerDisplayName ?? passport.ownerHint,
        done: true,
      },
      {
        stage: "Access Granted",
        date: friendlyDate(passport.consentRecordedAt ?? passport.issuedAt),
        actor: passport.recipientDisplayName ?? passport.recipientHint,
        done: passport.status === "Active" || passport.status === "Revoked",
      },
      {
        stage: "Modified",
        date: "—",
        actor: "—",
        done: false,
      },
      {
        stage: "Revoked",
        date: friendlyDate(passport.revokedAt ?? ""),
        actor: passport.ownerDisplayName ?? passport.ownerHint,
        done: passport.status === "Revoked",
      },
    ] as Passport["timeline"]

    return {
      id: passport.passportId,
      permissionId: passport.passportId,
      agreementId: passport.agreementId,
      dataset: passport.datasetTitle ?? passport.datasetId,
      owner: passport.ownerDisplayName ?? passport.ownerHint,
      ownerHint: passport.ownerHint,
      recipient: passport.recipientDisplayName ?? passport.recipientHint,
      recipientHint: passport.recipientHint,
      purpose: passport.purpose,
      validUntil: friendlyDate(passport.expiresAt),
      status,
      consent,
      scope: [passport.accessScope, passport.accessRights].filter(Boolean),
      issueDate: friendlyDate(passport.issuedAt),
      timeline,
    } satisfies Passport
  })
}

export function mapSharingToExchange(
  agreements: SharingAgreement[],
  proposals: SharingProposal[],
): ExchangeAgreement[] {
  const fromAgreements = agreements.map((agreement) => {
    const category = categoryFromText(
      `${agreement.purpose} ${agreement.datasetId} ${agreement.ownerHint ?? ""} ${agreement.recipientHint ?? ""}`,
    )
    return {
      id: agreement.contractId,
      agreementId: agreement.agreementId,
      dataset: agreement.datasetId,
      datasetId: agreement.datasetId,
      recipient: agreement.recipientHint ?? agreement.recipient.split("::")[0],
      owner: agreement.ownerHint ?? agreement.owner.split("::")[0],
      purpose: agreement.purpose,
      expiresInDays: daysUntil(agreement.expiration),
      expiresOn: friendlyDate(agreement.expiration),
      risk: riskFromCategory(category),
      status: mapAgreementStatus(agreement.status, agreement.expiration),
      category,
    } satisfies ExchangeAgreement
  })

  const fromProposals = proposals
    .filter(
      (proposal) =>
        !agreements.some((agreement) => agreement.agreementId === proposal.agreementId),
    )
    .map((proposal) => {
      const category = categoryFromText(
        `${proposal.purpose} ${proposal.datasetId} ${proposal.ownerHint ?? ""} ${proposal.recipientHint ?? ""}`,
      )
      return {
        id: proposal.contractId,
        agreementId: proposal.agreementId,
        dataset: proposal.datasetId,
        datasetId: proposal.datasetId,
        recipient: proposal.recipientHint ?? proposal.recipient.split("::")[0],
        owner: proposal.ownerHint ?? proposal.owner.split("::")[0],
        purpose: proposal.purpose,
        expiresInDays: daysUntil(proposal.expiration),
        expiresOn: friendlyDate(proposal.expiration),
        risk: riskFromCategory(category),
        status: "Pending",
        category,
      } satisfies ExchangeAgreement
    })

  return [...fromAgreements, ...fromProposals]
}

export function mapPermissionsToPassports(
  permissions: Permission[],
  agreements: SharingAgreement[],
): Passport[] {
  const byPermission = new Map<string, Permission>()

  for (const permission of permissions) {
    const existing = byPermission.get(permission.permissionId)
    if (!existing || existing.status === "PSPending") {
      byPermission.set(permission.permissionId, permission)
    }
  }

  return Array.from(byPermission.values()).map((permission) => {
    const agreement = agreements.find((item) => item.agreementId === permission.agreementId)
    const status = mapPermissionStatus(permission.status)
    const consent =
      permission.status === "PSActive"
        ? "Granted"
        : permission.status === "PSRevoked"
          ? "Withdrawn"
          : "Pending"

    const issued = parseDate(permission.expiresAt)
    const issueDate = issued
      ? new Date(issued.getTime() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString()
      : "—"

    const actor = permission.ownerHint ?? permission.owner.split("::")[0]
    const timeline = [
      { stage: "Created", date: issueDate, actor, done: true },
      {
        stage: "Approved",
        date: issueDate,
        actor,
        done: permission.status !== "PSPending",
      },
      {
        stage: "Access Granted",
        date: friendlyDate(permission.expiresAt),
        actor: permission.recipientHint ?? permission.recipient.split("::")[0],
        done: permission.status === "PSActive",
      },
      {
        stage: "Modified",
        date: "—",
        actor: "—",
        done: false,
      },
      {
        stage: "Revoked",
        date: permission.status === "PSRevoked" ? friendlyDate(permission.expiresAt) : "—",
        actor,
        done: permission.status === "PSRevoked",
      },
    ] as Passport["timeline"]

    return {
      id: permission.permissionId,
      permissionId: permission.permissionId,
      agreementId: permission.agreementId,
      dataset: permission.datasetId,
      owner: permission.ownerHint ?? permission.owner.split("::")[0],
      recipient: permission.recipientHint ?? permission.recipient.split("::")[0],
      purpose: agreement?.purpose ?? permission.purpose,
      validUntil: friendlyDate(permission.expiresAt),
      status,
      consent,
      scope: [permission.accessScope, permission.accessRights].filter(Boolean),
      issueDate,
      timeline,
    } satisfies Passport
  })
}

export function mapAuditEvents(events: AuditEvent[]): AuditViewEvent[] {
  return events
    .map((event) => {
      const parsed = parseDate(event.timestamp)
      const date = parsed
        ? parsed.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
          })
        : "Unknown date"
      const time = parsed
        ? parsed.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—"
      const action = actionMap[event.action] ?? "Policy Updated"

      return {
        id: event.contractId,
        txId: event.txId,
        occurredAt: event.timestamp,
        timestamp: time,
        date,
        actor: event.actorHint ?? event.actor.split("::")[0],
        organization: event.actorHint ?? event.actor.split("::")[0],
        action,
        dataset: event.datasetId,
      } satisfies AuditViewEvent
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

export function makeTrustNetworkRows(agreements: ExchangeAgreement[]) {
  const owners = Array.from(new Set(agreements.map((agreement) => agreement.owner)))
  const recipients = Array.from(
    new Set(agreements.map((agreement) => agreement.recipient)),
  )

  const ownerNodes = owners.map((owner, index) => ({
    id: `owner-${owner}`,
    label: owner,
    type: "owner" as const,
    x: 14,
    y: 20 + index * (owners.length > 1 ? 60 / (owners.length - 1) : 0),
  }))

  const recipientNodes = recipients.map((recipient, index) => ({
    id: `recipient-${recipient}`,
    label: recipient,
    type: "recipient" as const,
    x: 78,
    y: 14 + index * (72 / Math.max(1, recipients.length - 1)),
  }))

  const links = agreements.map((agreement) => ({
    from: `owner-${agreement.owner}`,
    to: `recipient-${agreement.recipient}`,
    label: agreement.purpose,
    risk: agreement.risk,
  }))

  return {
    nodes: [...ownerNodes, ...recipientNodes],
    links,
  }
}

export function datasetRowsFromLedger(datasets: LedgerDataset[]) {
  return datasets.map((dataset) => ({
    id: dataset.contractId,
    name: dataset.datasetId,
    dataFormat: dataset.dataFormat ?? "CSV",
    classification:
      dataset.classification.includes("Restricted") || dataset.classification.includes("PII")
        ? "Restricted"
        : dataset.classification.includes("Internal")
          ? "Internal"
          : "Confidential",
    owner: dataset.ownerHint ?? dataset.owner.split("::")[0],
    shares: 0,
    pii: dataset.classification.toLowerCase().includes("pii"),
    records: "—",
    lastReviewed: "—",
  }))
}

export const categories: ("All" | Category)[] = [
  "All",
  "KYC",
  "TradeFinance",
  "AI",
  "Audit",
  "Healthcare",
  "General",
]

export const complianceFrameworks = [
  { name: "GDPR", score: 96, controls: 84, passing: 81, status: "Compliant" },
  { name: "SOC 2 Type II", score: 92, controls: 64, passing: 59, status: "Compliant" },
  { name: "ISO 27001", score: 88, controls: 114, passing: 100, status: "In Review" },
  { name: "HIPAA", score: 94, controls: 54, passing: 51, status: "Compliant" },
]

export function seedSummaryFallback(summary?: ExchangeSummary) {
  return {
    activePassports: summary?.activePassports ?? 0,
    pendingRequests: summary?.pendingRequests ?? 0,
    pendingConsent: summary?.pendingConsent ?? 0,
    expiringWithin7Days: summary?.expiringWithin7Days ?? 0,
    revokedLast30Days: summary?.revokedLast30Days ?? 0,
    partnerCount: summary?.partnerCount ?? 0,
    datasetCount: summary?.datasetCount ?? 0,
  }
}

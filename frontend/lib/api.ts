export interface PartyInfo {
  hint: string
  partyId: string
  participant: string
}

export interface BankRecord {
  hint: string
  displayName: string
  description: string
  participant: string
  partyId: string | null
  createdAt: string
}

export interface BankSearchResult {
  items: BankRecord[]
  total: number
  limit: number
  offset: number
}

export type ParticipantKey =
  | "participant1"
  | "participant2"
  | "participant3"
  | "participant4"
  | "participant5"

export interface LedgerDataset {
  contractId: string
  datasetId: string
  owner: string
  ownerHint?: string
  description: string
  dataFormat?: "CSV" | "JSON" | "PDF"
  classification: string
  status: string
}

export interface DatasetUpload {
  id: number
  datasetId: string
  ownerHint: string
  fileName: string
  mimeType: string
  fileSize: number
  sha256: string
  rowCount: number | null
  isCurrent: boolean
  replacedAt: string | null
  veilioVaultId?: string
  piiFieldsTokenized?: number | null
  tokenizedColumnNames?: string[]
  createdAt: string
}

export interface SharingProposal {
  contractId: string
  agreementId: string
  datasetId: string
  owner: string
  recipient: string
  ownerHint?: string
  recipientHint?: string
  purpose: string
  expiration: string
}

export interface SharingAgreement {
  contractId: string
  agreementId: string
  datasetId: string
  owner: string
  recipient: string
  ownerHint?: string
  recipientHint?: string
  purpose: string
  status: string
  expiration: string
}

export interface Permission {
  contractId: string
  permissionId: string
  agreementId: string
  datasetId: string
  owner: string
  recipient: string
  ownerHint?: string
  recipientHint?: string
  purpose: string
  accessRights: string
  accessScope: string
  status: string
  expiresAt: string
}

export interface AuditEvent {
  contractId: string
  txId: string | null
  auditId: string
  actor: string
  actorHint?: string
  action: string
  datasetId: string
  timestamp: string
  details?: { tag?: string; value?: string } | string | null
  relatedEntityId?: string | null
}

export interface ConsentRecord {
  contractId: string
  consentId: string
  permissionId: string
  agreementId: string
  datasetId: string
  recipient: string
  owner: string
  authorizedPurpose: string
  status: string
  recordedAt: string
  ownerHint?: string
  recipientHint?: string
}

export interface RevocationRecord {
  contractId: string
  revocationId: string
  permissionId: string
  agreementId: string
  datasetId: string
  revoker: string
  affectedParty: string
  reason: string
  revokedAt: string
  revokerHint?: string
  affectedHint?: string
}

export type PassportStatus =
  | "PendingConsent"
  | "Active"
  | "Revoked"
  | "Expired"
  | "Denied"

export interface AccessPassport {
  passportId: string
  agreementId: string
  datasetId: string
  datasetTitle?: string
  useCase?: string
  ownerHint: string
  ownerDisplayName?: string
  recipientHint: string
  recipientDisplayName?: string
  purpose: string
  accessScope: "ReadOnly" | "Analytics" | "FullAccess"
  accessRights: string
  status: PassportStatus
  issuedAt: string
  expiresAt: string
  consentRecordedAt?: string
  revokedAt?: string
  revocationReason?: string
  permissionContractId: string
  consentContractId?: string
  revocationContractId?: string
  auditEventIds: string[]
}

export interface ExchangeSummary {
  activePassports: number
  pendingRequests: number
  pendingConsent: number
  expiringWithin7Days: number
  revokedLast30Days: number
  partnerCount: number
  datasetCount: number
}

export interface OwnerExposureGrant {
  passportId: string
  agreementId: string
  datasetId: string
  recipientHint: string
  recipientDisplayName?: string
  purpose: string
  accessScope: "ReadOnly" | "Analytics" | "FullAccess"
  accessRights: string
  status: PassportStatus
  issuedAt: string
  expiresAt: string
  daysUntilExpiry: number | null
  consentRecordedAt?: string
}

export interface OwnerExposurePendingShare {
  agreementId: string
  datasetId: string
  recipientHint: string
  recipientDisplayName?: string
  purpose: string
  expiration: string
  kind: "proposal" | "pending_consent"
}

export interface OwnerExposureDataset {
  datasetId: string
  datasetTitle?: string
  useCase?: string
  classification?: string
  dataFormat?: string
  grants: OwnerExposureGrant[]
  pending: OwnerExposurePendingShare[]
}

export interface OwnerExposureRecipient {
  recipientHint: string
  recipientDisplayName?: string
  activeGrants: number
  pendingGrants: number
  datasetTitles: string[]
  purposes: string[]
}

export interface OwnerExposureSummary {
  datasetsOwned: number
  datasetsWithAccess: number
  activeGrants: number
  pendingConsent: number
  pendingProposals: number
  uniqueRecipients: number
  expiringWithin7Days: number
}

export interface OwnerExposure {
  ownerHint: string
  ownerDisplayName?: string
  summary: OwnerExposureSummary
  byDataset: OwnerExposureDataset[]
  byRecipient: OwnerExposureRecipient[]
}

export interface PassportTimelineEvent {
  contractId: string
  txId: string | null
  auditId: string
  action: string
  actor: string
  actorHint?: string
  datasetId: string
  timestamp: string
  details?: string
  relatedEntityId?: string
}

export interface PassportDetail extends AccessPassport {
  timeline: PassportTimelineEvent[]
}

export type CatalogUseCase =
  | "KYC"
  | "TradeFinance"
  | "Audit"
  | "AI"
  | "Healthcare"
  | "General"

export type CatalogGovernanceStatus =
  | "Available"
  | "ProposalPending"
  | "AgreementActive"
  | "PassportPending"
  | "ConsentPending"
  | "Active"
  | "Revoked"
  | "Expired"

export interface CatalogListing {
  listingId: string
  datasetId: string
  title: string
  description: string
  classification: string
  useCase: CatalogUseCase | string
  ownerHint: string
  ownerDisplayName?: string
  defaultPurpose: string
  tokenized: boolean
  onLedger: boolean
  publishedAt: string
  viewerHint?: string
  relationship: "owner" | "recipient" | "network"
  governanceStatus: CatalogGovernanceStatus
  passportId?: string
  agreementId?: string
  recipientHint?: string
  recipientDisplayName?: string
  expiresAt?: string
  protectedFileName?: string
  protectedRowCount?: number | null
  protectedSha256?: string
  veilioVaultId?: string
  piiFieldsTokenized?: number | null
  tokenizedColumnNames?: string[]
  visibility?: "private" | "network" | "direct"
  invitedRecipientHint?: string
}

export type DatasetColumnAnalysis = {
  name: string
  suggestedTokenize: boolean
  reason: string
  sampleValues: string[]
}

export type DatasetAnalyzeResult =
  | {
      format: "CSV" | "JSON"
      columns: DatasetColumnAnalysis[]
      previewRows: Record<string, string>[]
      rowCount: number
    }
  | {
      format: "PDF"
      sealed: true
      message: string
    }

export interface DatasetPreview {
  datasetId: string
  fileName: string
  mimeType: string
  sha256: string
  format: "CSV" | "JSON" | "PDF"
  columns: string[]
  rows: Record<string, string>[]
  totalRows: number
  truncated: boolean
  maxRows: number
  accessRole: "owner" | "recipient"
  passportId?: string
  pdfBase64?: string
  sealedInVault?: boolean
  fileSize?: number
}

export interface FileAccessLog {
  id: number
  datasetId: string
  requesterHint: string
  action: "preview" | "download" | "prepare_for_llm"
  outcome: "allowed" | "denied"
  accessRole: string | null
  passportId: string | null
  reason: string | null
  createdAt: string
}

export interface LlmPrepareResult {
  datasetId: string
  fileName: string
  mimeType: string
  sha256: string
  format: "CSV" | "JSON"
  accessRole: "owner" | "recipient"
  passportId?: string
  veilioVaultId: string | null
  tokenizedColumnNames: string[]
  piiFieldsTokenized: number | null
  rowCount: number | null
  content: string
  preview: {
    columns: string[]
    rows: Record<string, string>[]
    totalRows: number
    truncated: boolean
    maxRows: number
  }
  llmUsage: {
    instruction: string
    warning: string
  }
  preparedAt: string
}

export interface CantonBootstrapInfo {
  mode?: "local" | "public"
  status?: string
  readyAt?: string
  packageId?: string
  packageIds?: string[]
  cantonScanBaseUrl?: string
  recentUpdateIds?: string[]
  partyMappings?: Record<string, string>
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api"
const AUTH_TOKEN_KEY = "veilio-exchange-auth-token"

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setStoredAuthToken(token: string): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export async function ensureAuthToken(hint: string, role: "partner" | "admin" = "partner"): Promise<string | null> {
  const existing = getStoredAuthToken()
  if (existing) return existing
  try {
    const response = await fetch(`${API_BASE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hint, role }),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { token?: string }
    if (body.token) {
      setStoredAuthToken(body.token)
      return body.token
    }
  } catch {
    return null
  }
  return null
}

type Paginated<T> = { items: T[]; total: number; limit: number; offset: number }

function isPaginated<T>(value: unknown): value is Paginated<T> {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as Paginated<T>).items)
  )
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const token = getStoredAuthToken()
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function authHeaders(): HeadersInit {
  const token = getStoredAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  cantonBootstrap: () => request<CantonBootstrapInfo>("/canton/bootstrap"),
  parties: () => request<PartyInfo[]>("/parties"),
  banks: () => request<BankRecord[]>("/banks"),
  searchBanks: (query?: { query?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams()
    if (query?.query) params.set("query", query.query)
    if (query?.limit != null) params.set("limit", String(query.limit))
    if (query?.offset != null) params.set("offset", String(query.offset))
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return request<BankSearchResult>(`/banks/search${suffix}`)
  },
  createBank: (body: {
    hint: string
    displayName: string
    description?: string
    participant: ParticipantKey
  }) =>
    request<BankRecord>("/banks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  allocateBankParty: (hint: string) =>
    request<BankRecord>(`/banks/${encodeURIComponent(hint)}/allocate`, {
      method: "POST",
    }),
  deleteBank: (hint: string) =>
    request<void>(`/banks/${encodeURIComponent(hint)}`, {
      method: "DELETE",
    }),
  datasets: async () => {
    const result = await request<LedgerDataset[] | Paginated<LedgerDataset>>("/datasets")
    return isPaginated(result) ? result.items : result
  },
  registerDataset: (body: {
    datasetId: string
    ownerHint: string
    description: string
    classification: string
    dataFormat: "CSV" | "JSON" | "PDF"
    title?: string
  }) =>
    request<{ datasetId: string; contractId: string; owner: string; updateId: string }>(
      "/datasets/register",
      { method: "POST", body: JSON.stringify(body) },
    ),
  datasetUploads: (datasetId?: string) => {
    const suffix = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : ""
    return request<DatasetUpload[]>(`/datasets/uploads${suffix}`)
  },
  uploadDatasetFile: (body: {
    datasetId: string
    ownerHint: string
    file: File
    replaceLatest?: boolean
  }) => {
    const form = new FormData()
    form.set("datasetId", body.datasetId)
    form.set("ownerHint", body.ownerHint)
    if (body.replaceLatest) {
      form.set("replaceLatest", "true")
    }
    form.set("file", body.file)
    return request<{
      uploadId: number
      datasetId: string
      ownerHint: string
      fileName: string
      fileSize: number
      mimeType: string
      sha256: string
      rowCount: number | null
      replacedPrevious: boolean
    }>("/datasets/upload", { method: "POST", body: form })
  },
  analyzeDatasetFile: (file: File) => {
    const form = new FormData()
    form.set("file", file)
    return request<DatasetAnalyzeResult>("/datasets/analyze", { method: "POST", body: form })
  },
  depositDataset: (body: {
    ownerHint: string
    file: File
    datasetId?: string
    title?: string
    description?: string
    classification?: string
    replaceLatest?: boolean
    shareScope?: "private" | "network" | "direct"
    invitedRecipientHint?: string
    sharePurpose?: string
    tokenizeColumns?: Record<string, boolean>
  }) => {
    const form = new FormData()
    form.set("ownerHint", body.ownerHint)
    form.set("file", body.file)
    if (body.datasetId) form.set("datasetId", body.datasetId)
    if (body.title) form.set("title", body.title)
    if (body.description) form.set("description", body.description)
    if (body.classification) form.set("classification", body.classification)
    if (body.shareScope) form.set("shareScope", body.shareScope)
    if (body.invitedRecipientHint) form.set("invitedRecipientHint", body.invitedRecipientHint)
    if (body.sharePurpose) form.set("sharePurpose", body.sharePurpose)
    if (body.replaceLatest) form.set("replaceLatest", "true")
    if (body.tokenizeColumns) {
      form.set("tokenizeColumns", JSON.stringify(body.tokenizeColumns))
    }
    return request<{
      datasetId: string
      uploadId: number
      fileName: string
      fileSize: number
      rowCount: number | null
      sha256: string
      listingId: string
      registered: boolean
      published: boolean
      visibility: "private" | "network" | "direct"
      veilio?: {
        vaultId: string
        tokenized: boolean
        piiFieldsDetected: string[]
        piiFieldsTokenized: number
        tokenizedColumnNames: string[]
        classification: string
        protectedFileName: string
      }
      share?: {
        agreementId: string
        passportId: string
        recipientHint: string
        status: string
      }
    }>("/datasets/deposit", { method: "POST", body: form })
  },
  shareDataset: (body: {
    datasetId: string
    ownerHint: string
    recipientHint: string
    purpose: string
    expirationDays?: number
  }) =>
    request<{
      datasetId: string
      agreementId: string
      passportId: string
      recipientHint: string
      status: "ProposalPending" | "PassportPending" | "Active"
    }>(`/datasets/${encodeURIComponent(body.datasetId)}/share`, {
      method: "POST",
      body: JSON.stringify({
        ownerHint: body.ownerHint,
        recipientHint: body.recipientHint,
        purpose: body.purpose,
        expirationDays: body.expirationDays,
      }),
    }),
  deleteDataset: (body: { datasetId: string; ownerHint: string }) =>
    request<{
      datasetId: string
      archivedContracts: number
      deletedUploads: number
      listingRemoved: boolean
    }>(`/datasets/${encodeURIComponent(body.datasetId)}`, {
      method: "DELETE",
      body: JSON.stringify({ ownerHint: body.ownerHint }),
    }),
  previewDataset: (datasetId: string, requesterHint: string, maxRows?: number) => {
    const params = new URLSearchParams({ requesterHint })
    if (maxRows != null) params.set("maxRows", String(maxRows))
    return request<DatasetPreview>(
      `/datasets/${encodeURIComponent(datasetId)}/preview?${params.toString()}`,
    )
  },
  datasetDownloadUrl: (datasetId: string, requesterHint: string) => {
    const params = new URLSearchParams({ requesterHint })
    return `${API_BASE}/datasets/${encodeURIComponent(datasetId)}/download?${params.toString()}`
  },
  downloadDataset: async (datasetId: string, requesterHint: string) => {
    const params = new URLSearchParams({ requesterHint })
    const response = await fetch(
      `${API_BASE}/datasets/${encodeURIComponent(datasetId)}/download?${params.toString()}`,
      { headers: authHeaders() },
    )
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error ?? `Download failed: ${response.status}`)
    }
    const blob = await response.blob()
    const disposition = response.headers.get("Content-Disposition") ?? ""
    const match = disposition.match(/filename="([^"]+)"/)
    const fileName = match?.[1] ?? `${datasetId}.csv`
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  },
  prepareDatasetForLlm: (
    datasetId: string,
    body: { requesterHint: string; maxPreviewRows?: number; llmProvider?: string },
  ) =>
    request<LlmPrepareResult>(`/datasets/${encodeURIComponent(datasetId)}/prepare-for-llm`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  sharing: () =>
    request<{ agreements: SharingAgreement[]; proposals: SharingProposal[] }>(
      "/sharing",
    ),
  proposeSharing: (body: {
    datasetId: string
    agreementId: string
    recipientHint: string
    purpose: string
    expirationDays?: number
  }) =>
    request<{ agreementId: string; contractId: string; owner: string; recipient: string }>(
      "/sharing/propose",
      { method: "POST", body: JSON.stringify(body) },
    ),
  acceptSharing: (agreementId: string) =>
    request<{ agreementId: string; contractId: string; recipient: string }>(
      `/sharing/${encodeURIComponent(agreementId)}/accept`,
      { method: "POST" },
    ),
  rejectSharing: (agreementId: string, reason: string) =>
    request<{ agreementId: string; recipient: string; rejected: boolean }>(
      `/sharing/${encodeURIComponent(agreementId)}/reject`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  revokeAgreement: (agreementId: string, reason: string) =>
    request<{ agreementId: string; contractId: string; owner: string; revoked: boolean }>(
      `/sharing/${encodeURIComponent(agreementId)}/revoke`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  permissions: () => request<Permission[]>("/permissions"),
  issuePermission: (body: {
    agreementId: string
    permissionId: string
    accessRights?: string
    accessScope?: string
  }) =>
    request<{ permissionId: string; contractId: string; owner: string }>(
      "/permissions/issue",
      { method: "POST", body: JSON.stringify(body) },
    ),
  recordConsent: (body: { permissionId: string; consentId: string }) =>
    request<{ permissionId: string; contractId: string; recipient: string }>(
      "/permissions/consent",
      { method: "POST", body: JSON.stringify(body) },
    ),
  denyConsent: (body: { permissionId: string; consentId: string; reason: string }) =>
    request<{
      permissionId: string
      consentId: string
      contractId: string
      recipient: string
      denied: boolean
    }>("/permissions/deny", { method: "POST", body: JSON.stringify(body) }),
  checkPermissionExpiration: (permissionId: string) =>
    request<{ permissionId: string; status: string; contractId: string; owner: string }>(
      `/permissions/${encodeURIComponent(permissionId)}/check-expiration`,
      { method: "POST" },
    ),
  renewPassport: (
    passportId: string,
    body?: { newPermissionId?: string; reason?: string },
  ) =>
    request<{
      previousPermissionId: string
      newPermissionId: string
      agreementId: string
      status: string
      owner: string
      message: string
    }>(`/passports/${encodeURIComponent(passportId)}/renew`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  sweepExpiredPermissions: () =>
    request<{
      scanned: number
      expired: Array<{ permissionId: string; status: string }>
      errors: Array<{ permissionId: string; error: string }>
    }>("/permissions/sweep-expiration", { method: "POST" }),
  revokePermission: (body: {
    permissionId: string
    revocationId: string
    reason: string
  }) =>
    request<{ permissionId: string; revocationId: string; contractId: string }>(
      "/permissions/revoke",
      { method: "POST", body: JSON.stringify(body) },
    ),
  audit: async () => {
    const result = await request<AuditEvent[] | Paginated<AuditEvent>>("/audit")
    return isPaginated(result) ? result.items : result
  },
  consents: () => request<ConsentRecord[]>("/consents"),
  withdrawConsent: (body: { consentId: string; reason: string }) =>
    request<{ consentId: string; contractId: string; recipient: string; withdrawn: boolean }>(
      "/consents/withdraw",
      { method: "POST", body: JSON.stringify(body) },
    ),
  revocations: () => request<RevocationRecord[]>("/revocations"),
  passports: async (query?: { useCase?: string; status?: string; ownerHint?: string }) => {
    const params = new URLSearchParams()
    if (query?.useCase) params.set("useCase", query.useCase)
    if (query?.status) params.set("status", query.status)
    if (query?.ownerHint) params.set("ownerHint", query.ownerHint)
    const suffix = params.toString() ? `?${params.toString()}` : ""
    const result = await request<AccessPassport[] | Paginated<AccessPassport>>(`/passports${suffix}`)
    return isPaginated(result) ? result.items : result
  },
  passport: (passportId: string) =>
    request<PassportDetail>(`/passports/${encodeURIComponent(passportId)}`),
  exchangeSummary: () => request<ExchangeSummary>("/exchange/summary"),
  ownerExposure: (ownerHint: string) =>
    request<OwnerExposure>(
      `/exchange/owner-exposure?ownerHint=${encodeURIComponent(ownerHint)}`,
    ),
  catalog: (query?: { viewerHint?: string; useCase?: string }) => {
    const params = new URLSearchParams()
    if (query?.viewerHint) params.set("viewerHint", query.viewerHint)
    if (query?.useCase) params.set("useCase", query.useCase)
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return request<CatalogListing[]>(`/catalog${suffix}`)
  },
  publishCatalogListing: (body: {
    datasetId: string
    ownerHint: string
    title: string
    description: string
    classification: string
    useCase: CatalogUseCase
    defaultPurpose: string
    tokenized?: boolean
  }) =>
    request<CatalogListing>("/catalog/publish", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  requestCatalogAccess: (
    listingId: string,
    body: { requesterHint: string; purpose?: string; expirationDays?: number },
  ) =>
    request<{
      listingId: string
      agreementId: string
      datasetId: string
      ownerHint: string
      requesterHint: string
      status: CatalogGovernanceStatus
      proposalCreated: boolean
    }>(`/catalog/${encodeURIComponent(listingId)}/request`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  seedDemo: async () => {
    await ensureAuthToken("BankA", "admin")
    return request<{
      seeded: boolean
      partners: string[]
      listings: string[]
      scenarios: Array<{
        datasetId: string
        agreementId: string
        passportId: string
        stage: string
        passportStatus: string
      }>
    }>("/demo/seed", { method: "POST" })
  },
  fileAccessLogs: (limit = 200) =>
    request<FileAccessLog[]>(`/audit/file-access?limit=${limit}`),
  exportCompliancePack: async () => {
    const response = await fetch(`${API_BASE}/compliance/export-pack`, {
      headers: authHeaders(),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error ?? `Export failed: ${response.status}`)
    }
    const blob = await response.blob()
    const disposition = response.headers.get("Content-Disposition") ?? ""
    const match = disposition.match(/filename="([^"]+)"/)
    const filename = match?.[1] ?? `veilio-exchange-compliance-${new Date().toISOString().slice(0, 10)}.json`
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  },
}
